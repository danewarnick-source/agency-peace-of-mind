import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

export const HOST_HOME_CERT_ATTESTATION_TEXT =
  "I attest that I personally conducted this inspection, that I am not the host home staff, and that the findings recorded here are true and accurate to the best of my knowledge.";

export type HostHomeCertRow = {
  id: string;
  organization_id: string;
  client_id: string;
  hhp_cue_card_id: string | null;
  team_id: string | null;
  cert_type: "initial" | "annual";
  inspection_date: string;
  inspector_user_id: string;
  inspector_name: string;
  host_home_address: string;
  inspector_not_host_confirmed: boolean;
  attestation_confirmed: boolean;
  attestation_text: string | null;
  checklist: Record<string, { status: "meets" | "does_not_meet" | "na"; note?: string }>;
  pcsp_status: "meets" | "does_not_meet";
  pcsp_notes: string | null;
  determination: "certified" | "certified_with_corrections" | "not_certified";
  signature_name: string;
  signature_title: string;
  signed_at: string;
  guardian_acknowledgement_name: string | null;
  next_due_date: string;
  certificate_pdf_path: string | null;
  created_at: string;
  updated_at: string;
};

export type HostHomeCertConcern = {
  id: string;
  certification_id: string;
  finding: string;
  corrective_action: string;
  target_date: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
};

const concernInput = z.object({
  finding: z.string().min(1),
  corrective_action: z.string().min(1),
  target_date: z.string().nullable().optional(),
});

const checklistAnswer = z.object({
  status: z.enum(["meets", "does_not_meet", "na"]),
  note: z.string().optional(),
});

const createInput = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
  hhpCueCardId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  cert_type: z.enum(["initial", "annual"]),
  inspection_date: z.string(),
  inspector_name: z.string().min(1),
  host_home_address: z.string().min(1),
  inspector_not_host_confirmed: z.boolean(),
  attestation_confirmed: z.boolean(),
  checklist: z.record(z.string(), checklistAnswer),
  pcsp_status: z.enum(["meets", "does_not_meet"]),
  pcsp_notes: z.string().nullable().optional(),
  determination: z.enum(["certified", "certified_with_corrections", "not_certified"]),
  signature_name: z.string().min(1),
  signature_title: z.string().min(1),
  guardian_acknowledgement_name: z.string().nullable().optional(),
  concerns: z.array(concernInput).default([]),
});

/** Create a certification + concerns. Returns the new cert id. */
export const createHostHomeCertification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => createInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const isCertifying =
      data.determination === "certified" || data.determination === "certified_with_corrections";

    // Server-side gates (DB trigger backs these up; we validate first for nicer errors).
    if (isCertifying && !data.inspector_not_host_confirmed) {
      throw new Error("Inspector must confirm they are not the host home staff before certifying.");
    }
    if (isCertifying && !data.attestation_confirmed) {
      throw new Error("Required attestation must be acknowledged before certifying.");
    }
    if (isCertifying && (!data.signature_name.trim() || !data.signature_title.trim())) {
      throw new Error("Signature name and title are required to certify.");
    }

    // Every "Does Not Meet" item MUST have a note.
    for (const [code, answer] of Object.entries(data.checklist)) {
      if (answer.status === "does_not_meet" && !(answer.note ?? "").trim()) {
        throw new Error(`A note is required for every "Does Not Meet" item (missing on ${code}).`);
      }
    }
    if (data.pcsp_status === "does_not_meet" && !(data.pcsp_notes ?? "").trim()) {
      throw new Error("PCSP notes are required when marking PCSP as Does Not Meet.");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cert, error } = await (supabase as any)
      .from("host_home_certifications")
      .insert({
        organization_id: data.organizationId,
        client_id: data.clientId,
        hhp_cue_card_id: data.hhpCueCardId ?? null,
        team_id: data.teamId ?? null,
        cert_type: data.cert_type,
        inspection_date: data.inspection_date,
        inspector_user_id: userId,
        inspector_name: data.inspector_name,
        host_home_address: data.host_home_address,
        inspector_not_host_confirmed: data.inspector_not_host_confirmed,
        attestation_confirmed: data.attestation_confirmed,
        attestation_text: isCertifying ? HOST_HOME_CERT_ATTESTATION_TEXT : null,
        checklist: data.checklist,
        pcsp_status: data.pcsp_status,
        pcsp_notes: data.pcsp_notes ?? null,
        determination: data.determination,
        signature_name: data.signature_name,
        signature_title: data.signature_title,
        signed_at: new Date().toISOString(),
        guardian_acknowledgement_name: data.guardian_acknowledgement_name ?? null,
      })
      .select("id, next_due_date")
      .single();
    if (error) throw new Error(error.message);

    if (data.concerns.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: cErr } = await (supabase as any)
        .from("host_home_cert_concerns")
        .insert(
          data.concerns.map((c) => ({
            organization_id: data.organizationId,
            certification_id: cert.id,
            finding: c.finding,
            corrective_action: c.corrective_action,
            target_date: c.target_date ?? null,
          })),
        );
      if (cErr) throw new Error(cErr.message);
    }

    return { id: cert.id as string, next_due_date: cert.next_due_date as string };
  });

/** Persist the storage path of the rendered certificate PDF. */
export const setHostHomeCertificatePdfPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    certificationId: z.string().uuid(),
    path: z.string().min(1),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("host_home_certifications")
      .update({ certificate_pdf_path: data.path })
      .eq("id", data.certificationId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Resolve a single concern. */
export const resolveHostHomeCertConcern = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    concernId: z.string().uuid(),
    resolved_at: z.string(),
    resolution_notes: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("host_home_cert_concerns")
      .update({
        resolved_at: data.resolved_at,
        resolution_notes: data.resolution_notes ?? null,
      })
      .eq("id", data.concernId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
