// Part 1: NECTAR proposes the org's STAFF TYPES (e.g. Direct Support,
// Host Home / Foster) from the org's authoritative sources, AND proposes
// which existing HR-staff-checklist requirements apply to which types.
// Nothing here renders N/A yet — that's Part 2, after admin confirmation.
//
// State-agnostic: types + mapping are derived from each org's own SOW +
// authoritative sources, never from a hardcoded list.
//
// Guardrail: anything ambiguous / unstated → applies-to-all so we never
// hide a real requirement on a bad mapping.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

import { gatewayFetch } from "@/lib/ai-bedrock.server";

// --- Public shapes ----------------------------------------------------------

export type StaffTypeProposalRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  source_basis: string | null;
  proposed_by: "nectar" | "admin";
  proposed_at: string;
  confirmed_at: string | null;
};

export type RequirementApplicabilityRow = {
  requirement_id: string;
  requirement_key: string;
  title: string;
  source_citation: string | null;
  applies_to_staff_types: string[] | "all";
  applies_to_source_basis: string | null;
  applies_to_ambiguous: boolean;
  applies_to_proposed_at: string | null;
  applies_to_confirmed_at: string | null;
};

export type StaffTypeProposal = {
  staff_types: StaffTypeProposalRow[];
  requirements: RequirementApplicabilityRow[];
  any_unconfirmed: boolean;
  proposed_at: string | null;
};

// --- AI helper --------------------------------------------------------------

const STAFF_TYPE_SYSTEM_PROMPT = `
You are NECTAR's compliance analyst. From the provider's authoritative
sources (Scope of Work + provider contract + any other authoritative
documents), derive:

1) The distinct STAFF TYPES the sources actually define for this
   provider — e.g. "Direct Support Staff", "Host Home / Foster Care
   Provider", etc. Use ONLY types the sources actually distinguish.
   Do NOT invent generic HR roles (don't add "Administrator" unless
   the SOW assigns training/compliance obligations specifically to
   admins as a distinct staff type).

2) For each requirement we give you, which staff types it APPLIES TO
   (an array of staff_type keys). If the sources clearly state the
   requirement applies to everyone (e.g. CPR for all direct-care
   staff), return "all". If the sources do NOT clearly say, set
   ambiguous=true and return "all" — we never hide a requirement on
   ambiguous evidence.

Return strict JSON:
{
  "staff_types": [
    { "key": "direct_support", "label": "Direct Support Staff",
      "description": "...", "source_basis": "SOW §X.Y; Contract §A.B" }
  ],
  "mapping": [
    { "requirement_key": "hr_staff:fh_permit",
      "applies_to": ["host_home_provider"],
      "source_basis": "SOW §11.3 Foster Home Permit applies only to host-home providers",
      "ambiguous": false }
  ]
}

Rules:
- Keys are short lowercase snake_case slugs.
- Every requirement_key we pass must appear in mapping exactly once.
- applies_to is "all" OR a non-empty array of staff_type keys you
  declared in staff_types.
- Prefer "all" when in doubt; set ambiguous=true.
- Cite the section that establishes scope when possible.
- IMPORTANT: Keep every "source_basis" CONCISE — under 400 characters.
  Cite the SOW/contract article or section number plus a brief one-sentence
  reason. Do NOT paste long excerpts or quote multiple paragraphs.
`;

// Schema cap with headroom (was 500). If a single field still exceeds it,
// truncate that field rather than rejecting the whole proposal.
const MAX_BASIS = 1500;
const truncateBasis = (s: string | null | undefined): string | null => {
  if (s == null) return null;
  const str = String(s);
  return str.length > MAX_BASIS ? str.slice(0, MAX_BASIS - 1) + "…" : str;
};

const StaffTypeItem = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(120),
  description: z.string().optional().nullable().transform(truncateBasis),
  source_basis: z.string().optional().nullable().transform(truncateBasis),
});
const MappingItem = z.object({
  requirement_key: z.string().min(1).max(120),
  applies_to: z.union([z.literal("all"), z.array(z.string().min(1).max(60)).max(20)]),
  source_basis: z.string().optional().nullable().transform(truncateBasis),
  ambiguous: z.boolean().optional().default(false),
});
const AiResponse = z.object({
  staff_types: z.array(StaffTypeItem).min(1).max(20),
  mapping: z.array(MappingItem).max(500),
});

async function callNectar(systemPrompt: string, userPrompt: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await gatewayFetch({
      model: "bedrock",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });
  if (res.status === 429)
    throw new Error("NECTAR rate-limited. Try again in a moment.");
  if (res.status === 402)
    throw new Error(
      "AI credits exhausted. Add credits in Settings → Workspace → Usage.",
    );
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "{}";
}

// --- Propose ---------------------------------------------------------------

export const proposeStaffTypesAndMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organization_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "manager");

    // 1) Load org's authoritative sources (text)
    const { data: sources, error: sErr } = await supabase
      .from("nectar_documents")
      .select("title, authoritative_kind, raw_text")
      .eq("organization_id", data.organization_id)
      .eq("is_authoritative_source", true)
      .order("created_at", { ascending: false });
    if (sErr) throw new Error(sErr.message);
    const usableSources = (sources ?? []).filter(
      (d) => ((d.raw_text as string | null) ?? "").trim().length > 200,
    );
    if (usableSources.length === 0) {
      throw new Error(
        "No readable authoritative sources found. Upload your SOW / provider contract under Authoritative Sources first.",
      );
    }

    // 2) Load HR-staff-checklist requirements (the universe we map)
    const { data: reqs, error: rErr } = await supabase
      .from("nectar_requirements")
      .select("id, requirement_key, title, source_citation, metadata")
      .eq("organization_id", data.organization_id)
      .eq("approval_state", "provider_confirmed")
      .filter("metadata->>scope", "eq", "hr_staff_checklist");
    if (rErr) throw new Error(rErr.message);
    if (!reqs || reqs.length === 0) {
      throw new Error(
        "No confirmed HR staff requirements to map yet. Confirm requirements first.",
      );
    }

    // 3) Build the prompt
    const sourceBlock = usableSources
      .slice(0, 6)
      .map(
        (d, i) =>
          `# Source ${i + 1} (${d.authoritative_kind ?? "doc"}): ${d.title}\n${(
            (d.raw_text as string) ?? ""
          ).slice(0, 18000)}`,
      )
      .join("\n\n---\n\n");

    const reqBlock = reqs
      .map(
        (r) =>
          `- ${r.requirement_key} :: ${r.title}${
            r.source_citation ? ` (${r.source_citation})` : ""
          }`,
      )
      .join("\n");

    const userPrompt = `AUTHORITATIVE SOURCES:\n\n${sourceBlock}\n\n---\n\nREQUIREMENTS TO MAP (one line each):\n${reqBlock}`;

    const content = await callNectar(STAFF_TYPE_SYSTEM_PROMPT, userPrompt);
    let parsed: z.infer<typeof AiResponse>;
    try {
      const raw = JSON.parse(content);
      parsed = AiResponse.parse(raw);
    } catch (e) {
      throw new Error(
        `NECTAR returned an unreadable response. ${(e as Error).message}`,
      );
    }

    // 4) Upsert staff_types (proposed; not yet confirmed)
    const now = new Date().toISOString();
    const validKeys = new Set(parsed.staff_types.map((t) => t.key));
    for (const t of parsed.staff_types) {
      await supabase.from("staff_types").upsert(
        {
          organization_id: data.organization_id,
          key: t.key,
          label: t.label,
          description: t.description ?? null,
          source_basis: t.source_basis ?? null,
          proposed_by: "nectar",
          proposed_at: now,
          confirmed_at: null,
          confirmed_by: null,
        },
        { onConflict: "organization_id,key" },
      );
    }

    // 5) Write applies_to_staff_types into each requirement's metadata
    //    (defaulting ambiguous / unmapped → "all" so nothing is hidden)
    const mappingByKey = new Map(parsed.mapping.map((m) => [m.requirement_key, m]));
    for (const r of reqs) {
      const m = mappingByKey.get(r.requirement_key as string);
      let appliesTo: string[] | "all";
      let ambiguous = false;
      let sourceBasis: string | null = null;

      if (!m) {
        appliesTo = "all";
        ambiguous = true;
        sourceBasis = "Not addressed by NECTAR — defaulted to all (safe).";
      } else if (m.applies_to === "all") {
        appliesTo = "all";
        ambiguous = !!m.ambiguous;
        sourceBasis = m.source_basis ?? null;
      } else {
        const filtered = (m.applies_to as string[]).filter((k) => validKeys.has(k));
        if (filtered.length === 0) {
          appliesTo = "all";
          ambiguous = true;
          sourceBasis =
            (m.source_basis ?? "") +
            " (Unrecognized staff_type keys; defaulted to all.)";
        } else {
          appliesTo = filtered;
          ambiguous = !!m.ambiguous;
          sourceBasis = m.source_basis ?? null;
        }
      }

      const prevMeta = (r.metadata ?? {}) as Record<string, unknown>;
      const nextMeta = {
        ...prevMeta,
        applies_to_staff_types: appliesTo,
        applies_to_source_basis: sourceBasis,
        applies_to_ambiguous: ambiguous,
        applies_to_proposed_at: now,
        applies_to_proposed_by: "nectar",
        // confirmed_at intentionally untouched — Part 2 sets it
      };
      await supabase
        .from("nectar_requirements")
        .update({ metadata: nextMeta })
        .eq("id", r.id);
    }

    return { proposed_types: parsed.staff_types.length, mapped: reqs.length };
  });

// --- Read for the review UI ------------------------------------------------

export const listStaffTypeProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organization_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<StaffTypeProposal> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "employee");

    const { data: types } = await supabase
      .from("staff_types")
      .select(
        "id, key, label, description, source_basis, proposed_by, proposed_at, confirmed_at",
      )
      .eq("organization_id", data.organization_id)
      .order("label", { ascending: true });

    const { data: reqs } = await supabase
      .from("nectar_requirements")
      .select("id, requirement_key, title, source_citation, metadata")
      .eq("organization_id", data.organization_id)
      .eq("approval_state", "provider_confirmed")
      .filter("metadata->>scope", "eq", "hr_staff_checklist")
      .order("title", { ascending: true });

    const requirements: RequirementApplicabilityRow[] = (reqs ?? []).map((r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      const at = m.applies_to_staff_types;
      const applies_to_staff_types =
        at === "all" || Array.isArray(at) ? (at as string[] | "all") : "all";
      return {
        requirement_id: r.id as string,
        requirement_key: r.requirement_key as string,
        title: r.title as string,
        source_citation: (r.source_citation as string | null) ?? null,
        applies_to_staff_types,
        applies_to_source_basis:
          (m.applies_to_source_basis as string | null) ?? null,
        applies_to_ambiguous: Boolean(m.applies_to_ambiguous ?? false),
        applies_to_proposed_at:
          (m.applies_to_proposed_at as string | null) ?? null,
        applies_to_confirmed_at:
          (m.applies_to_confirmed_at as string | null) ?? null,
      };
    });

    const typesOut: StaffTypeProposalRow[] = (types ?? []).map((t) => ({
      id: t.id as string,
      key: t.key as string,
      label: t.label as string,
      description: (t.description as string | null) ?? null,
      source_basis: (t.source_basis as string | null) ?? null,
      proposed_by: (t.proposed_by as "nectar" | "admin") ?? "nectar",
      proposed_at: t.proposed_at as string,
      confirmed_at: (t.confirmed_at as string | null) ?? null,
    }));

    const any_unconfirmed =
      typesOut.some((t) => !t.confirmed_at) ||
      requirements.some(
        (r) => r.applies_to_proposed_at && !r.applies_to_confirmed_at,
      );
    const proposed_at =
      typesOut.map((t) => t.proposed_at).sort().at(-1) ??
      requirements
        .map((r) => r.applies_to_proposed_at)
        .filter(Boolean)
        .sort()
        .at(-1) ??
      null;

    return {
      staff_types: typesOut,
      requirements,
      any_unconfirmed,
      proposed_at: proposed_at as string | null,
    };
  });

// --- Edit + confirm (admin/manager only) -----------------------------------

const staffTypeUpsert = z.object({
  organization_id: z.string().uuid(),
  id: z.string().uuid().nullable().optional(),
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
});

export const upsertStaffType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffTypeUpsert.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "manager");
    if (data.id) {
      const { error } = await supabase
        .from("staff_types")
        .update({
          key: data.key,
          label: data.label,
          description: data.description ?? null,
        })
        .eq("id", data.id)
        .eq("organization_id", data.organization_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("staff_types").upsert(
        {
          organization_id: data.organization_id,
          key: data.key,
          label: data.label,
          description: data.description ?? null,
          proposed_by: "admin",
          proposed_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,key" },
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteStaffType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organization_id: z.string().uuid(), id: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "manager");
    const { error } = await supabase
      .from("staff_types")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const requirementApplicabilityUpdate = z.object({
  organization_id: z.string().uuid(),
  requirement_id: z.string().uuid(),
  applies_to: z.union([
    z.literal("all"),
    z.array(z.string().min(1).max(60)).max(20),
  ]),
});

export const updateRequirementApplicability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requirementApplicabilityUpdate.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "manager");
    const { data: r, error: rErr } = await supabase
      .from("nectar_requirements")
      .select("id, metadata")
      .eq("id", data.requirement_id)
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!r) throw new Error("Requirement not found");
    const prev = (r.metadata ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    const nextMeta = {
      ...prev,
      applies_to_staff_types: data.applies_to,
      applies_to_confirmed_at: now,
      applies_to_confirmed_by: userId,
      applies_to_ambiguous: false,
    };
    const { error } = await supabase
      .from("nectar_requirements")
      .update({ metadata: nextMeta })
      .eq("id", data.requirement_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmAllApplicability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organization_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "manager");
    const now = new Date().toISOString();
    await supabase
      .from("staff_types")
      .update({ confirmed_at: now, confirmed_by: userId })
      .eq("organization_id", data.organization_id)
      .is("confirmed_at", null);
    const { data: reqs } = await supabase
      .from("nectar_requirements")
      .select("id, metadata")
      .eq("organization_id", data.organization_id)
      .eq("approval_state", "provider_confirmed")
      .filter("metadata->>scope", "eq", "hr_staff_checklist");
    for (const r of reqs ?? []) {
      const prev = (r.metadata ?? {}) as Record<string, unknown>;
      if (prev.applies_to_confirmed_at) continue;
      await supabase
        .from("nectar_requirements")
        .update({
          metadata: {
            ...prev,
            applies_to_confirmed_at: now,
            applies_to_confirmed_by: userId,
          },
        })
        .eq("id", r.id);
    }
    return { ok: true };
  });

// --- Per-staff assignment --------------------------------------------------

export const setStaffTypeKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organization_id: z.string().uuid(),
        staff_id: z.string().uuid(),
        staff_type_keys: z.array(z.string().min(1).max(60)).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "manager");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ staff_type_keys: data.staff_type_keys })
      .eq("id", data.staff_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getStaffTypeAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organization_id: z.string().uuid(),
        staff_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ staff_type_keys: string[] }> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (supabase as any)
      .from("profiles")
      .select("staff_type_keys")
      .eq("id", data.staff_id)
      .maybeSingle();
    return { staff_type_keys: (row?.staff_type_keys as string[] | null) ?? [] };
  });

