import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { baselineByKey } from "@/lib/staff-training-requirements";

async function assertAdminOrManager(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  viewerId: string,
) {
  const { data: isAdmin, error } = await supabase.rpc(
    "is_org_admin_or_manager",
    { _org: orgId, _user: viewerId },
  );
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden: admin or manager role required");
}

/** Admin/manager, OR the staffer themselves when the subject is a self_attest baseline training. */
async function assertCanAttest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  viewerId: string,
  staffId: string,
  subjectKind: string,
  subjectRef: string,
) {
  if (viewerId === staffId && subjectKind === "baseline_cert") {
    const t = baselineByKey(subjectRef);
    if (t?.self_attest) return;
  }
  await assertAdminOrManager(supabase, orgId, viewerId);
}

export const recordAttestation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      staff_id: z.string().uuid(),
      subject_kind: z.enum(["baseline_cert", "checklist_doc", "training_hours"]),
      subject_ref: z.string().min(1),
      hr_document_id: z.string().uuid().nullable().optional(),
      attestation_text: z.string().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await assertCanAttest(sb, data.organization_id, userId, data.staff_id, data.subject_kind, data.subject_ref);
    const { data: prof } = await sb.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    const { error } = await sb.from("document_attestations").insert({
      organization_id: data.organization_id,
      staff_id: data.staff_id,
      subject_kind: data.subject_kind,
      subject_ref: data.subject_ref,
      hr_document_id: data.hr_document_id ?? null,
      attestation_text: data.attestation_text,
      attested_by: userId,
      attested_by_name: (prof?.full_name as string | null) ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDocumentAttestations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      staff_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: rows, error } = await sb
      .from("document_attestations")
      .select("id, subject_kind, subject_ref, hr_document_id, attestation_text, attested_by_name, attested_at")
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .order("attested_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
