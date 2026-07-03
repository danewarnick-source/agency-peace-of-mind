// Scoped master attestation over the requirement set (Prompt 32).
// Provider signs ONE version-stamped attestation covering their held-code
// requirement set instead of attesting to each requirement one-by-one.
// Re-attestation is required only on a delta (held-code change, in-scope
// requirement count change, or annual expiry).
//
// The per-item attestation trail (document_attestations / nectar_attestations,
// recordAttestation, etc.) is untouched — a signature here ALSO writes a
// single immutable row into the existing per-item log for audit.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { REDUCED_LIABILITY_NOTICE } from "@/lib/authoritative-sources.functions";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export interface MasterAttestationRow {
  id: string;
  organization_id: string;
  version: number;
  scope_codes: string[];
  requirement_count: number;
  attestation_text: string;
  signed_by: string;
  signed_by_name: string | null;
  signed_at: string;
  superseded_at: string | null;
}

export interface MasterAttestationStatus {
  current: MasterAttestationRow | null;
  isDue: boolean;
  dueReasons: string[];
  currentHeldCodes: string[];
  currentInScopeCount: number;
  attestationTextTemplate: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadScopeSnapshot(sb: any, orgId: string) {
  const [codesRes, reqsRes] = await Promise.all([
    sb.from("provider_authorized_codes").select("code").eq("organization_id", orgId),
    sb
      .from("nectar_requirements")
      .select("id, service_code")
      .eq("organization_id", orgId),
  ]);
  const held = Array.from(
    new Set<string>(((codesRes.data ?? []) as Array<{ code: string }>).map((r) => r.code)),
  ).sort();
  const reqs = (reqsRes.data ?? []) as Array<{ service_code: string | null }>;
  const heldSet = new Set(held);
  const inScopeCount = reqs.filter(
    (r) => !(r.service_code && !heldSet.has(r.service_code)),
  ).length;
  return { held, inScopeCount };
}

function buildAttestationText(scopeCodes: string[], count: number, version: number) {
  const codes = scopeCodes.length ? scopeCodes.join(", ") : "(no held codes on file)";
  return [
    `Master compliance attestation — version ${version}`,
    ``,
    `You are attesting, on behalf of your organization, that you have reviewed the ${count} compliance requirement${count === 1 ? "" : "s"} currently in scope for your held service codes (${codes}), and that your organization intends to meet each of them.`,
    ``,
    REDUCED_LIABILITY_NOTICE,
  ].join("\n");
}

export const getCurrentMasterAttestation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MasterAttestationStatus> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.orgId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: rows, error } = await sb
      .from("master_attestations")
      .select(
        "id, organization_id, version, scope_codes, requirement_count, attestation_text, signed_by, signed_by_name, signed_at, superseded_at",
      )
      .eq("organization_id", data.orgId)
      .is("superseded_at", null)
      .order("version", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const current = ((rows ?? [])[0] ?? null) as MasterAttestationRow | null;

    const { held, inScopeCount } = await loadScopeSnapshot(sb, data.orgId);

    const dueReasons: string[] = [];
    if (!current) {
      dueReasons.push("No master attestation on file yet.");
    } else {
      const prevCodes = [...(current.scope_codes ?? [])].sort();
      const nowCodes = [...held].sort();
      const codesChanged =
        prevCodes.length !== nowCodes.length ||
        prevCodes.some((c, i) => c !== nowCodes[i]);
      if (codesChanged) dueReasons.push("Held service codes have changed since last signing.");
      if (current.requirement_count !== inScopeCount)
        dueReasons.push(
          `In-scope requirement count changed (${current.requirement_count} → ${inScopeCount}).`,
        );
      const ageMs = Date.now() - new Date(current.signed_at).getTime();
      if (ageMs > ONE_YEAR_MS) dueReasons.push("Annual re-attestation is due (>12 months).");
    }

    const nextVersion = (current?.version ?? 0) + 1;
    return {
      current,
      isDue: dueReasons.length > 0,
      dueReasons,
      currentHeldCodes: held,
      currentInScopeCount: inScopeCount,
      attestationTextTemplate: buildAttestationText(held, inScopeCount, nextVersion),
    };
  });

export const signMasterAttestation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ row: MasterAttestationRow }> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.orgId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: isAdmin, error: roleErr } = await sb.rpc(
      "is_org_admin_or_manager",
      { _org: data.orgId, _user: userId },
    );
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden: admin or manager role required");

    const { data: prof } = await sb
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    const signerName = (prof?.full_name as string | null) ?? null;

    const { data: latestRows } = await sb
      .from("master_attestations")
      .select("id, version")
      .eq("organization_id", data.orgId)
      .order("version", { ascending: false })
      .limit(1);
    const prev = ((latestRows ?? [])[0] ?? null) as { id: string; version: number } | null;
    const nextVersion = (prev?.version ?? 0) + 1;

    const { held, inScopeCount } = await loadScopeSnapshot(sb, data.orgId);
    const text = buildAttestationText(held, inScopeCount, nextVersion);

    const { data: inserted, error: insErr } = await sb
      .from("master_attestations")
      .insert({
        organization_id: data.orgId,
        version: nextVersion,
        scope_codes: held,
        requirement_count: inScopeCount,
        attestation_text: text,
        signed_by: userId,
        signed_by_name: signerName,
      })
      .select(
        "id, organization_id, version, scope_codes, requirement_count, attestation_text, signed_by, signed_by_name, signed_at, superseded_at",
      )
      .single();
    if (insErr) throw new Error(insErr.message);

    // Mark all older non-superseded rows as superseded.
    await sb
      .from("master_attestations")
      .update({ superseded_at: new Date().toISOString() })
      .eq("organization_id", data.orgId)
      .is("superseded_at", null)
      .neq("id", inserted.id);

    // Write ONE immutable per-item log row so the existing audit trail
    // records this signature alongside every other attested action. The
    // existing per-item log is nectar_attestations (visible in the
    // Attestation log tab); document_attestations' subject_kind is a
    // restricted enum, so we use the visible log here.
    await sb.from("nectar_attestations").insert({
      organization_id: data.orgId,
      user_id: userId,
      user_display_name: signerName,
      scope: "requirement_verify",
      scope_ref_id: inserted.id,
      scope_ref_type: "master_attestation",
      statement: text,
      context: { version: nextVersion, scope_codes: held, requirement_count: inScopeCount },
    });

    return { row: inserted as MasterAttestationRow };
  });

// Resolver helper — a service_code is considered covered by the master
// attestation when a current (non-due) master attestation exists whose
// scope_codes snapshot contains that code. Provider-wide requirements
// (service_code = null) are covered whenever a current attestation exists.
export function isCodeCoveredByMasterAttestation(
  status: MasterAttestationStatus | null,
  serviceCode: string | null,
): boolean {
  if (!status || !status.current || status.isDue) return false;
  if (!serviceCode) return true;
  return (status.current.scope_codes ?? []).includes(serviceCode);
}
