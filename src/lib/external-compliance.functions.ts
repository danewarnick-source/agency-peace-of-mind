// ============================================================
// Prompt 36 — Internal vs. External compliance.
//
// Internal requirements: HIVE produces/holds the primary evidence
// (progress notes, EVV, 520s, daily logs). Confirmed via the
// standard confirm + applicability flow.
//
// External requirements: the compliance step happens on another
// system (UPI/USTEPS, DACS, DWS, TAPS, QuickBooks) or in the
// physical world (business license, DHS licenses, certifications).
// HIVE cannot perform them — but the admin attests they were done
// so the provider stays audit-ready.
//
// Classification + system are stored on `nectar_requirements.metadata`
// to avoid a schema migration. Attestations live in
// `nectar_attestations` with scope = 'external_completion'.
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const EXTERNAL_SYSTEMS = [
  "UPI/USTEPS",
  "DACS",
  "DWS",
  "TAPS",
  "QuickBooks",
  "DHS Licensing",
  "Physical / Off-platform",
  "Other external",
] as const;
export type ExternalSystem = (typeof EXTERNAL_SYSTEMS)[number];

export type Classification = "internal" | "external";

const SystemEnum = z.enum(EXTERNAL_SYSTEMS);
const ClassEnum = z.enum(["internal", "external"]);

// ---------- Heuristic ----------
// Used both as a fallback when an admin hasn't reviewed yet and to
// pre-populate classification for existing requirements in bulk.
interface RawRequirement {
  id: string;
  title: string | null;
  description: string | null;
  source_citation: string | null;
  metadata?: Record<string, unknown> | null;
}

export function inferClassification(
  r: Pick<RawRequirement, "title" | "description" | "source_citation">,
): { classification: Classification; externalSystem: ExternalSystem | null; confidence: "high" | "medium" | "low" } {
  const txt = `${r.title ?? ""}\n${r.description ?? ""}\n${r.source_citation ?? ""}`.toLowerCase();

  // Strong external signals — naming an external system is high confidence.
  const systemMatchers: Array<{ system: ExternalSystem; patterns: RegExp[] }> = [
    { system: "UPI/USTEPS", patterns: [/\busteps\b/, /\bupi\b/, /\busps\b/, /through upi/, /in upi/, /via upi/] },
    { system: "DACS", patterns: [/\bdacs\b/, /background\s*check/, /background\s*screen/] },
    { system: "DWS", patterns: [/\bdws\b/, /unemploy/, /workforce services/] },
    { system: "TAPS", patterns: [/\btaps\b/] },
    { system: "QuickBooks", patterns: [/quickbooks/, /\bqbo\b/, /general ledger/, /chart of accounts/] },
    { system: "DHS Licensing", patterns: [/dhs license/, /dhs licensing/, /facility license/, /provider license/] },
    {
      system: "Physical / Off-platform",
      patterns: [
        /business license/,
        /certif(ication|icate)/,
        /\bcpr\b/,
        /first aid/,
        /\bcna\b/,
        /\bmar\b certification/,
        /fingerprint/,
        /physical posting/,
        /post(ed)? in (the )?facility/,
      ],
    },
  ];

  for (const { system, patterns } of systemMatchers) {
    if (patterns.some((p) => p.test(txt))) {
      return { classification: "external", externalSystem: system, confidence: "high" };
    }
  }

  // Medium signals — verbs that imply an external action without naming a system.
  if (/\b(submit|upload|register|enroll|file|report)\b.*\b(to|with|through|via|in)\b/.test(txt)) {
    return { classification: "external", externalSystem: "Other external", confidence: "medium" };
  }

  return { classification: "internal", externalSystem: null, confidence: "high" };
}

// ---------- Reads ----------

interface AttestationRow {
  scope_ref_id: string | null;
  attested_at: string;
  user_display_name: string | null;
  statement: string;
  context: Record<string, unknown> | null;
}

export const listExternalRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: reqs, error } = await supabase
      .from("nectar_requirements")
      .select(
        "id, title, description, category, source_citation, source_document_id, jurisdiction, review_status, metadata, created_at",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Filter to external (either admin-set or heuristic-inferred).
    const enriched = (reqs ?? []).map((r) => {
      const md = (r.metadata ?? {}) as Record<string, unknown>;
      const stored = md["classification"] as Classification | undefined;
      const storedSystem = md["external_system"] as ExternalSystem | null | undefined;
      const renewalCadence = (md["renewal_cadence"] as string | null | undefined) ?? null;
      const renewalDueAt = (md["renewal_due_at"] as string | null | undefined) ?? null;
      if (stored === "internal") return null;
      let classification: Classification = stored ?? "internal";
      let externalSystem: ExternalSystem | null = storedSystem ?? null;
      let inferred = false;
      if (!stored) {
        const guess = inferClassification(r as RawRequirement);
        classification = guess.classification;
        externalSystem = guess.externalSystem;
        inferred = true;
      }
      if (classification !== "external") return null;
      return {
        id: r.id as string,
        title: r.title as string,
        description: (r.description as string | null) ?? null,
        category: (r.category as string | null) ?? null,
        source_citation: (r.source_citation as string | null) ?? null,
        source_document_id: (r.source_document_id as string | null) ?? null,
        jurisdiction: (r.jurisdiction as string | null) ?? null,
        review_status: r.review_status as string,
        external_system: externalSystem,
        classification_inferred: inferred,
        renewal_cadence: renewalCadence,
        renewal_due_at: renewalDueAt,
        created_at: r.created_at as string,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    // Latest attestation per requirement (scope = external_completion).
    const ids = enriched.map((r) => r.id);
    const attestationsByReq = new Map<string, AttestationRow>();
    if (ids.length) {
      const { data: atts } = await supabase
        .from("nectar_attestations")
        .select("scope_ref_id, attested_at, user_display_name, statement, context")
        .eq("organization_id", data.organizationId)
        .eq("scope", "external_completion")
        .in("scope_ref_id", ids)
        .order("attested_at", { ascending: false });
      for (const a of (atts ?? []) as AttestationRow[]) {
        const id = a.scope_ref_id;
        if (id && !attestationsByReq.has(id)) attestationsByReq.set(id, a);
      }
    }

    return {
      items: enriched.map((r) => {
        const last = attestationsByReq.get(r.id) ?? null;
        return {
          ...r,
          last_attestation: last
            ? {
                attested_at: last.attested_at,
                user_display_name: last.user_display_name,
                statement: last.statement,
                context: last.context ?? {},
              }
            : null,
        };
      }),
    };
  });

// ---------- Writes ----------

export const setRequirementClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requirementId: z.string().uuid(),
        classification: ClassEnum,
        externalSystem: SystemEnum.nullable().optional(),
        renewalCadence: z.string().max(80).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: req, error: rErr } = await supabase
      .from("nectar_requirements")
      .select("id, metadata")
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");
    const md = ((req.metadata as Record<string, unknown> | null) ?? {});
    const nextMd: Record<string, unknown> = {
      ...md,
      classification: data.classification,
      external_system: data.classification === "external" ? data.externalSystem ?? null : null,
    };
    if (data.renewalCadence !== undefined) nextMd["renewal_cadence"] = data.renewalCadence;
    const { error } = await supabase
      .from("nectar_requirements")
      .update({ metadata: nextMd })
      .eq("id", data.requirementId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const attestExternalCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requirementId: z.string().uuid(),
        completedOn: z.string().max(40).optional(),
        reference: z.string().max(200).optional(),
        notes: z.string().max(2000).optional(),
        proofUrl: z.string().url().max(500).optional(),
        nextRenewalAt: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error: rErr } = await supabase
      .from("nectar_requirements")
      .select("id, organization_id, title, source_citation, metadata")
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");

    const md = ((req.metadata as Record<string, unknown> | null) ?? {});
    const system = (md["external_system"] as string | null) ?? "external system";

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const userName =
      (profile?.full_name as string | null) ?? (profile?.email as string | null) ?? null;

    const statement = `Attest the external compliance step "${req.title}" was completed in ${system}${
      data.completedOn ? ` on ${data.completedOn}` : ""
    }${data.reference ? ` (ref: ${data.reference})` : ""}. HIVE is tracking this attestation; the action itself was performed outside HIVE.`;

    const { error: aErr } = await supabase.from("nectar_attestations").insert({
      organization_id: req.organization_id,
      user_id: userId,
      user_display_name: userName,
      scope: "external_completion",
      scope_ref_id: req.id,
      scope_ref_type: "nectar_requirement",
      statement,
      context: {
        requirement_title: req.title,
        source_citation: req.source_citation,
        external_system: system,
        completed_on: data.completedOn ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        proof_url: data.proofUrl ?? null,
        next_renewal_at: data.nextRenewalAt ?? null,
      },
    });
    if (aErr) throw new Error(aErr.message);

    // Roll renewal due date forward when supplied so the checklist tracks it.
    if (data.nextRenewalAt) {
      const nextMd = { ...md, renewal_due_at: data.nextRenewalAt };
      await supabase
        .from("nectar_requirements")
        .update({ metadata: nextMd })
        .eq("id", req.id);
    }

    return { ok: true };
  });

// Bulk auto-classify any requirements that don't yet carry a classification.
// Admin can always override via setRequirementClassification.
export const autoClassifyRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("nectar_requirements")
      .select("id, title, description, source_citation, metadata")
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    let classified = 0;
    let external = 0;
    for (const r of rows ?? []) {
      const md = ((r.metadata as Record<string, unknown> | null) ?? {});
      if (md["classification"]) continue;
      const guess = inferClassification(r as RawRequirement);
      const nextMd: Record<string, unknown> = {
        ...md,
        classification: guess.classification,
        external_system: guess.externalSystem,
        classification_proposed_by: "nectar",
      };
      const { error: upErr } = await supabase
        .from("nectar_requirements")
        .update({ metadata: nextMd })
        .eq("id", r.id);
      if (!upErr) {
        classified += 1;
        if (guess.classification === "external") external += 1;
      }
    }
    return { classified, external };
  });
