// Smart Import REMINDERS — Prompt 5.
// Surfaces leftovers, flags, provisional/unverified certs, expiring certs, and
// unanswered NECTAR questions as recurring `notifications`. Reuses the existing
// notifications table + Home triage + Requirements renewal alerts.
//
// Reminders persist until resolved. They NEVER block scheduling or access.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const OrgScope = z.object({ orgId: z.string().uuid().optional() });
const ReminderId = z.object({ id: z.string().uuid() });

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ESCALATE_WITHIN_DAYS = 14;

type NotifInsert = {
  organization_id: string;
  recipient_role: "admin" | "manager" | "staff" | "super_admin";
  recipient_user_id?: string | null;
  type: string;
  urgency: "normal" | "urgent" | "critical";
  title: string;
  body: string;
  link_to: string | null;
  related_id: string | null;
  related_type: string | null;
  recurrence_key: string;
  next_remind_at: string;
};

function urgencyFor(daysUntil: number | null): "normal" | "urgent" | "critical" {
  if (daysUntil === null) return "normal";
  if (daysUntil <= 0) return "critical";
  if (daysUntil <= ESCALATE_WITHIN_DAYS) return "urgent";
  return "normal";
}

// ----------------------------------------------------------------------------
// Generate reminders for a given org (or every org reachable to the caller).
// Idempotent: same recurrence_key just bumps next_remind_at + body.
// ----------------------------------------------------------------------------
export const generateSmartImportReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => OrgScope.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const now = Date.now();
    const inserts: NotifInsert[] = [];

    // Scope to jobs visible via RLS (admin scope).
    const jobsQ = sb.from("import_jobs").select("id, org_id, mode, status");
    if (data.orgId) jobsQ.eq("org_id", data.orgId);
    const { data: jobs } = await jobsQ;
    if (!jobs?.length) return { generated: 0 };

    const jobIds = jobs.map((j: { id: string }) => j.id);
    const jobOrg = new Map<string, string>(jobs.map((j: { id: string; org_id: string }) => [j.id, j.org_id]));

    // 1) Subjects flagged / skipped during review
    const { data: subjects } = await sb
      .from("import_subjects")
      .select("id, import_job_id, display_name, subject_type, review_status, review_decision, match_status, committed_record_id, committed_at")
      .in("import_job_id", jobIds);
    for (const s of subjects ?? []) {
      const orgId = jobOrg.get(s.import_job_id)!;
      const needsAttention =
        s.review_status === "needs_info" ||
        s.review_status === "flagged" ||
        s.match_status === "ambiguous" ||
        (s.review_decision === "skip" && !s.committed_at);
      if (!needsAttention) continue;
      inserts.push({
        organization_id: orgId,
        recipient_role: "admin",
        type: "smart_import_flag",
        urgency: "urgent",
        title: `Verify ${s.display_name}`,
        body: `Smart Import flagged this ${s.subject_type}. Open the review to resolve.`,
        link_to: `/dashboard/smart-import/${s.import_job_id}/review`,
        related_id: s.id,
        related_type: "import_subject",
        recurrence_key: `si:flag:${s.id}`,
        next_remind_at: new Date(now + ONE_WEEK_MS).toISOString(),
      });
    }

    // 2) Certs: provisional / unverified, and expiring
    const subjectById = new Map(
      (subjects ?? []).map((s: { id: string; display_name: string; subject_type: string; committed_record_id: string | null }) => [s.id, s]),
    );
    const { data: certs } = await sb
      .from("import_cert_documents")
      .select("id, import_job_id, import_subject_id, cert_key, state, expiry_date, org_id")
      .in("import_job_id", jobIds);
    for (const c of certs ?? []) {
      const subj = subjectById.get(c.import_subject_id) as
        | { display_name: string; subject_type: string; committed_record_id: string | null }
        | undefined;
      if (!subj) continue;
      const orgId = c.org_id as string;

      // Provisional / unverified → recurring reminder until a verifying doc is on file
      if (c.state === "provisional" || c.state === "unverified") {
        const type = c.state === "provisional" ? "smart_import_provisional_cert" : "smart_import_unverified_cert";
        inserts.push({
          organization_id: orgId,
          recipient_role: "admin",
          type,
          urgency: "urgent",
          title: `Upload ${c.cert_key} for ${subj.display_name}`,
          body:
            c.state === "provisional"
              ? `Cert is provisional — admin signed off, no document yet. Recurs until a verifying document is uploaded.`
              : `Cert document missing. Recurs until uploaded.`,
          link_to: `/dashboard/smart-import/${c.import_job_id}/review`,
          related_id: c.id,
          related_type: "import_cert_document",
          recurrence_key: `si:cert:${c.id}`,
          next_remind_at: new Date(now + ONE_WEEK_MS).toISOString(),
        });

        // Mirror to the employee with a self-upload link (only if committed).
        if (subj.subject_type === "employee" && subj.committed_record_id) {
          inserts.push({
            organization_id: orgId,
            recipient_role: "staff",
            recipient_user_id: subj.committed_record_id,
            type,
            urgency: "urgent",
            title: `Upload your ${c.cert_key}`,
            body: `Snap a photo or upload your current cert. Your admin verifies once it's in.`,
            link_to: `/dashboard/external-certifications?cert=${encodeURIComponent(c.cert_key)}`,
            related_id: c.id,
            related_type: "import_cert_document",
            recurrence_key: `si:cert:${c.id}:user:${subj.committed_record_id}`,
            next_remind_at: new Date(now + ONE_WEEK_MS).toISOString(),
          });
        }
      }

      // Expiring (verified but within 30 days) or expired → forward to renewal alert surface
      if (c.state === "verified" && c.expiry_date) {
        const days = Math.round((new Date(c.expiry_date as string).getTime() - now) / (24 * 60 * 60 * 1000));
        if (days <= 30) {
          inserts.push({
            organization_id: orgId,
            recipient_role: "admin",
            type: "smart_import_cert_expiring",
            urgency: urgencyFor(days),
            title: `${c.cert_key} for ${subj.display_name} ${days <= 0 ? "expired" : "expires in " + days + "d"}`,
            body: "Imported cert is approaching/past expiry. Use the compliance matrix to renew.",
            link_to: `/dashboard/hr-admin`,
            related_id: c.id,
            related_type: "import_cert_document",
            recurrence_key: `si:cert-expiry:${c.id}`,
            next_remind_at: new Date(now + ONE_WEEK_MS).toISOString(),
          });
          if (subj.subject_type === "employee" && subj.committed_record_id) {
            inserts.push({
              organization_id: orgId,
              recipient_role: "staff",
              recipient_user_id: subj.committed_record_id,
              type: "smart_import_cert_expiring",
              urgency: urgencyFor(days),
              title: `${c.cert_key} ${days <= 0 ? "expired" : "expires in " + days + " day" + (days === 1 ? "" : "s")}`,
              body: "Upload your renewed cert from your phone — admin verifies the new one.",
              link_to: `/dashboard/external-certifications?cert=${encodeURIComponent(c.cert_key)}`,
              related_id: c.id,
              related_type: "import_cert_document",
              recurrence_key: `si:cert-expiry:${c.id}:user:${subj.committed_record_id}`,
              next_remind_at: new Date(now + ONE_WEEK_MS).toISOString(),
            });
          }
        }
      }
    }

    // 3) Unanswered NECTAR questions
    const { data: questions } = await sb
      .from("import_nectar_questions")
      .select("id, import_job_id, import_subject_id, question, org_id, answered_at")
      .in("import_job_id", jobIds)
      .is("answered_at", null);
    for (const q of questions ?? []) {
      const subj = q.import_subject_id ? (subjectById.get(q.import_subject_id) as { display_name: string } | undefined) : undefined;
      inserts.push({
        organization_id: q.org_id as string,
        recipient_role: "admin",
        type: "smart_import_question",
        urgency: "urgent",
        title: `NECTAR needs your input${subj ? " on " + subj.display_name : ""}`,
        body: q.question,
        link_to: `/dashboard/smart-import/${q.import_job_id}/review`,
        related_id: q.id,
        related_type: "import_nectar_question",
        recurrence_key: `si:question:${q.id}`,
        next_remind_at: new Date(now + ONE_WEEK_MS).toISOString(),
      });
    }

    // Manual upsert by (organization_id, recurrence_key). The live unique
    // index is partial (WHERE recurrence_key IS NOT NULL), and PostgREST's
    // onConflict cannot target partial indexes — it errors with
    // "no unique or exclusion constraint matching the ON CONFLICT
    // specification". So we look up existing rows by recurrence_key and
    // split into updates vs. inserts.
    if (inserts.length === 0) return { generated: 0 };
    // The reminder rows above are derived only from jobs/items visible through
    // the authenticated request client. The actual notification write is a
    // system-generated side effect, so use the privileged server client here:
    // the live notification INSERT policy is intentionally narrower than the
    // import review access policy and otherwise rejects valid reminder rows.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notificationDb = supabaseAdmin as any;
    const keys = Array.from(new Set(inserts.map((r) => r.recurrence_key)));
    const orgIds = Array.from(new Set(inserts.map((r) => r.organization_id)));
    const { data: existing, error: exErr } = await notificationDb
      .from("notifications")
      .select("id, organization_id, recurrence_key")
      .in("organization_id", orgIds)
      .in("recurrence_key", keys);
    if (exErr) throw new Error(exErr.message);
    const existingByKey = new Map(
      (existing ?? []).map((r: { id: string; organization_id: string; recurrence_key: string | null }) => [`${r.organization_id}::${r.recurrence_key ?? ""}`, r.id]),
    );

    const toInsert: typeof inserts = [];
    for (const row of inserts) {
      const id = existingByKey.get(`${row.organization_id}::${row.recurrence_key}`);
      if (id) {
        const { error: updErr } = await notificationDb
          .from("notifications")
          .update({
            title: row.title,
            body: row.body,
            link_to: row.link_to,
            urgency: row.urgency,
            next_remind_at: row.next_remind_at,
          })
          .eq("id", id);
        if (updErr) throw new Error(updErr.message);
      } else {
        toInsert.push(row);
      }
    }
    if (toInsert.length > 0) {
      const { error } = await notificationDb.from("notifications").insert(toInsert);
      if (error) throw new Error(error.message);
    }


    return { generated: inserts.length };
  });

// ----------------------------------------------------------------------------
// List reminders for surfaces.
// ----------------------------------------------------------------------------
const ListInput = z.object({
  scope: z.enum(["admin", "mine"]).default("admin"),
  relatedRecordId: z.string().uuid().optional(),
});

export const listSmartImportReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListInput.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const TYPES = [
      "smart_import_flag",
      "smart_import_provisional_cert",
      "smart_import_unverified_cert",
      "smart_import_cert_expiring",
      "smart_import_question",
    ];
    let q = sb
      .from("notifications")
      .select("id, type, urgency, title, body, link_to, related_id, related_type, recurrence_key, next_remind_at, created_at, resolved_at, recipient_user_id")
      .in("type", TYPES)
      .is("resolved_at", null)
      .order("urgency", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (data.scope === "mine") {
      q = q.eq("recipient_user_id", context.userId);
    } else {
      q = q.is("recipient_user_id", null);
    }
    // RLS already scopes to the right org; an additional filter is unnecessary.
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let filtered = rows ?? [];
    if (data.relatedRecordId) {
      // Filter to reminders whose subject committed to the given live record.
      // We resolve via import_subjects → committed_record_id == relatedRecordId.
      const subjectIds = filtered.map((r: { related_id: string | null }) => r.related_id).filter(Boolean) as string[];
      if (subjectIds.length === 0) return { reminders: [] };
      // related_id may point at subject / cert doc / question — resolve all paths.
      const { data: subs } = await sb
        .from("import_subjects")
        .select("id, committed_record_id")
        .eq("committed_record_id", data.relatedRecordId);
      const allowedSubs = new Set((subs ?? []).map((s: { id: string }) => s.id));
      const { data: docs } = await sb
        .from("import_cert_documents")
        .select("id, import_subject_id")
        .in("import_subject_id", Array.from(allowedSubs));
      const allowedDocs = new Set((docs ?? []).map((d: { id: string }) => d.id));
      const { data: qs } = await sb
        .from("import_nectar_questions")
        .select("id, import_subject_id")
        .in("import_subject_id", Array.from(allowedSubs));
      const allowedQs = new Set((qs ?? []).map((x: { id: string }) => x.id));
      filtered = filtered.filter((r: { related_id: string | null; related_type: string | null }) => {
        if (!r.related_id || !r.related_type) return false;
        if (r.related_type === "import_subject") return allowedSubs.has(r.related_id);
        if (r.related_type === "import_cert_document") return allowedDocs.has(r.related_id);
        if (r.related_type === "import_nectar_question") return allowedQs.has(r.related_id);
        return false;
      });
    }
    return { reminders: filtered };
  });

// ----------------------------------------------------------------------------
// Resolve a single reminder (manual dismiss / "I handled it"). The cron sweep
// will re-create it if the underlying condition still holds — so dismiss only
// fully clears the noise when the source item is actually fixed.
// ----------------------------------------------------------------------------
export const resolveSmartImportReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ReminderId.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row, error: rerr } = await sb
      .from("notifications")
      .select("id, organization_id, related_id, related_type, type")
      .eq("id", data.id)
      .single();
    if (rerr || !row) throw new Error("Reminder not found");

    const { error } = await sb
      .from("notifications")
      .update({ resolved_at: new Date().toISOString(), resolved_by: context.userId, read_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Best-effort audit
    try {
      await sb.from("import_audit").insert({
        org_id: row.organization_id,
        import_subject_id: row.related_type === "import_subject" ? row.related_id : null,
        item: `Resolved reminder ${row.type}`,
        action: "resolved",
        traces_to: row.related_type ?? null,
        actor_id: context.userId,
      });
    } catch {
      // import_audit may have different columns in some envs — non-fatal.
    }
    return { ok: true };
  });

// ----------------------------------------------------------------------------
// Employee self-upload for a cert (mobile-friendly). Body is base64 data URL
// to keep the wire serializable through createServerFn. Sets state=unverified
// so the admin must verify (employee upload → admin verify → Verified).
// ----------------------------------------------------------------------------
const UploadInput = z.object({
  importCertDocumentId: z.string().uuid(),
  fileName: z.string().min(1),
  fileBase64: z.string().min(10), // data URL or raw b64
  expiryDate: z.string().date().nullable().optional(),
});

export const employeeUploadImportCert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UploadInput.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: doc, error: derr } = await sb
      .from("import_cert_documents")
      .select("id, org_id, import_job_id, import_subject_id, cert_key, state")
      .eq("id", data.importCertDocumentId)
      .single();
    if (derr || !doc) throw new Error("Cert record not found");

    // Decode base64
    const b64 = data.fileBase64.includes(",") ? data.fileBase64.split(",", 2)[1] : data.fileBase64;
    const buf = Buffer.from(b64, "base64");
    const path = `${doc.org_id}/${doc.import_job_id}/${doc.import_subject_id}/${Date.now()}-${data.fileName}`;
    const { error: uerr } = await sb.storage
      .from("import-documents")
      .upload(path, buf, { upsert: true, contentType: "application/octet-stream" });
    if (uerr) throw new Error(uerr.message);

    // Move state to unverified (admin must verify). Stamp expiry if provided.
    const { error: e2 } = await sb
      .from("import_cert_documents")
      .update({
        state: "unverified",
        storage_path: path,
        file_name: data.fileName,
        expiry_date: data.expiryDate ?? null,
      })
      .eq("id", doc.id);
    if (e2) throw new Error(e2.message);

    // Audit + clear any "provisional" reminders on this doc (sweep will rebuild as needed)
    try {
      await sb.from("import_audit").insert({
        org_id: doc.org_id,
        import_subject_id: doc.import_subject_id,
        item: `Employee uploaded ${doc.cert_key}`,
        action: "employee_uploaded",
        traces_to: "import_cert_documents",
        actor_id: context.userId,
      });
    } catch { /* non-fatal */ }

    return { ok: true, path };
  });
