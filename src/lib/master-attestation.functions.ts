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
// REDUCED_LIABILITY_NOTICE remains exported from
// @/lib/authoritative-sources.functions for smaller in-app confirmations.
// The master attestation body below (MASTER_ATTESTATION_BODY) is the
// primary signing text and intentionally does not embed the shorter notice.

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

export interface ReviewRequirement {
  id: string;
  title: string;
  source_citation: string | null;
  satisfied_by: string;
  evidence_note: string | null;
}
export interface ReviewGroup {
  code: string; // held service code, or "__provider__" for provider-wide
  label: string;
  requirements: ReviewRequirement[];
}
export interface MasterAttestationReview {
  groups: ReviewGroup[];
  totalRequirements: number;
  heldCodes: string[];
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

// Master attestation signing text (Prompt 34). This is the PRIMARY body
// rendered above the signature block and stored on every master_attestations
// row as attestation_text. REDUCED_LIABILITY_NOTICE stays available for
// smaller in-app confirmations but is not the master signing body.
// Attestation wording pending healthcare-compliance attorney review before
// first design-partner signature.
export const MASTER_ATTESTATION_BODY = `By signing below, I confirm that I am an authorized representative of this provider agency and that I have reviewed the authoritative sources, compliance requirements, and supporting documents maintained in this system for the service codes my agency is authorized to deliver. I acknowledge that these requirements are derived from my agency's contract and State Scope of Work, and that my agency — not Hive or NECTAR — is solely responsible for meeting them, for the accuracy and completeness of all information and documents uploaded or entered, and for all submissions made to the State. I understand that Hive and NECTAR organize, surface, and help track this information but do not independently verify its accuracy, do not provide legal or compliance advice, and do not guarantee compliance with any State or federal requirement. I accept full responsibility for reviewing all forms, records, and documents for accuracy before relying on or submitting them. I understand this attestation covers the full set of requirements scoped to my authorized service codes as they exist on the date signed, and that I will be asked to re-attest when my authorized codes change, when my Scope of Work is updated, or on an annual basis.`;

function buildAttestationText(scopeCodes: string[], count: number, version: number) {
  const codes = scopeCodes.length ? scopeCodes.join(", ") : "(no held codes on file)";
  return [
    `Master compliance attestation — version ${version}`,
    `Service codes in scope: ${codes}`,
    `Requirements covered: ${count}`,
    ``,
    MASTER_ATTESTATION_BODY,
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

// Prompt 34 — "Review before signing" data source. Returns every in-scope
// requirement grouped by held service code so the provider can scroll through
// the full scoped set (titles, source citations, satisfied-by type, and
// whether an upload/attestation-type requirement has evidence on file).
// This is READ-ONLY review — the signature itself happens via
// signMasterAttestation and is ONE signature over the whole set.
export const listMasterAttestationReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MasterAttestationReview> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.orgId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const [codesRes, reqsRes] = await Promise.all([
      sb.from("provider_authorized_codes").select("code").eq("organization_id", data.orgId),
      sb
        .from("nectar_requirements")
        .select("id, title, source_citation, service_code")
        .eq("organization_id", data.orgId),
    ]);
    const held = Array.from(
      new Set<string>(((codesRes.data ?? []) as Array<{ code: string }>).map((r) => r.code)),
    ).sort();
    const heldSet = new Set(held);
    const reqs = ((reqsRes.data ?? []) as Array<{
      id: string;
      title: string;
      source_citation: string | null;
      service_code: string | null;
    }>).filter((r) => !(r.service_code && !heldSet.has(r.service_code)));

    const reqIds = reqs.map((r) => r.id);
    const [bindingsRes, docRes] = await Promise.all([
      reqIds.length
        ? sb
            .from("requirement_bindings")
            .select("requirement_id, satisfied_by")
            .in("requirement_id", reqIds)
        : Promise.resolve({ data: [] }),
      reqIds.length
        ? sb
            .from("document_attestations")
            .select("subject_ref, attested_at, attested_by_name")
            .eq("organization_id", data.orgId)
            .eq("subject_kind", "requirement")
            .in("subject_ref", reqIds)
            .order("attested_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    const bindByReq = new Map<string, string>();
    for (const b of (bindingsRes.data ?? []) as Array<{
      requirement_id: string;
      satisfied_by: string;
    }>) {
      bindByReq.set(b.requirement_id, b.satisfied_by);
    }
    const docByReq = new Map<string, { attested_at: string; attested_by_name: string | null }>();
    for (const d of (docRes.data ?? []) as Array<{
      subject_ref: string;
      attested_at: string;
      attested_by_name: string | null;
    }>) {
      if (!docByReq.has(d.subject_ref))
        docByReq.set(d.subject_ref, { attested_at: d.attested_at, attested_by_name: d.attested_by_name });
    }

    const groupMap = new Map<string, ReviewGroup>();
    for (const r of reqs) {
      const code = r.service_code ?? "__provider__";
      const label = r.service_code ?? "Provider-wide";
      if (!groupMap.has(code)) groupMap.set(code, { code, label, requirements: [] });
      const satisfied_by = bindByReq.get(r.id) ?? "unbound";
      let evidence_note: string | null = null;
      if (satisfied_by === "upload" || satisfied_by === "attestation") {
        const doc = docByReq.get(r.id);
        evidence_note = doc
          ? `On file since ${new Date(doc.attested_at).toLocaleDateString()}${doc.attested_by_name ? ` (${doc.attested_by_name})` : ""}`
          : "none on file yet";
      }
      groupMap.get(code)!.requirements.push({
        id: r.id,
        title: r.title,
        source_citation: r.source_citation,
        satisfied_by,
        evidence_note,
      });
    }

    // Sort: provider-wide first, then codes alphabetical; requirements by title.
    const groups = Array.from(groupMap.values()).sort((a, b) => {
      if (a.code === "__provider__") return -1;
      if (b.code === "__provider__") return 1;
      return a.code.localeCompare(b.code);
    });
    for (const g of groups) g.requirements.sort((a, b) => a.title.localeCompare(b.title));

    return { groups, totalRequirements: reqs.length, heldCodes: held };
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
