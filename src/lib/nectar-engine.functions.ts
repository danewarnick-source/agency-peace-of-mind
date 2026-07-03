import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

// =============================================================
// Foundation D — NECTAR Requirements Engine.
// Maps confirmed requirements to provider entities (codes/roles/clients/
// provider-level) so downstream surfaces (audit checklist, billing
// readiness, staff app, tasks) consult ONE place for "what applies?".
// NECTAR proposes mappings; admin confirms or corrects. Nothing silent.
// =============================================================

const SCOPE_KINDS = ["provider", "code", "role", "client", "unknown"] as const;
type ScopeKind = (typeof SCOPE_KINDS)[number];

interface OrgEntityFacts {
  // Every code the provider is contracted/authorized to provide (active + dormant).
  // NECTAR scopes coverage against this superset so a dormant code keeps its
  // requirements live and doesn't lose audit protection when activated later.
  codes: string[];
  activeCodes: string[]; // currently attached to a client
  dormantCodes: string[]; // authorized but not currently in use
  roles: string[];
  clientCount: number;
  jurisdictions: string[];
}

// ---------- Inventory of org's contracted entities (used to ground AI proposals) ----------

async function gatherOrgFacts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
): Promise<OrgEntityFacts> {
  const [billingCodesRes, clientAuthRes, authorizedRes, staffRes, clientsRes] =
    await Promise.all([
      supabase
        .from("client_billing_codes")
        .select("service_code")
        .eq("organization_id", organizationId),
      supabase
        .from("clients")
        .select("authorized_dspd_codes, job_code")
        .eq("organization_id", organizationId),
      supabase
        .from("provider_authorized_codes")
        .select("code, status")
        .eq("organization_id", organizationId),
      supabase
        .from("organization_members")
        .select("role, job_title")
        .eq("organization_id", organizationId)
        .eq("active", true),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),
    ]);

  const norm = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : "");

  // "Active" = some client is currently set up to use it.
  const activeSet = new Set<string>();
  for (const r of (billingCodesRes.data ?? []) as Array<{ service_code: string | null }>) {
    const c = norm(r.service_code);
    if (c) activeSet.add(c);
  }
  for (const r of (clientAuthRes.data ?? []) as Array<{
    authorized_dspd_codes: string[] | null;
    job_code: string[] | null;
  }>) {
    for (const c of r.authorized_dspd_codes ?? []) {
      const v = norm(c);
      if (v) activeSet.add(v);
    }
    for (const c of r.job_code ?? []) {
      const v = norm(c);
      if (v) activeSet.add(v);
    }
  }

  // Provider-level authorized set (contract/SOW/addendum/manual entries).
  const authorizedSet = new Set<string>();
  const authorizedStatus = new Map<string, string>();
  for (const r of (authorizedRes.data ?? []) as Array<{
    code: string | null;
    status: string | null;
  }>) {
    const c = norm(r.code);
    if (!c) continue;
    authorizedSet.add(c);
    authorizedStatus.set(c, r.status ?? "dormant");
  }

  // Union — coverage follows the contract, not current activity.
  const codes = Array.from(new Set<string>([...activeSet, ...authorizedSet]));
  const activeCodes = codes.filter(
    (c) => activeSet.has(c) || authorizedStatus.get(c) === "active",
  );
  const dormantCodes = codes.filter((c) => !activeCodes.includes(c));

  const roleSet = new Set<string>();
  for (const m of (staffRes.data ?? []) as Array<{
    role: string | null;
    job_title: string | null;
  }>) {
    if (m.role) roleSet.add(m.role.toUpperCase());
    const jt = (m.job_title ?? "").toUpperCase();
    if (!jt) continue;
    for (const key of ["DSP", "SLM", "HHP", "BCBA", "BC", "RN", "LPN", "QIDP"]) {
      if (jt.includes(key)) roleSet.add(key);
    }
  }

  return {
    codes,
    activeCodes,
    dormantCodes,
    roles: Array.from(roleSet),
    clientCount: clientsRes.count ?? 0,
    jurisdictions: ["UT-DSPD"],
  };
}

// ---------- AI proposer ----------

const MAP_SYSTEM_PROMPT = `You are NECTAR, mapping a confirmed COMPLIANCE REQUIREMENT to the parts of a provider's operation it actually governs.

Given:
- the requirement text + citation
- the provider's CONTRACTED entities — every DSPD service code the provider is authorized to deliver (whether currently in use or dormant), staff roles/credentials present, client count

Coverage follows the contract, not current activity. A dormant code (authorized but not currently in use) MUST still get its requirements mapped — when that code is later activated the rules must already be live.

Decide the SCOPE(S) the requirement applies to. A requirement may have multiple scopes.



Scope kinds:
- "provider"   — agency-wide (e.g. Internal Quality Management Plan, Emergency Management Plan)
- "code"       — triggered only when a specific service code is in use (scope_value = code, e.g. "HHS", "PPS", "SE", "RN")
- "role"       — triggered only when a specific staff role/credential is present (scope_value = role key, e.g. "BCBA", "RN", "LPN", "DSP")
- "client"     — per-client obligation/cadence (scope_value = "*" meaning every client). Use cadence to encode "annual", "quarterly", "per shift", etc.
- "unknown"    — you cannot confidently determine; flag for admin review

Return STRICT JSON only:
{
  "mappings": [
    {
      "scope_kind": "provider" | "code" | "role" | "client" | "unknown",
      "scope_value": "string or null (null for provider/unknown; the code/role key for code/role; '*' for client)",
      "cadence": "annual" | "quarterly" | "monthly" | "weekly" | "per_shift" | "once" | null,
      "rationale": "one short sentence explaining why, referencing the requirement text",
      "source_excerpt": "<=200 char quote or paraphrase from the requirement"
    }
  ]
}

Rules:
- ONLY use scope_value codes/roles that appear in the provider's CONTRACTED entity list (active OR dormant) — do not invent new codes. If the requirement references a code/role the provider isn't contracted for at all, return "unknown" with a rationale.
- Dormant (authorized-but-unused) codes are valid scope_values — map to them anyway so coverage is in place when they activate.
- Prefer the narrowest correct scope. A requirement that only applies under HHS is "code"+"HHS", not "provider".
- If the requirement is genuinely agency-wide, return ONE provider mapping.
- Output at most 6 mappings.`;

const MapItem = z.object({
  scope_kind: z.enum(SCOPE_KINDS),
  scope_value: z.string().max(80).nullable().optional(),
  cadence: z
    .enum(["annual", "quarterly", "monthly", "weekly", "per_shift", "once"])
    .nullable()
    .optional(),
  rationale: z.string().max(400).optional().nullable(),
  source_excerpt: z.string().max(400).optional().nullable(),
});
const MapResp = z.object({ mappings: z.array(MapItem).max(6).default([]) });

async function aiPropose(
  reqTitle: string,
  reqDescription: string | null,
  citation: string | null,
  facts: OrgEntityFacts,
) {
  // AI credentials are validated inside the Bedrock adapter (fails loudly).
  const userBody = `REQUIREMENT TITLE: ${reqTitle}
DESCRIPTION: ${reqDescription ?? "—"}
CITATION: ${citation ?? "—"}

PROVIDER ENTITIES:
- Contracted service codes (active OR dormant — coverage applies to both): ${facts.codes.length ? facts.codes.join(", ") : "(none configured)"}
  · Active (in use today): ${facts.activeCodes.length ? facts.activeCodes.join(", ") : "(none)"}
  · Dormant (authorized, not currently used — still must be covered): ${facts.dormantCodes.length ? facts.dormantCodes.join(", ") : "(none)"}
- Staff roles/credentials present: ${facts.roles.length ? facts.roles.join(", ") : "(none configured)"}
- Client count: ${facts.clientCount}
- Jurisdictions: ${facts.jurisdictions.join(", ")}`;

  const { callBedrockChatCompletions, BedrockError } = await import("@/lib/ai-bedrock.server");
  let json;
  try {
    json = await callBedrockChatCompletions({
      messages: [
        { role: "system", content: MAP_SYSTEM_PROMPT },
        { role: "user", content: userBody },
      ],
      response_format: { type: "json_object" },
    });
  } catch (e) {
    if (e instanceof BedrockError) {
      if (e.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
      throw new Error(e.message);
    }
    throw e;
  }
  const raw: unknown = (() => {
    try {
      return JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    } catch {
      return {};
    }
  })();
  const parsed = MapResp.safeParse(raw);
  return parsed.success ? parsed.data.mappings : [];
}

// ---------- Server functions ----------

export const proposeRequirementMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ requirementId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error: rErr } = await supabase
      .from("nectar_requirements")
      .select(
        "id, organization_id, title, description, source_citation, jurisdiction",
      )
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");
    await requireOrgMembership(supabase, userId, req.organization_id as string, "manager");

    const facts = await gatherOrgFacts(supabase, req.organization_id as string);
    const proposals = await aiPropose(
      req.title as string,
      (req.description as string | null) ?? null,
      (req.source_citation as string | null) ?? null,
      facts,
    );

    // Normalize + filter: drop code/role scopes whose value isn't in the live set.
    const normalized = proposals
      .map((p) => {
        const kind = p.scope_kind as ScopeKind;
        let value = (p.scope_value ?? "").trim().toUpperCase() || null;
        if (kind === "provider" || kind === "unknown") value = null;
        if (kind === "client") value = "*";
        if (kind === "code" && (!value || !facts.codes.includes(value))) {
          return {
            scope_kind: "unknown" as ScopeKind,
            scope_value: null,
            cadence: p.cadence ?? null,
            rationale: `Requirement references code "${p.scope_value ?? "?"}" which isn't in the provider's contracted code set — flagged for review.`,
            source_excerpt: p.source_excerpt ?? null,
          };
        }
        if (kind === "role" && (!value || !facts.roles.includes(value))) {
          return {
            scope_kind: "unknown" as ScopeKind,
            scope_value: null,
            cadence: p.cadence ?? null,
            rationale: `Requirement references role "${p.scope_value ?? "?"}" which isn't on staff — flagged for review.`,
            source_excerpt: p.source_excerpt ?? null,
          };
        }
        return {
          scope_kind: kind,
          scope_value: value,
          cadence: p.cadence ?? null,
          rationale: p.rationale ?? null,
          source_excerpt: p.source_excerpt ?? null,
        };
      })
      // de-dupe by (kind, value)
      .filter(
        (m, i, arr) =>
          arr.findIndex(
            (x) => x.scope_kind === m.scope_kind && x.scope_value === m.scope_value,
          ) === i,
      );

    let inserted = 0;
    for (const m of normalized) {
      const { error } = await supabase
        .from("nectar_requirement_mappings")
        .insert({
          organization_id: req.organization_id,
          requirement_id: req.id,
          scope_kind: m.scope_kind,
          scope_value: m.scope_value,
          cadence: m.cadence,
          jurisdiction: (req.jurisdiction as string | null) ?? "UT-DSPD",
          proposed_by: "nectar",
          confirmed: false,
          rationale: m.rationale,
          source_excerpt: m.source_excerpt,
        });
      if (!error) inserted += 1;
    }

    return { inserted, total: normalized.length, facts };
  });

export const listRequirementMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        requirementId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("nectar_requirement_mappings")
      .select(
        "id, requirement_id, scope_kind, scope_value, cadence, jurisdiction, proposed_by, confirmed, confirmed_at, rationale, source_excerpt, created_at",
      )
      .eq("organization_id", data.organizationId)
      .order("scope_kind", { ascending: true })
      .order("created_at", { ascending: true });
    if (data.requirementId) q = q.eq("requirement_id", data.requirementId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { mappings: rows ?? [] };
  });

export const setRequirementMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        organizationId: z.string().uuid().optional(),
        requirementId: z.string().uuid().optional(),
        scopeKind: z.enum(SCOPE_KINDS).optional(),
        scopeValue: z.string().max(80).nullable().optional(),
        cadence: z
          .enum(["annual", "quarterly", "monthly", "weekly", "per_shift", "once"])
          .nullable()
          .optional(),
        jurisdiction: z.string().max(40).nullable().optional(),
        confirmed: z.boolean().optional(),
        rationale: z.string().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();

    if (data.id) {
      // Resolve org from the existing mapping row so we can verify membership.
      const { data: existing, error: exErr } = await supabase
        .from("nectar_requirement_mappings")
        .select("organization_id")
        .eq("id", data.id)
        .maybeSingle();
      if (exErr || !existing) throw new Error("Mapping not found");
      await requireOrgMembership(
        supabase,
        userId,
        (existing as { organization_id: string }).organization_id,
        "manager",
      );

      const patch: {
        scope_kind?: ScopeKind;
        scope_value?: string | null;
        cadence?: string | null;
        jurisdiction?: string | null;
        rationale?: string | null;
        confirmed?: boolean;
        confirmed_by?: string | null;
        confirmed_at?: string | null;
      } = {};
      if (data.scopeKind) patch.scope_kind = data.scopeKind;
      if (data.scopeValue !== undefined) patch.scope_value = data.scopeValue;
      if (data.cadence !== undefined) patch.cadence = data.cadence;
      if (data.jurisdiction !== undefined) patch.jurisdiction = data.jurisdiction;
      if (data.rationale !== undefined) patch.rationale = data.rationale;
      if (data.confirmed !== undefined) {
        patch.confirmed = data.confirmed;
        patch.confirmed_by = data.confirmed ? userId : null;
        patch.confirmed_at = data.confirmed ? nowIso : null;
      }

      const { error } = await supabase
        .from("nectar_requirement_mappings")
        .update(patch)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    if (!data.organizationId || !data.requirementId || !data.scopeKind) {
      throw new Error("organizationId, requirementId, scopeKind required to create");
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const { data: row, error } = await supabase
      .from("nectar_requirement_mappings")
      .insert({
        organization_id: data.organizationId,
        requirement_id: data.requirementId,
        scope_kind: data.scopeKind,
        scope_value: data.scopeValue ?? null,
        cadence: data.cadence ?? null,
        jurisdiction: data.jurisdiction ?? "UT-DSPD",
        proposed_by: "admin",
        confirmed: data.confirmed ?? true,
        confirmed_by: (data.confirmed ?? true) ? userId : null,
        confirmed_at: (data.confirmed ?? true) ? nowIso : null,
        rationale: data.rationale ?? null,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");
    return { id: row.id as string };
  });

export const deleteRequirementMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: exErr } = await supabase
      .from("nectar_requirement_mappings")
      .select("organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr || !existing) throw new Error("Mapping not found");
    await requireOrgMembership(
      supabase,
      userId,
      (existing as { organization_id: string }).organization_id,
      "manager",
    );
    const { error } = await supabase
      .from("nectar_requirement_mappings")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Resolver: which CONFIRMED requirements apply in this context? ----------
// Downstream consumers (audit checklist, billing readiness, staff app, tasks)
// call this instead of embedding their own rule tables.

export const getApplicableRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        codes: z.array(z.string().max(40)).optional(),
        roles: z.array(z.string().max(40)).optional(),
        clientScoped: z.boolean().optional(),
        providerWide: z.boolean().optional(),
        jurisdiction: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let q = supabase
      .from("nectar_requirement_mappings")
      .select(
        "id, requirement_id, scope_kind, scope_value, cadence, jurisdiction, confirmed",
      )
      .eq("organization_id", data.organizationId)
      .eq("confirmed", true);
    if (data.jurisdiction) q = q.eq("jurisdiction", data.jurisdiction);
    const { data: maps, error } = await q;
    if (error) throw new Error(error.message);

    const codes = (data.codes ?? []).map((c) => c.toUpperCase());
    const roles = (data.roles ?? []).map((r) => r.toUpperCase());
    const wantClient = !!data.clientScoped;
    const wantProvider = !!data.providerWide;

    const matched = (maps ?? []).filter((m) => {
      const k = m.scope_kind as ScopeKind;
      if (k === "provider") return wantProvider;
      if (k === "client") return wantClient;
      if (k === "code")
        return codes.includes(((m.scope_value as string) ?? "").toUpperCase());
      if (k === "role")
        return roles.includes(((m.scope_value as string) ?? "").toUpperCase());
      return false;
    });

    const reqIds = Array.from(new Set(matched.map((m) => m.requirement_id as string)));
    if (!reqIds.length) return { requirements: [], mappings: matched };

    const { data: reqs } = await supabase
      .from("nectar_requirements")
      .select(
        "id, title, description, category, source_citation, source_document_id, review_status, applies_to, jurisdiction",
      )
      .in("id", reqIds)
      .eq("review_status", "confirmed");

    return { requirements: reqs ?? [], mappings: matched };
  });

// Convenience: derive billing-readiness rules for a single service code.
export const getBillingReadinessForCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        code: z.string().min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const code = data.code.toUpperCase();
    const { data: maps } = await supabase
      .from("nectar_requirement_mappings")
      .select("requirement_id")
      .eq("organization_id", data.organizationId)
      .eq("confirmed", true)
      .eq("scope_kind", "code")
      .eq("scope_value", code);
    const ids = Array.from(new Set((maps ?? []).map((m) => m.requirement_id as string)));
    if (!ids.length) return { code, rules: [] };
    const { data: reqs } = await supabase
      .from("nectar_requirements")
      .select("id, title, description, category, source_citation")
      .in("id", ids)
      .eq("review_status", "confirmed");
    return { code, rules: reqs ?? [] };
  });

// Surfaces requirements that need admin attention from the engine's POV:
// (a) confirmed requirement with NO confirmed mapping yet, or
// (b) any unknown-scope mapping still unconfirmed.
export const listEngineGapsAsTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [reqsRes, mapsRes] = await Promise.all([
      supabase
        .from("nectar_requirements")
        .select("id, title, source_citation")
        .eq("organization_id", data.organizationId)
        .eq("review_status", "confirmed"),
      supabase
        .from("nectar_requirement_mappings")
        .select("requirement_id, scope_kind, confirmed")
        .eq("organization_id", data.organizationId),
    ]);
    const reqs = (reqsRes.data ?? []) as Array<{
      id: string;
      title: string;
      source_citation: string | null;
    }>;
    const maps = (mapsRes.data ?? []) as Array<{
      requirement_id: string;
      scope_kind: string;
      confirmed: boolean;
    }>;
    const confirmedByReq = new Map<string, number>();
    const unknownByReq = new Map<string, number>();
    for (const m of maps) {
      if (m.confirmed)
        confirmedByReq.set(m.requirement_id, (confirmedByReq.get(m.requirement_id) ?? 0) + 1);
      if (m.scope_kind === "unknown" && !m.confirmed)
        unknownByReq.set(m.requirement_id, (unknownByReq.get(m.requirement_id) ?? 0) + 1);
    }
    const tasks = reqs
      .map((r) => {
        const confirmed = confirmedByReq.get(r.id) ?? 0;
        const unknown = unknownByReq.get(r.id) ?? 0;
        if (confirmed === 0)
          return {
            requirement_id: r.id,
            title: r.title,
            citation: r.source_citation,
            reason: "no_mapping" as const,
            label: "Scope not mapped — NECTAR needs you to confirm who this applies to.",
          };
        if (unknown > 0)
          return {
            requirement_id: r.id,
            title: r.title,
            citation: r.source_citation,
            reason: "unknown_scope" as const,
            label: "Scope flagged for review — resolve unknown mapping.",
          };
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    return { tasks };
  });

// ---------- Prompt 31: bulk pre-fill of NECTAR proposals ----------
// Walks every requirement that has zero mappings and asks NECTAR to propose
// applicability scope up-front, so the admin's job becomes review-and-approve
// rather than building from scratch. Pre-filled rows stay `confirmed: false`
// (proposed by nectar) — nothing is self-confirmed.

const PREFILL_CONCURRENCY = 4;

export const prefillRequirementMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        requirementIds: z.array(z.string().uuid()).max(500).optional(),
        max: z.number().int().min(1).max(200).default(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");


    // Which requirements already have at least one mapping? Skip those.
    const { data: existingMaps } = await supabase
      .from("nectar_requirement_mappings")
      .select("requirement_id")
      .eq("organization_id", data.organizationId);
    const hasMapping = new Set(
      ((existingMaps ?? []) as Array<{ requirement_id: string }>).map(
        (m) => m.requirement_id,
      ),
    );

    let q = supabase
      .from("nectar_requirements")
      .select("id, organization_id, title, description, source_citation, jurisdiction, review_status")
      .eq("organization_id", data.organizationId)
      .neq("review_status", "removed");
    if (data.requirementIds?.length) q = q.in("id", data.requirementIds);
    const { data: reqs, error: rErr } = await q;
    if (rErr) throw new Error(rErr.message);

    const candidates = ((reqs ?? []) as Array<{
      id: string;
      organization_id: string;
      title: string;
      description: string | null;
      source_citation: string | null;
      jurisdiction: string | null;
    }>).filter((r) => !hasMapping.has(r.id)).slice(0, data.max);

    if (candidates.length === 0) {
      return { processed: 0, inserted: 0, skipped: 0, alreadyMapped: hasMapping.size };
    }

    const facts = await gatherOrgFacts(supabase, data.organizationId);

    let inserted = 0;
    let processed = 0;
    let failed = 0;

    // Bounded concurrency so we don't hammer the gateway.
    const queue = [...candidates];
    const workers = Array.from({ length: PREFILL_CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const req = queue.shift();
        if (!req) break;
        try {
          const proposals = await aiPropose(
            req.title,
            req.description,
            req.source_citation,
            facts,
          );
          processed += 1;

          const normalized = proposals
            .map((p) => {
              const kind = p.scope_kind as ScopeKind;
              let value = (p.scope_value ?? "").trim().toUpperCase() || null;
              if (kind === "provider" || kind === "unknown") value = null;
              if (kind === "client") value = "*";
              if (kind === "code" && (!value || !facts.codes.includes(value))) {
                return {
                  scope_kind: "unknown" as ScopeKind,
                  scope_value: null,
                  cadence: p.cadence ?? null,
                  rationale: `Requirement references code "${p.scope_value ?? "?"}" which isn't in the provider's contracted code set — flagged for review.`,
                  source_excerpt: p.source_excerpt ?? null,
                };
              }
              if (kind === "role" && (!value || !facts.roles.includes(value))) {
                return {
                  scope_kind: "unknown" as ScopeKind,
                  scope_value: null,
                  cadence: p.cadence ?? null,
                  rationale: `Requirement references role "${p.scope_value ?? "?"}" which isn't on staff — flagged for review.`,
                  source_excerpt: p.source_excerpt ?? null,
                };
              }
              return {
                scope_kind: kind,
                scope_value: value,
                cadence: p.cadence ?? null,
                rationale: p.rationale ?? null,
                source_excerpt: p.source_excerpt ?? null,
              };
            })
            .filter(
              (m, i, arr) =>
                arr.findIndex(
                  (x) => x.scope_kind === m.scope_kind && x.scope_value === m.scope_value,
                ) === i,
            );

          if (normalized.length === 0) {
            // Record an "unknown" placeholder so the admin sees NECTAR tried.
            const { error } = await supabase
              .from("nectar_requirement_mappings")
              .insert({
                organization_id: req.organization_id,
                requirement_id: req.id,
                scope_kind: "unknown",
                scope_value: null,
                cadence: null,
                jurisdiction: req.jurisdiction ?? "UT-DSPD",
                proposed_by: "nectar",
                confirmed: false,
                rationale:
                  "NECTAR couldn't confidently determine applicability — flagged for admin review.",
                source_excerpt: null,
              });
            if (!error) inserted += 1;
            continue;
          }

          for (const m of normalized) {
            const { error } = await supabase
              .from("nectar_requirement_mappings")
              .insert({
                organization_id: req.organization_id,
                requirement_id: req.id,
                scope_kind: m.scope_kind,
                scope_value: m.scope_value,
                cadence: m.cadence,
                jurisdiction: req.jurisdiction ?? "UT-DSPD",
                proposed_by: "nectar",
                confirmed: false,
                rationale: m.rationale,
                source_excerpt: m.source_excerpt,
              });
            if (!error) inserted += 1;
          }
        } catch {
          failed += 1;
          // Skip this requirement; admin can ask NECTAR to propose later.
        }
      }
    });
    await Promise.all(workers);

    return {
      processed,
      inserted,
      failed,
      skipped: candidates.length - processed - failed,
      candidates: candidates.length,
      alreadyMapped: hasMapping.size,
    };
  });

// ---------- Prompt 31: one-shot "looks right" confirm ----------
// Confirms the requirement itself AND all its currently-proposed scopes that
// aren't flagged unknown, in a single human-attested action. Unknown scopes
// stay pending so they don't get waved through.

export const confirmRequirementWithScopes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requirementId: z.string().uuid(),
        attestStatement: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();

    const { data: req, error: rErr } = await supabase
      .from("nectar_requirements")
      .select(
        "id, organization_id, title, source_document_id, source_citation, review_status",
      )
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");
    await requireOrgMembership(supabase, userId, req.organization_id as string, "manager");

    // Confirm the requirement itself.
    const { error: upErr } = await supabase
      .from("nectar_requirements")
      .update({
        review_status: "confirmed",
        verified: true,
        verified_by: userId,
        verified_at: nowIso,
      })
      .eq("id", req.id);
    if (upErr) throw new Error(upErr.message);

    // Confirm all pending, non-unknown mappings.
    const { data: pendingMaps } = await supabase
      .from("nectar_requirement_mappings")
      .select("id, scope_kind, confirmed")
      .eq("requirement_id", req.id)
      .eq("confirmed", false);

    const toConfirm = ((pendingMaps ?? []) as Array<{
      id: string;
      scope_kind: string;
      confirmed: boolean;
    }>).filter((m) => m.scope_kind !== "unknown");

    let scopesConfirmed = 0;
    if (toConfirm.length > 0) {
      const { error: mErr } = await supabase
        .from("nectar_requirement_mappings")
        .update({
          confirmed: true,
          confirmed_by: userId,
          confirmed_at: nowIso,
        })
        .in(
          "id",
          toConfirm.map((m) => m.id),
        );
      if (!mErr) scopesConfirmed = toConfirm.length;
    }

    // Source context + profile for the attestation.
    let sourceTitle: string | null = null;
    if (req.source_document_id) {
      const { data: src } = await supabase
        .from("nectar_documents")
        .select("title")
        .eq("id", req.source_document_id as string)
        .maybeSingle();
      sourceTitle = (src?.title as string | null) ?? null;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    const statement =
      data.attestStatement?.trim() ||
      `Reviewed NECTAR's proposal and confirmed requirement "${req.title}"${
        scopesConfirmed > 0
          ? ` along with ${scopesConfirmed} proposed applicability scope${scopesConfirmed === 1 ? "" : "s"}`
          : ""
      } as accurate and applicable to my agency${
        sourceTitle ? ` (from "${sourceTitle}")` : ""
      }.`;

    await supabase.from("nectar_attestations").insert({
      organization_id: req.organization_id,
      user_id: userId,
      user_display_name:
        (profile?.full_name as string) ?? (profile?.email as string) ?? null,
      scope: "requirement_verify",
      scope_ref_id: req.id,
      scope_ref_type: "nectar_requirement",
      statement,
      context: {
        requirement_title: req.title,
        source_document_id: req.source_document_id,
        source_document_title: sourceTitle,
        source_citation: req.source_citation,
        previous_status: req.review_status,
        new_status: "confirmed",
        scopes_confirmed: scopesConfirmed,
        nectar_prefilled: true,
      },
    });

    return { ok: true, scopesConfirmed };
  });

// ============================================================
// Prompt 34 — Provider Authorized Codes
// Coverage follows the contract, not current activity. The
// authorized-codes set is the source of truth for which codes
// NECTAR keeps requirements live for. Active vs dormant is a
// usage signal only — both stay covered.
// ============================================================

const AuthorizedCodeSource = z.enum([
  "contract",
  "sow",
  "addendum",
  "manual",
  "inferred",
]);

export const listAuthorizedCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        includeArchived: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const facts = await gatherOrgFacts(supabase, data.organizationId);

    const { data: authRows, error } = await supabase
      .from("provider_authorized_codes")
      .select(
        "id, code, label, status, source, source_document_id, notes, created_at, updated_at, archived_at, confirmed_at",
      )
      .eq("organization_id", data.organizationId)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);

    const authoredCodes = new Set(
      ((authRows ?? []) as Array<{ code: string }>).map((r) =>
        r.code.toUpperCase(),
      ),
    );

    // Prompt 35: hasActiveClient — a client_billing_codes row exists for this
    // service_code with no past service_end_date (currently authorized).
    // Runs against active (non-archived) clients only.
    const { data: cbcRows } = await supabase
      .from("client_billing_codes")
      .select("service_code, service_end_date, client_id, clients!inner(organization_id, archived_at)")
      .eq("clients.organization_id", data.organizationId)
      .is("clients.archived_at", null);
    const today = new Date().toISOString().slice(0, 10);
    const activeClientCodes = new Set<string>();
    for (const r of (cbcRows ?? []) as Array<{
      service_code: string | null;
      service_end_date: string | null;
    }>) {
      const c = (r.service_code ?? "").trim().toUpperCase();
      if (!c) continue;
      if (r.service_end_date && r.service_end_date < today) continue;
      activeClientCodes.add(c);
    }

    // Count confirmed mappings per code so the UI can show coverage.
    const { data: maps } = await supabase
      .from("nectar_requirement_mappings")
      .select("scope_value, confirmed")
      .eq("organization_id", data.organizationId)
      .eq("scope_kind", "code");
    const confirmedByCode = new Map<string, number>();
    const proposedByCode = new Map<string, number>();
    for (const m of (maps ?? []) as Array<{
      scope_value: string | null;
      confirmed: boolean;
    }>) {
      const c = (m.scope_value ?? "").toUpperCase();
      if (!c) continue;
      if (m.confirmed) confirmedByCode.set(c, (confirmedByCode.get(c) ?? 0) + 1);
      else proposedByCode.set(c, (proposedByCode.get(c) ?? 0) + 1);
    }

    // Synthesise rows for codes that show up in active use but aren't yet in
    // the authorized table (so the admin can promote them to "authorized").
    const inferred = facts.codes
      .filter((c) => !authoredCodes.has(c))
      .map((c) => ({
        id: null as string | null,
        code: c,
        label: null as string | null,
        status: facts.activeCodes.includes(c) ? "active" : "dormant",
        source: "inferred" as const,
        source_document_id: null as string | null,
        notes: "Detected from client/staff data — promote to lock it into your authorized set.",
        created_at: null,
        updated_at: null,
        archived_at: null as string | null,
        confirmed_at: null as string | null,
      }));

    const explicit = ((authRows ?? []) as Array<{
      id: string;
      code: string;
      label: string | null;
      status: string;
      source: string;
      source_document_id: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
      archived_at: string | null;
      confirmed_at: string | null;
    }>).map((r) => ({
      ...r,
      code: r.code.toUpperCase(),
      // Promote authorized rows to "active" status reflection if a client is using it.
      status: facts.activeCodes.includes(r.code.toUpperCase()) ? "active" : r.status,
    }));

    const includeArchived = data.includeArchived ?? false;
    const rows = [...explicit, ...inferred]
      .filter((r) => includeArchived || !r.archived_at)
      .map((r) => {
        const hasActiveClient = activeClientCodes.has(r.code);
        const isArchived = !!r.archived_at;
        const isUnverified = r.source === "manual" || r.source === "inferred";
        let displayStatus: "active" | "standby" | "standby-unverified" | "archived";
        if (isArchived) displayStatus = "archived";
        else if (hasActiveClient) displayStatus = "active";
        else if (isUnverified && !r.confirmed_at) displayStatus = "standby-unverified";
        else displayStatus = "standby";
        return {
          ...r,
          confirmedRequirements: confirmedByCode.get(r.code) ?? 0,
          proposedRequirements: proposedByCode.get(r.code) ?? 0,
          inUse: facts.activeCodes.includes(r.code),
          hasActiveClient,
          displayStatus,
        };
      })
      .sort((a, b) => {
        const order: Record<string, number> = {
          active: 0,
          standby: 1,
          "standby-unverified": 2,
          archived: 3,
        };
        const ao = order[a.displayStatus] ?? 9;
        const bo = order[b.displayStatus] ?? 9;
        if (ao !== bo) return ao - bo;
        return a.code.localeCompare(b.code);
      });

    const nonArchived = rows.filter((r) => r.displayStatus !== "archived");
    return {
      codes: rows,
      summary: {
        total: nonArchived.length,
        authorized: nonArchived.length,
        withActiveClients: nonArchived.filter((r) => r.hasActiveClient).length,
        standby: nonArchived.filter(
          (r) => !r.hasActiveClient && r.displayStatus !== "archived",
        ).length,
        active: nonArchived.filter((r) => r.inUse).length,
        dormant: nonArchived.filter((r) => !r.inUse).length,
        authorizedExplicit: explicit.filter((r) => includeArchived || !r.archived_at).length,
        inferredOnly: inferred.length,
        archivedCount: explicit.filter((r) => r.archived_at).length,
      },
    };
  });


export const upsertAuthorizedCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        code: z.string().min(1).max(40),
        label: z.string().max(200).nullable().optional(),
        status: z.enum(["active", "dormant"]).optional(),
        source: AuthorizedCodeSource.optional(),
        sourceDocumentId: z.string().uuid().nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const code = data.code.trim().toUpperCase();
    if (!code) throw new Error("Code required");

    const { data: row, error } = await supabase
      .from("provider_authorized_codes")
      .upsert(
        {
          organization_id: data.organizationId,
          code,
          label: data.label ?? null,
          status: data.status ?? "dormant",
          source: data.source ?? "manual",
          source_document_id: data.sourceDocumentId ?? null,
          notes: data.notes ?? null,
          added_by: userId,
        },
        { onConflict: "organization_id,code" },
      )
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Upsert failed");
    return { id: row.id as string, code };
  });

export const removeAuthorizedCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: exErr } = await supabase
      .from("provider_authorized_codes")
      .select("organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr || !existing) throw new Error("Authorized code not found");
    await requireOrgMembership(
      supabase,
      userId,
      (existing as { organization_id: string }).organization_id,
      "manager",
    );
    const { error } = await supabase
      .from("provider_authorized_codes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Prompt 35 — Soft archive/confirm for authorized codes.
// Codes are NEVER hard-deleted (7-year retention). Archiving hides a code
// from the default list; confirming marks a manual/inferred code as
// admin-verified so it no longer prompts "confirm this belongs on your contract".

export const archiveAuthorizedCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: exErr } = await supabase
      .from("provider_authorized_codes")
      .select("organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr || !existing) throw new Error("Authorized code not found");
    await requireOrgMembership(
      supabase,
      userId,
      (existing as { organization_id: string }).organization_id,
      "manager",
    );
    const { error } = await supabase
      .from("provider_authorized_codes")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unarchiveAuthorizedCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: exErr } = await supabase
      .from("provider_authorized_codes")
      .select("organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr || !existing) throw new Error("Authorized code not found");
    await requireOrgMembership(
      supabase,
      userId,
      (existing as { organization_id: string }).organization_id,
      "manager",
    );
    const { error } = await supabase
      .from("provider_authorized_codes")
      .update({ archived_at: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmAuthorizedCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: exErr } = await supabase
      .from("provider_authorized_codes")
      .select("organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr || !existing) throw new Error("Authorized code not found");
    await requireOrgMembership(
      supabase,
      userId,
      (existing as { organization_id: string }).organization_id,
      "manager",
    );
    const { error } = await supabase
      .from("provider_authorized_codes")
      .update({ confirmed_at: new Date().toISOString(), confirmed_by: userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
