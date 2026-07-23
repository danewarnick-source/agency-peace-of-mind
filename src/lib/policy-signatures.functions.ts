// Provider policy acknowledgment — resolving who's in scope, listing pending
// signatures for staff, and admin-side signature status. The actual sign
// write (policy_signatures INSERT) happens client-side in the sign routes,
// mirroring persistCompletion() in dashboard.courses.topic.$topicId.tsx —
// RLS allows a user to insert only their own row, so no server fn is needed
// for the write itself.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

export type PolicyDocRow = {
  id: string;
  organization_id: string;
  title: string;
  version: number;
  requires_acknowledgment: boolean;
  policy_assigned_groups: string[];
  policy_assigned_users: string[];
  policy_ack_cadence: string;
  gate_app_access: boolean;
  is_current: boolean;
  authoritative_kind: string | null;
};

/**
 * Resolve policy_assigned_groups / policy_assigned_users to a concrete set
 * of active org member user ids — same "all_staff" sentinel + staff_type_keys
 * overlap pattern used for forms.assigned_groups/assigned_users in
 * forms.functions.ts (publishForm's audience resolution).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolvePolicyAssignees(
  supabase: any,
  organizationId: string,
  assignedGroups: string[],
  assignedUsers: string[],
): Promise<Set<string>> {
  const targetUserIds = new Set<string>(assignedUsers ?? []);
  if ((assignedGroups ?? []).includes("all_staff")) {
    const { data: members } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("active", true);
    for (const u of members ?? []) targetUserIds.add(u.user_id as string);
  } else if ((assignedGroups ?? []).length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, staff_type_keys")
      .overlaps("staff_type_keys", assignedGroups);
    for (const p of profiles ?? []) targetUserIds.add(p.id as string);
  }
  return targetUserIds;
}

/**
 * All provider_policy documents in the org that require acknowledgment
 * (is_current only — superseded versions don't gate anything themselves;
 * the new version does).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadAckRequiredPolicies(supabase: any, organizationId: string): Promise<PolicyDocRow[]> {
  const { data, error } = await supabase
    .from("nectar_documents")
    .select(
      "id, organization_id, title, version, requires_acknowledgment, policy_assigned_groups, policy_assigned_users, policy_ack_cadence, gate_app_access, is_current, authoritative_kind",
    )
    .eq("organization_id", organizationId)
    .eq("authoritative_kind", "provider_policy")
    .eq("is_current", true)
    .eq("requires_acknowledgment", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as PolicyDocRow[];
}

// ---------- STAFF: policies pending for the current user (My Trainings hub +
// full-screen gate). Pending = required + in scope + no current signature
// for the CURRENT version of the document. ----------
export const listMyPendingPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const policies = await loadAckRequiredPolicies(supabase, data.organizationId);
    if (policies.length === 0) return { pending: [], gating: [] };

    const inScope: PolicyDocRow[] = [];
    for (const p of policies) {
      const ids = await resolvePolicyAssignees(
        supabase,
        data.organizationId,
        p.policy_assigned_groups ?? [],
        p.policy_assigned_users ?? [],
      );
      if (ids.has(userId)) inScope.push(p);
    }
    if (inScope.length === 0) return { pending: [], gating: [] };

    const { data: sigs } = await supabase
      .from("policy_signatures")
      .select("document_id")
      .eq("user_id", userId)
      .eq("is_current", true)
      .in(
        "document_id",
        inScope.map((p) => p.id),
      );
    const signedDocIds = new Set((sigs ?? []).map((s: { document_id: string }) => s.document_id));

    const pending = inScope
      .filter((p) => !signedDocIds.has(p.id))
      .map((p) => ({ id: p.id, title: p.title, version: p.version, gateAppAccess: p.gate_app_access }));

    return {
      pending,
      gating: pending.filter((p) => p.gateAppAccess).map((p) => p.id),
    };
  });

// ---------- ADMIN: signature status for a given document — every required
// staff member, whether they've signed the current version, when. ----------
export const listPolicySignatureStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error: dErr } = await supabase
      .from("nectar_documents")
      .select(
        "id, organization_id, title, version, policy_assigned_groups, policy_assigned_users, authoritative_kind",
      )
      .eq("id", data.documentId)
      .maybeSingle();
    if (dErr || !doc) throw new Error(dErr?.message ?? "Document not found");
    await requireOrgMembership(supabase, userId, doc.organization_id as string, "manager");
    if ((doc.authoritative_kind as string) !== "provider_policy") {
      throw new Error("Signature status only applies to provider_policy documents.");
    }

    const targetIds = await resolvePolicyAssignees(
      supabase,
      doc.organization_id as string,
      (doc.policy_assigned_groups as string[]) ?? [],
      (doc.policy_assigned_users as string[]) ?? [],
    );
    if (targetIds.size === 0) return { staff: [] };

    const ids = Array.from(targetIds);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    const { data: sigs } = await supabase
      .from("policy_signatures")
      .select("user_id, signed_at, document_version")
      .eq("document_id", data.documentId)
      .eq("is_current", true)
      .in("user_id", ids);
    const sigByUser = new Map(
      ((sigs ?? []) as Array<{ user_id: string; signed_at: string; document_version: number }>).map((s) => [
        s.user_id,
        s,
      ]),
    );

    const staff = ids.map((id) => {
      const p = (profiles ?? []).find((pr: { id: string }) => pr.id === id);
      const sig = sigByUser.get(id);
      return {
        userId: id,
        fullName: p?.full_name ?? null,
        email: p?.email ?? null,
        signed: !!sig,
        signedAt: sig?.signed_at ?? null,
      };
    });
    staff.sort((a, b) => (a.fullName ?? a.email ?? "").localeCompare(b.fullName ?? b.email ?? ""));
    return { staff };
  });

// ---------- Version management: link a newly-uploaded document as the next
// version of an existing provider_policy, carrying its ack config forward,
// and — when the admin checked "Require re-acknowledgment of new version" —
// archive the old version's signatures so the requirement resets to
// pending for every in-scope staff member. Hooks into the existing
// nectar_documents.version/superseded_at/superseded_by/parent_document_id
// versioning columns rather than building new versioning logic. ----------
export const supersedePolicyVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        oldDocumentId: z.string().uuid(),
        newDocumentId: z.string().uuid(),
        requireReAcknowledgment: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: oldDoc, error: oErr } = await supabase
      .from("nectar_documents")
      .select(
        "id, organization_id, version, authoritative_kind, requires_acknowledgment, policy_assigned_groups, policy_assigned_users, policy_ack_cadence, gate_app_access",
      )
      .eq("id", data.oldDocumentId)
      .maybeSingle();
    if (oErr || !oldDoc) throw new Error(oErr?.message ?? "Prior version not found");
    await requireOrgMembership(supabase, userId, oldDoc.organization_id as string, "manager");
    if ((oldDoc.authoritative_kind as string) !== "provider_policy") {
      throw new Error("Version supersede only applies to provider_policy documents.");
    }

    const nowIso = new Date().toISOString();
    const nextVersion = ((oldDoc.version as number) ?? 1) + 1;

    // New doc becomes current; carry the ack config forward so the admin
    // doesn't have to re-enter it for every version.
    const { error: newErr } = await supabase
      .from("nectar_documents")
      .update({
        authoritative_kind: "provider_policy",
        is_authoritative_source: true,
        parent_document_id: data.oldDocumentId,
        version: nextVersion,
        is_current: true,
        requires_acknowledgment: oldDoc.requires_acknowledgment,
        policy_assigned_groups: oldDoc.policy_assigned_groups,
        policy_assigned_users: oldDoc.policy_assigned_users,
        policy_ack_cadence: oldDoc.policy_ack_cadence,
        gate_app_access: oldDoc.gate_app_access,
      })
      .eq("id", data.newDocumentId);
    if (newErr) throw new Error(newErr.message);

    // Old doc is superseded.
    const { error: oldUpdErr } = await supabase
      .from("nectar_documents")
      .update({
        is_current: false,
        superseded_by: data.newDocumentId,
        superseded_at: nowIso,
      })
      .eq("id", data.oldDocumentId);
    if (oldUpdErr) throw new Error(oldUpdErr.message);

    // Archive old-version signatures (audit trail). The pending/current query
    // always checks document_id === the CURRENT version, so this is
    // belt-and-suspenders record-keeping — the reset itself falls out
    // naturally since the new document id has no signature rows yet.
    if (data.requireReAcknowledgment) {
      const { error: archiveErr } = await supabase
        .from("policy_signatures")
        .update({ is_current: false, archived_at: nowIso })
        .eq("document_id", data.oldDocumentId)
        .eq("is_current", true);
      if (archiveErr) throw new Error(archiveErr.message);
    }

    return { ok: true, newVersion: nextVersion };
  });

// ---------- Employee compliance section (dashboard.employees.$staffId.tsx):
// same signature-status shape, scoped to one staff member across every
// gating/required policy they're in scope for. ----------
export const listPolicyAcknowledgmentsForStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid(), staffUserId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const policies = await loadAckRequiredPolicies(supabase, data.organizationId);
    const inScope: PolicyDocRow[] = [];
    for (const p of policies) {
      const ids = await resolvePolicyAssignees(
        supabase,
        data.organizationId,
        p.policy_assigned_groups ?? [],
        p.policy_assigned_users ?? [],
      );
      if (ids.has(data.staffUserId)) inScope.push(p);
    }
    if (inScope.length === 0) return { policies: [] };

    const { data: sigs } = await supabase
      .from("policy_signatures")
      .select("document_id, signed_at, is_current")
      .eq("user_id", data.staffUserId)
      .eq("is_current", true)
      .in(
        "document_id",
        inScope.map((p) => p.id),
      );
    const sigByDoc = new Map(
      ((sigs ?? []) as Array<{ document_id: string; signed_at: string }>).map((s) => [s.document_id, s]),
    );

    return {
      policies: inScope.map((p) => {
        const sig = sigByDoc.get(p.id);
        return {
          documentId: p.id,
          title: p.title,
          gateAppAccess: p.gate_app_access,
          cadence: p.policy_ack_cadence,
          signed: !!sig,
          signedAt: sig?.signed_at ?? null,
        };
      }),
    };
  });
