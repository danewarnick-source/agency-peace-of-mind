// Smart Import server functions — Prompt 2 backbone.
// Reads from / writes to the Prompt-1 staging schema only; never touches real
// client/employee records. Extraction is FAKE until Bedrock — the model call is
// isolated inside generateExtractionFromText so it can be swapped later.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ----- Input schemas -----
const ModeEnum = z.enum(["employee", "client"]);

const CreateJobInput = z.object({
  organizationId: z.string().uuid(),
  mode: ModeEnum,
  notes: z.string().max(2000).optional(),
  source: z.enum(["self_service", "white_glove"]).default("self_service"),
  scale: z.enum(["single", "bulk"]).default("single"),
  targetOrgId: z.string().uuid().optional(),
});

const RecordDocInput = z.object({
  organizationId: z.string().uuid(),
  jobId: z.string().uuid(),
  file_name: z.string().min(1).max(255),
  file_type: z.string().max(255).optional(),
  file_size: z.number().int().nonnegative().optional(),
  storage_path: z.string().min(1).max(500),
  checksum: z.string().max(128).optional(),
});

const RosterRow = z.record(z.string(), z.string());
const ExtractInput = z.object({
  organizationId: z.string().uuid(),
  jobId: z.string().uuid(),
  // For CSV/XLSX: client parsed rows + which document they came from.
  rosterBatches: z
    .array(
      z.object({
        source_document_id: z.string().uuid(),
        file_name: z.string(),
        headers: z.array(z.string()),
        rows: z.array(RosterRow),
      }),
    )
    .default([]),
  // For PDF/DOCX/paste — IDs of documents (or "paste") with their raw text.
  textBlobs: z
    .array(
      z.object({
        source_document_id: z.string().uuid().nullable(),
        file_name: z.string(),
        text: z.string().max(200_000),
      }),
    )
    .default([]),
});

const JobIdInput = z.object({ jobId: z.string().uuid() });

// ----- Known core fields per mode (schema-guided extraction targets) -----
const CORE_CLIENT = [
  "first_name", "last_name", "full_name", "date_of_birth", "phone",
  "address", "medicaid_id", "job_code", "team_name",
] as const;
const CORE_EMPLOYEE = [
  "full_name", "first_name", "last_name", "email", "phone",
  "position", "hire_date", "team_name",
] as const;

const HEURISTICS: Record<string, string[]> = {
  full_name: ["full name", "name", "worker name", "employee name", "staff name", "client name", "individual"],
  first_name: ["first", "first name", "given", "fname"],
  last_name: ["last", "last name", "surname", "lname", "family"],
  email: ["email", "e-mail", "mail"],
  phone: ["phone", "mobile", "cell", "tel", "contact"],
  position: ["position", "title", "role", "job title"],
  hire_date: ["hire", "hire date", "start date", "date of hire", "joined"],
  team_name: ["team", "facility", "location", "program", "home", "house", "group home", "site"],
  address: ["address", "street", "physical address", "residence"],
  medicaid_id: ["medicaid", "medicaid id", "client id", "member id"],
  job_code: ["job code", "service code", "auth code"],
  date_of_birth: ["dob", "date of birth", "birth date", "birthday"],
};

function guessCore(header: string, mode: "employee" | "client"): string | null {
  const norm = header.toLowerCase().trim();
  const fields = mode === "client" ? CORE_CLIENT : CORE_EMPLOYEE;
  for (const [target, kws] of Object.entries(HEURISTICS)) {
    if (!fields.includes(target as never)) continue;
    if (kws.some((kw) => norm === kw)) return target;
  }
  for (const [target, kws] of Object.entries(HEURISTICS)) {
    if (!fields.includes(target as never)) continue;
    if (kws.some((kw) => norm.includes(kw))) return target;
  }
  return null;
}

function looksMalformed(target: string, value: string): boolean {
  if (!value) return false;
  if (target === "date_of_birth" || target === "hire_date") {
    const t = Date.parse(value);
    if (isNaN(t)) return true;
    if (target === "date_of_birth" && t > Date.now()) return true;
    return false;
  }
  if (target === "phone") return value.replace(/\D/g, "").length < 7;
  if (target === "medicaid_id") return value.length < 4;
  return false;
}

function displayNameFor(row: Record<string, string>, headerToTarget: Map<string, string | null>): string {
  let fn = "", ln = "", full = "";
  for (const [h, t] of headerToTarget) {
    const v = (row[h] ?? "").trim();
    if (!v) continue;
    if (t === "first_name") fn = v;
    else if (t === "last_name") ln = v;
    else if (t === "full_name") full = v;
  }
  if (full) return full;
  if (fn || ln) return `${fn} ${ln}`.trim();
  // fall back to first non-empty cell
  for (const h of Object.keys(row)) {
    if (row[h]?.trim()) return row[h].trim();
  }
  return "Unnamed";
}

// ============================================================
// 1. Create a new import job
// ============================================================
export const createSmartImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateJobInput.parse(input))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("import_jobs")
      .insert({
        org_id: data.organizationId,
        mode: data.mode,
        source: "self_service",
        scale: "single",
        status: "draft",
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await sb.from("import_audit").insert({
      import_job_id: row.id,
      org_id: data.organizationId,
      item: `Created smart-import job (${data.mode})`,
      traces_to: "admin_override",
      actor: context.userId,
      action: "create_job",
    });

    return { jobId: row.id as string };
  });

// ============================================================
// 2. Record an uploaded document (file is already in the bucket)
// ============================================================
export const recordImportDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecordDocInput.parse(input))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("import_documents")
      .insert({
        import_job_id: data.jobId,
        org_id: data.organizationId,
        file_name: data.file_name,
        file_type: data.file_type ?? null,
        file_size: data.file_size ?? null,
        storage_path: data.storage_path,
        checksum: data.checksum ?? null,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { documentId: row.id as string };
  });

// ============================================================
// 3. Run extraction (fake/heuristic — Bedrock swaps in later)
// ============================================================
export const runSmartExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExtractInput.parse(input))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    // Fetch mode for this job
    const { data: job, error: jerr } = await sb
      .from("import_jobs")
      .select("mode, org_id, status")
      .eq("id", data.jobId)
      .single();
    if (jerr || !job) throw new Error("Job not found");
    const mode = job.mode as "employee" | "client";
    if (job.org_id !== data.organizationId) throw new Error("Org mismatch");

    await sb.from("import_jobs").update({ status: "extracting" }).eq("id", data.jobId);

    try {
      const allSubjects: Array<{ id: string; display_name: string }> = [];

      // ---- Roster batches: one subject per row ----
      for (const batch of data.rosterBatches) {
        const headerToTarget = new Map<string, string | null>(
          batch.headers.map((h) => [h, guessCore(h, mode)] as const),
        );

        // Pre-create custom-attribute marker headers (unknown columns)
        const unknownHeaders = batch.headers.filter((h) => !headerToTarget.get(h));

        for (const row of batch.rows) {
          const display = displayNameFor(row, headerToTarget);
          const { data: subj, error: serr } = await sb
            .from("import_subjects")
            .insert({
              import_job_id: data.jobId,
              org_id: data.organizationId,
              subject_type: mode,
              display_name: display,
              match_status: "new",
            })
            .select("id")
            .single();
          if (serr) throw new Error(serr.message);
          allSubjects.push({ id: subj.id, display_name: display });

          // Known core fields
          for (const [header, target] of headerToTarget) {
            if (!target) continue;
            const value = (row[header] ?? "").trim();
            if (!value) continue;
            const malformed = looksMalformed(target, value);
            await sb.from("extracted_fields").insert({
              import_job_id: data.jobId,
              import_subject_id: subj.id,
              org_id: data.organizationId,
              target_table: mode === "client" ? "clients" : "profiles",
              target_field: target,
              value,
              status: malformed ? "flag" : "placed",
              confidence: malformed ? 0.55 : 0.92,
              source_document_id: batch.source_document_id,
              source_snippet: `${header}: ${value}`,
              provenance: "source",
              is_custom_attribute: false,
            });
          }

          // Unknown columns -> custom attributes
          for (const header of unknownHeaders) {
            const value = (row[header] ?? "").trim();
            if (!value) continue;
            await sb.from("extracted_fields").insert({
              import_job_id: data.jobId,
              import_subject_id: subj.id,
              org_id: data.organizationId,
              target_table: mode === "client" ? "clients" : "profiles",
              target_field: header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
              value,
              status: "review",
              confidence: 0.7,
              source_document_id: batch.source_document_id,
              source_snippet: `${header}: ${value}`,
              provenance: "inferred",
              is_custom_attribute: true,
            });
          }
        }
      }

      // ---- Text blobs: one subject each (fake AI extraction) ----
      for (const blob of data.textBlobs) {
        const extracted = generateExtractionFromText(blob.text, mode);
        const { data: subj, error: serr } = await sb
          .from("import_subjects")
          .insert({
            import_job_id: data.jobId,
            org_id: data.organizationId,
            subject_type: mode,
            display_name: extracted.display_name,
            match_status: "new",
          })
          .select("id")
          .single();
        if (serr) throw new Error(serr.message);
        allSubjects.push({ id: subj.id, display_name: extracted.display_name });

        for (const f of extracted.fields) {
          await sb.from("extracted_fields").insert({
            import_job_id: data.jobId,
            import_subject_id: subj.id,
            org_id: data.organizationId,
            target_table: mode === "client" ? "clients" : "profiles",
            target_field: f.target_field,
            value: f.value,
            status: f.status,
            confidence: f.confidence,
            source_document_id: blob.source_document_id,
            source_snippet: f.snippet,
            provenance: f.provenance,
            is_custom_attribute: f.is_custom,
          });
        }
        for (const leftover of extracted.unfiled) {
          await sb.from("unfiled_items").insert({
            import_job_id: data.jobId,
            import_subject_id: subj.id,
            org_id: data.organizationId,
            text: leftover,
            source_document_id: blob.source_document_id,
          });
        }
      }

      // ---- Dedup / match (read-only against real tables) ----
      let matchedCount = 0;
      let ambiguousCount = 0;
      for (const s of allSubjects) {
        // pull this subject's placed fields
        const { data: fields } = await sb
          .from("extracted_fields")
          .select("target_field, value")
          .eq("import_subject_id", s.id);
        const map = new Map<string, string>();
        for (const f of fields ?? []) map.set(f.target_field, f.value);

        let matchedId: string | null = null;
        let ambiguous = false;

        if (mode === "client") {
          const mid = map.get("medicaid_id");
          if (mid) {
            const { data: rows } = await sb
              .from("clients")
              .select("id")
              .eq("organization_id", data.organizationId)
              .eq("medicaid_id", mid)
              .limit(2);
            if (rows && rows.length === 1) matchedId = rows[0].id;
            else if (rows && rows.length > 1) ambiguous = true;
          }
          if (!matchedId && !ambiguous) {
            const fn = map.get("first_name");
            const ln = map.get("last_name");
            const dob = map.get("date_of_birth");
            if (fn && ln && dob) {
              const { data: rows } = await sb
                .from("clients")
                .select("id")
                .eq("organization_id", data.organizationId)
                .ilike("first_name", fn)
                .ilike("last_name", ln)
                .limit(2);
              if (rows && rows.length === 1) matchedId = rows[0].id;
              else if (rows && rows.length > 1) ambiguous = true;
            }
          }
        } else {
          const email = map.get("email");
          if (email) {
            const { data: rows } = await sb
              .from("profiles")
              .select("id")
              .ilike("email", email)
              .limit(2);
            if (rows && rows.length === 1) matchedId = rows[0].id;
            else if (rows && rows.length > 1) ambiguous = true;
          }
        }

        const match_status = matchedId ? "matched_existing" : ambiguous ? "ambiguous" : "new";
        if (matchedId) matchedCount++;
        if (ambiguous) ambiguousCount++;
        await sb
          .from("import_subjects")
          .update({ match_status, matched_record_id: matchedId })
          .eq("id", s.id);
      }

      await sb.from("import_jobs").update({ status: "in_review" }).eq("id", data.jobId);

      await sb.from("import_audit").insert({
        import_job_id: data.jobId,
        org_id: data.organizationId,
        item: `Extraction complete: ${allSubjects.length} subject(s), ${matchedCount} matched, ${ambiguousCount} ambiguous`,
        traces_to: "inferred",
        actor: context.userId,
        action: "extraction_complete",
      });

      return {
        subjects: allSubjects.length,
        matched: matchedCount,
        ambiguous: ambiguousCount,
        status: "in_review" as const,
      };
    } catch (e) {
      // Preserve upload, allow retry
      await sb.from("import_jobs").update({ status: "draft" }).eq("id", data.jobId);
      await sb.from("import_audit").insert({
        import_job_id: data.jobId,
        org_id: data.organizationId,
        item: `Extraction failed: ${(e as Error).message}`,
        traces_to: "inferred",
        actor: context.userId,
        action: "extraction_failed",
      });
      throw e;
    }
  });

// ============================================================
// 4. Read job summary (for end-of-flow screen and polling)
// ============================================================
export const getSmartImportSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => JobIdInput.parse(input))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: job } = await sb
      .from("import_jobs")
      .select("id, status, mode")
      .eq("id", data.jobId)
      .single();
    if (!job) throw new Error("Job not found");

    const [{ count: docCount }, { count: subjCount }, { data: subjects }, { count: reviewCount }] = await Promise.all([
      sb.from("import_documents").select("id", { count: "exact", head: true }).eq("import_job_id", data.jobId),
      sb.from("import_subjects").select("id", { count: "exact", head: true }).eq("import_job_id", data.jobId),
      sb.from("import_subjects").select("match_status").eq("import_job_id", data.jobId),
      sb.from("extracted_fields").select("id", { count: "exact", head: true })
        .eq("import_job_id", data.jobId).in("status", ["review", "flag"]),
    ]);

    const matchedExisting = (subjects ?? []).filter((s: { match_status: string }) => s.match_status === "matched_existing").length;
    return {
      jobId: data.jobId,
      status: job.status as string,
      mode: job.mode as "employee" | "client",
      documents: docCount ?? 0,
      subjects: subjCount ?? 0,
      matched_existing: matchedExisting,
      review_items: reviewCount ?? 0,
    };
  });

// ============================================================
// FAKE EXTRACTION SERVICE (swap for Bedrock later)
// Isolated so the real implementation can replace this single function.
// ============================================================
type FakeField = {
  target_field: string;
  value: string;
  status: "placed" | "review" | "flag";
  confidence: number;
  snippet: string;
  provenance: "source" | "inferred" | "rule";
  is_custom: boolean;
};

function generateExtractionFromText(
  text: string,
  mode: "employee" | "client",
): { display_name: string; fields: FakeField[]; unfiled: string[] } {
  const fields: FakeField[] = [];
  const unfiled: string[] = [];

  const nameMatch =
    /name[:\s]+([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3})/i.exec(text) ??
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/.exec(text);
  const display = nameMatch?.[1]?.trim() || "Imported subject";

  if (nameMatch?.[1]) {
    const parts = nameMatch[1].trim().split(/\s+/);
    if (parts.length >= 2) {
      fields.push({
        target_field: "first_name", value: parts[0], status: "placed", confidence: 0.9,
        snippet: nameMatch[0], provenance: "source", is_custom: false,
      });
      fields.push({
        target_field: "last_name", value: parts[parts.length - 1], status: "placed", confidence: 0.9,
        snippet: nameMatch[0], provenance: "source", is_custom: false,
      });
    } else {
      fields.push({
        target_field: "full_name", value: nameMatch[1], status: "placed", confidence: 0.85,
        snippet: nameMatch[0], provenance: "source", is_custom: false,
      });
    }
  }

  const email = /([\w.+-]+@[\w-]+\.[\w.-]+)/.exec(text)?.[1];
  if (email && mode === "employee") {
    fields.push({
      target_field: "email", value: email, status: "placed", confidence: 0.95,
      snippet: email, provenance: "source", is_custom: false,
    });
  }

  const phone = /(\+?\d[\d\s().-]{7,}\d)/.exec(text)?.[1];
  if (phone) {
    fields.push({
      target_field: "phone", value: phone.trim(), status: "placed", confidence: 0.85,
      snippet: phone, provenance: "source", is_custom: false,
    });
  }

  if (mode === "client") {
    const medicaid = /(?:medicaid|member|client)\s*(?:id|#)[:\s]+([A-Z0-9-]{4,})/i.exec(text)?.[1];
    if (medicaid) {
      fields.push({
        target_field: "medicaid_id", value: medicaid, status: "placed", confidence: 0.9,
        snippet: medicaid, provenance: "source", is_custom: false,
      });
    }
    const dob = /(?:dob|date of birth)[:\s]+([\d/.-]{6,10})/i.exec(text)?.[1];
    if (dob) {
      const malformed = looksMalformed("date_of_birth", dob);
      fields.push({
        target_field: "date_of_birth", value: dob,
        status: malformed ? "flag" : "placed",
        confidence: malformed ? 0.5 : 0.88,
        snippet: dob, provenance: "source", is_custom: false,
      });
    }
  } else {
    const hire = /(?:hire date|start date)[:\s]+([\d/.-]{6,10})/i.exec(text)?.[1];
    if (hire) {
      const malformed = looksMalformed("hire_date", hire);
      fields.push({
        target_field: "hire_date", value: hire,
        status: malformed ? "flag" : "placed",
        confidence: malformed ? 0.5 : 0.85,
        snippet: hire, provenance: "source", is_custom: false,
      });
    }
  }

  // Anything that mentions allergies / notes / preferences becomes a custom attribute
  const customMatch = /(allerg(?:y|ies)|preference|notes?)[:\s]+([^\n.]{2,120})/i.exec(text);
  if (customMatch) {
    fields.push({
      target_field: customMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      value: customMatch[2].trim(),
      status: "review",
      confidence: 0.7,
      snippet: customMatch[0],
      provenance: "inferred",
      is_custom: true,
    });
  }

  // Anything else that's a sentence with no recognized pattern → unfiled
  const sentences = text.split(/[\n.]+/).map((s) => s.trim()).filter((s) => s.length > 8 && s.length < 200);
  for (const s of sentences.slice(0, 3)) {
    if (fields.some((f) => f.snippet.includes(s.slice(0, 12)))) continue;
    unfiled.push(s);
  }

  return { display_name: display, fields, unfiled };
}
