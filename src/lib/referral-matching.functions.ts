/**
 * CRM Phase A5 — Referral matching engine v1.
 *
 * v1 is DETERMINISTIC: rule-based math (transparent, testable). NECTAR's
 * role here is to PRESENT the score + generate the human-readable reasons,
 * never to invent the number.
 *
 * Reads: referral + all available hosts (status ready|onboarding) + outline.
 * Writes: only the cached score row in referral_match_scores.
 * Never touches EVV / Teams / clients / placement.
 *
 * Gating:
 *   - read/compute  → view_referrals OR manage_referrals (auto-compute on read)
 *   - force recompute → manage_referrals
 * Staff blocked. Cache is invalidated by DB triggers on referral/host/outline
 * changes (see migration).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requirePermission,
  requireAnyPermission,
} from "@/lib/require-permission";
import { DEFAULT_MATCH_WEIGHTS } from "@/lib/provider-interest-outline.functions";

// ────────── Types ──────────

export type ReasonSeverity = "positive" | "neutral" | "negative" | "flag";
export type MatchReason = {
  category:
    | "location"
    | "host"
    | "disability"
    | "need"
    | "code"
    | "communication"
    | "behavioral"
    | "medical"
    | "mobility";
  severity: ReasonSeverity;
  text: string;
};

export type ReferralMatchScore = {
  referral_id: string;
  organization_id: string;
  overall_score: number;
  location_fit: number;
  host_fit: number;
  disability_fit: number;
  need_fit: number;
  code_overlap: number;
  best_host_ids: string[];
  weights: Record<string, number>;
  reasons: MatchReason[];
  computed_at: string;
};

type Referral = {
  id: string;
  organization_id: string;
  first_name: string;
  location_city: string | null;
  location_county: string | null;
  disability_types: string[];
  disability_level: string | null;
  requested_codes: string[];
  need_level: string | null;
  description: string | null;
};

type HostCard = {
  id: string;
  name: string;
  location_city: string | null;
  location_county: string | null;
  independence_levels_accepted: string[];
  medical_comfort: string[];
  behavioral_comfort: string | null;
  communication_abilities: string | null;
  wheelchair_accessible: boolean;
  sign_language: boolean;
  schedule_availability: string | null;
  status: string;
};

type Outline = {
  location_mode: "anywhere" | "county" | "city";
  location_values: string[];
  codes_held: string[];
  need_levels_served: string[];
  disability_types_served: string[];
  disability_levels_served: string[];
  match_weights: Record<string, number> | null;
};

// ────────── Pure scoring helpers (exported for testing) ──────────

const clamp10 = (n: number) => Math.max(0, Math.min(10, n));
const norm = (s: string | null | undefined) =>
  (s ?? "").toString().trim().toLowerCase();
const normList = (arr: string[] | null | undefined) =>
  (arr ?? []).map((x) => norm(x)).filter(Boolean);

function refHaystack(r: Referral): string {
  return [
    r.description,
    r.need_level,
    r.disability_level,
    ...(r.disability_types ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function mentionsAny(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(n));
}

// Score location 0–10 + reason.
function scoreLocation(
  r: Referral,
  outline: Outline,
): { score: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  const city = norm(r.location_city);
  const county = norm(r.location_county);
  const values = normList(outline.location_values);

  if (outline.location_mode === "anywhere" || values.length === 0) {
    reasons.push({
      category: "location",
      severity: "positive",
      text: `Location: provider serves anywhere — ${
        [r.location_city, r.location_county].filter(Boolean).join(", ") ||
        "unspecified"
      } is fine.`,
    });
    return { score: 10, reasons };
  }

  if (outline.location_mode === "county") {
    if (county && values.includes(county)) {
      reasons.push({
        category: "location",
        severity: "positive",
        text: `Location: ${r.location_county} matches your county preference (full).`,
      });
      return { score: 10, reasons };
    }
    reasons.push({
      category: "location",
      severity: "negative",
      text: `Location gap: ${
        r.location_county || r.location_city || "referral"
      } is outside your county preferences (${(outline.location_values ?? []).join(", ") || "none"}).`,
    });
    return { score: 3, reasons };
  }

  // city mode
  if (city && values.includes(city)) {
    reasons.push({
      category: "location",
      severity: "positive",
      text: `Location: ${r.location_city} is a preferred city (full match).`,
    });
    return { score: 10, reasons };
  }
  if (county && values.some((v) => v.includes(county))) {
    reasons.push({
      category: "location",
      severity: "neutral",
      text: `Location: ${r.location_city || r.location_county} shares county with your preferences (partial).`,
    });
    return { score: 6, reasons };
  }
  reasons.push({
    category: "location",
    severity: "negative",
    text: `Location gap: ${
      r.location_city || r.location_county || "referral"
    } is outside your preferred cities.`,
  });
  return { score: 2, reasons };
}

// Score one host vs referral. Returns 0–10 + reasons.
function scoreHost(
  r: Referral,
  h: HostCard,
): { score: number; reasons: MatchReason[] } {
  const hay = refHaystack(r);
  const reasons: MatchReason[] = [];
  let s = 5; // neutral base

  // Independence vs need
  const need = norm(r.need_level);
  const accepts = normList(h.independence_levels_accepted);
  if (need && accepts.length > 0) {
    if (accepts.includes(need)) {
      s += 2;
      reasons.push({
        category: "host",
        severity: "positive",
        text: `Host ${h.name}: accepts ${r.need_level} — independence fit.`,
      });
    } else {
      s -= 2;
      reasons.push({
        category: "host",
        severity: "negative",
        text: `Host ${h.name}: does not list ${r.need_level} among accepted levels (${(h.independence_levels_accepted ?? []).join("/") || "—"}).`,
      });
    }
  }

  // Communication: deaf / sign-language is a load-bearing flag
  const isDeafOrHoH = mentionsAny(hay, ["deaf", "hard of hearing", "hoh", "asl", "sign language"]);
  if (isDeafOrHoH) {
    if (h.sign_language) {
      s += 2;
      reasons.push({
        category: "communication",
        severity: "positive",
        text: `Host ${h.name}: sign-language proficient — fits a deaf / HoH client.`,
      });
    } else {
      s -= 3;
      reasons.push({
        category: "communication",
        severity: "flag",
        text: `⚠ Communication mismatch: referral indicates deaf / sign-language need but host ${h.name} is not sign-language proficient.`,
      });
    }
  }

  // Mobility
  const needsWheelchair = mentionsAny(hay, ["wheelchair", "mobility aid", "non-ambulatory"]);
  if (needsWheelchair) {
    if (h.wheelchair_accessible) {
      s += 2;
      reasons.push({
        category: "mobility",
        severity: "positive",
        text: `Host ${h.name}: wheelchair-accessible home — fits mobility need.`,
      });
    } else {
      s -= 3;
      reasons.push({
        category: "mobility",
        severity: "flag",
        text: `⚠ Mobility mismatch: referral needs wheelchair access; host ${h.name} home not accessible.`,
      });
    }
  }

  // Behavioral
  const behavioralRef = mentionsAny(hay, [
    "behavior",
    "aggression",
    "aggressive",
    "elopement",
    "self-injur",
    "autism",
  ]);
  if (behavioralRef) {
    if (h.behavioral_comfort && h.behavioral_comfort.trim().length > 0) {
      s += 1;
      reasons.push({
        category: "behavioral",
        severity: "positive",
        text: `Host ${h.name}: behavioral experience — "${h.behavioral_comfort.slice(0, 80)}".`,
      });
    } else {
      s -= 1;
      reasons.push({
        category: "behavioral",
        severity: "neutral",
        text: `Host ${h.name}: no behavioral experience documented; verify before placement.`,
      });
    }
  }

  // Medical comfort
  const medicalKeywords = ["seizure", "medication", "aging", "diabet", "g-tube", "trach"];
  const refMedical = medicalKeywords.filter((k) => hay.includes(k));
  if (refMedical.length > 0) {
    const hostMedical = normList(h.medical_comfort);
    const overlap = refMedical.filter((k) =>
      hostMedical.some((m) => m.includes(k)),
    );
    if (overlap.length > 0) {
      s += 1;
      reasons.push({
        category: "medical",
        severity: "positive",
        text: `Host ${h.name}: medical comfort overlaps (${overlap.join(", ")}).`,
      });
    }
  }

  // Schedule availability (e.g. day job) — surface, do not score hard
  if (h.schedule_availability && /day\s*job|works? daytime|part[- ]time|limited/i.test(h.schedule_availability)) {
    reasons.push({
      category: "host",
      severity: "neutral",
      text: `Host ${h.name}: schedule constraint noted — "${h.schedule_availability.slice(0, 80)}".`,
    });
  }

  // Geo proximity within host scoring (light)
  const refCounty = norm(r.location_county);
  const hostCounty = norm(h.location_county);
  if (refCounty && hostCounty && refCounty !== hostCounty) {
    s -= 1;
    reasons.push({
      category: "host",
      severity: "negative",
      text: `Host ${h.name}: ${h.location_county || h.location_city || "host"} is outside referral's ${r.location_county} (county gap).`,
    });
  } else if (refCounty && hostCounty && refCounty === hostCounty) {
    s += 1;
  }

  return { score: clamp10(s), reasons };
}

function scoreHostFit(
  r: Referral,
  hosts: HostCard[],
): { score: number; reasons: MatchReason[]; bestHostIds: string[] } {
  if (hosts.length === 0) {
    return {
      score: 0,
      bestHostIds: [],
      reasons: [
        {
          category: "host",
          severity: "negative",
          text: "No available host home cards (ready / onboarding). Add a host to compute host fit.",
        },
      ],
    };
  }
  const scored = hosts.map((h) => ({ h, ...scoreHost(r, h) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const ties = scored.filter((x) => x.score === top.score).slice(0, 2);
  return {
    score: top.score,
    bestHostIds: ties.map((t) => t.h.id),
    reasons: top.reasons,
  };
}

function scoreDisability(
  r: Referral,
  outline: Outline,
): { score: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  const refTypes = normList(r.disability_types);
  const served = normList(outline.disability_types_served);
  const refLevel = norm(r.disability_level);
  const servedLevels = normList(outline.disability_levels_served);

  if (served.length === 0) {
    reasons.push({
      category: "disability",
      severity: "neutral",
      text: "Disability: provider has no served-types restriction — open.",
    });
    let s = 8;
    if (refLevel && servedLevels.length > 0 && !servedLevels.includes(refLevel)) {
      s -= 2;
      reasons.push({
        category: "disability",
        severity: "negative",
        text: `Disability level "${r.disability_level}" outside served levels (${(outline.disability_levels_served ?? []).join(", ")}).`,
      });
    }
    return { score: clamp10(s), reasons };
  }

  if (refTypes.length === 0) {
    return {
      score: 7,
      reasons: [
        {
          category: "disability",
          severity: "neutral",
          text: "Disability types not recorded on referral — cannot score precisely.",
        },
      ],
    };
  }

  const matched = refTypes.filter((t) =>
    served.some((s) => s.includes(t) || t.includes(s)),
  );
  const ratio = matched.length / refTypes.length;
  let s = clamp10(ratio * 10);
  const missed = refTypes.filter((t) => !matched.some((m) => m === t));
  if (matched.length > 0) {
    reasons.push({
      category: "disability",
      severity: "positive",
      text: `Disability fit: serves ${matched.join(", ")}.`,
    });
  }
  if (missed.length > 0) {
    reasons.push({
      category: "disability",
      severity: "negative",
      text: `Disability gap: ${missed.join(", ")} not in served types.`,
    });
  }
  if (refLevel && servedLevels.length > 0 && !servedLevels.includes(refLevel)) {
    s = clamp10(s - 2);
    reasons.push({
      category: "disability",
      severity: "negative",
      text: `Disability level "${r.disability_level}" outside served levels (${(outline.disability_levels_served ?? []).join(", ")}).`,
    });
  }
  return { score: s, reasons };
}

function scoreNeed(
  r: Referral,
  outline: Outline,
): { score: number; reasons: MatchReason[] } {
  const served = normList(outline.need_levels_served);
  const refNeed = norm(r.need_level);
  if (served.length === 0) {
    return {
      score: 8,
      reasons: [
        {
          category: "need",
          severity: "neutral",
          text: "Need: provider has no need-level restriction.",
        },
      ],
    };
  }
  if (!refNeed) {
    return {
      score: 6,
      reasons: [
        {
          category: "need",
          severity: "neutral",
          text: "Need level not recorded on referral.",
        },
      ],
    };
  }
  if (served.includes(refNeed)) {
    return {
      score: 10,
      reasons: [
        {
          category: "need",
          severity: "positive",
          text: `Need: ${r.need_level} is in served need levels.`,
        },
      ],
    };
  }
  return {
    score: 2,
    reasons: [
      {
        category: "need",
        severity: "negative",
        text: `Need: ${r.need_level} not in served levels (${(outline.need_levels_served ?? []).join(", ")}).`,
      },
    ],
  };
}

// Code overlap: deduction CAPPED at −2. Missing codes are outsourceable.
function scoreCodes(
  r: Referral,
  outline: Outline,
): { score: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  const requested = normList(r.requested_codes);
  const held = new Set(normList(outline.codes_held));
  if (requested.length === 0) {
    reasons.push({
      category: "code",
      severity: "neutral",
      text: "Codes: none requested on referral.",
    });
    return { score: 10, reasons };
  }
  const matched = requested.filter((c) => held.has(c));
  const missing = requested.filter((c) => !held.has(c));
  // Deduction capped at −2 total. Missing codes lower, never crater.
  const deduction = Math.min(missing.length, 2);
  const score = clamp10(10 - deduction);

  if (matched.length > 0) {
    reasons.push({
      category: "code",
      severity: "positive",
      text: `Codes held: ${matched.map((c) => c.toUpperCase()).join(", ")}.`,
    });
  }
  if (missing.length > 0) {
    reasons.push({
      category: "code",
      severity: "negative",
      text: `Missing code${missing.length > 1 ? "s" : ""}: ${missing
        .map((c) => c.toUpperCase())
        .join(", ")} (−${deduction}, outsourceable — never filtered out).`,
    });
  }
  return { score, reasons };
}

function blendOverall(
  parts: {
    location_fit: number;
    host_fit: number;
    disability_fit: number;
    need_fit: number;
    code_overlap: number;
  },
  rawWeights: Record<string, number> | null | undefined,
): { overall: number; weights: Record<string, number> } {
  const w = {
    location:
      typeof rawWeights?.location === "number"
        ? rawWeights.location
        : DEFAULT_MATCH_WEIGHTS.location,
    host_fit:
      typeof rawWeights?.host_fit === "number"
        ? rawWeights.host_fit
        : DEFAULT_MATCH_WEIGHTS.host_fit,
    disability_fit:
      typeof rawWeights?.disability_fit === "number"
        ? rawWeights.disability_fit
        : DEFAULT_MATCH_WEIGHTS.disability_fit,
    need_fit:
      typeof rawWeights?.need_fit === "number"
        ? rawWeights.need_fit
        : DEFAULT_MATCH_WEIGHTS.need_fit,
    code_overlap:
      typeof rawWeights?.code_overlap === "number"
        ? rawWeights.code_overlap
        : DEFAULT_MATCH_WEIGHTS.code_overlap,
  };
  const total = w.location + w.host_fit + w.disability_fit + w.need_fit + w.code_overlap || 1;
  const sum =
    w.location * parts.location_fit +
    w.host_fit * parts.host_fit +
    w.disability_fit * parts.disability_fit +
    w.need_fit * parts.need_fit +
    w.code_overlap * parts.code_overlap;
  const overall = Math.max(1, Math.min(10, sum / total));
  return { overall: Math.round(overall * 10) / 10, weights: w };
}

export function computeMatch(
  referral: Referral,
  hosts: HostCard[],
  outline: Outline | null,
): ReferralMatchScore {
  const effOutline: Outline =
    outline ?? {
      location_mode: "anywhere",
      location_values: [],
      codes_held: [],
      need_levels_served: [],
      disability_types_served: [],
      disability_levels_served: [],
      match_weights: null,
    };

  const loc = scoreLocation(referral, effOutline);
  const host = scoreHostFit(referral, hosts);
  const dis = scoreDisability(referral, effOutline);
  const need = scoreNeed(referral, effOutline);
  const code = scoreCodes(referral, effOutline);

  const parts = {
    location_fit: loc.score,
    host_fit: host.score,
    disability_fit: dis.score,
    need_fit: need.score,
    code_overlap: code.score,
  };

  const { overall, weights } = blendOverall(parts, effOutline.match_weights);

  return {
    referral_id: referral.id,
    organization_id: referral.organization_id,
    overall_score: overall,
    location_fit: parts.location_fit,
    host_fit: parts.host_fit,
    disability_fit: parts.disability_fit,
    need_fit: parts.need_fit,
    code_overlap: parts.code_overlap,
    best_host_ids: host.bestHostIds,
    weights,
    reasons: [...loc.reasons, ...host.reasons, ...dis.reasons, ...need.reasons, ...code.reasons],
    computed_at: new Date().toISOString(),
  };
}

// ────────── Server fns ──────────

const orgRef = z.object({
  organization_id: z.string().uuid(),
  referral_id: z.string().uuid(),
});

const REFERRAL_COLS =
  "id, organization_id, first_name, location_city, location_county, disability_types, disability_level, requested_codes, need_level, description";

const HOST_COLS =
  "id, name, location_city, location_county, independence_levels_accepted, medical_comfort, behavioral_comfort, communication_abilities, wheelchair_accessible, sign_language, schedule_availability, status";

async function loadAndCompute(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organization_id: string,
  referral_id: string,
): Promise<ReferralMatchScore> {
  const [refQ, hostQ, outlineQ] = await Promise.all([
    supabase
      .from("referrals")
      .select(REFERRAL_COLS)
      .eq("id", referral_id)
      .eq("organization_id", organization_id)
      .single(),
    supabase
      .from("hhp_cue_cards")
      .select(HOST_COLS)
      .eq("organization_id", organization_id)
      .in("status", ["ready", "onboarding"]),
    supabase
      .from("provider_interest_outline")
      .select(
        "location_mode, location_values, codes_held, need_levels_served, disability_types_served, disability_levels_served, match_weights",
      )
      .eq("organization_id", organization_id)
      .eq("name", "Default")
      .maybeSingle(),
  ]);

  if (refQ.error || !refQ.data) throw new Error(refQ.error?.message || "Referral not found");
  if (hostQ.error) throw new Error(hostQ.error.message);
  if (outlineQ.error) throw new Error(outlineQ.error.message);

  return computeMatch(
    refQ.data as Referral,
    (hostQ.data ?? []) as HostCard[],
    (outlineQ.data ?? null) as Outline | null,
  );
}

// Read OR auto-compute. Used by referral cards.
export const getReferralMatchScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgRef.parse(d))
  .handler(async ({ data, context }): Promise<ReferralMatchScore> => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);

    const { data: cached } = await supabase
      .from("referral_match_scores")
      .select(
        "referral_id, organization_id, overall_score, location_fit, host_fit, disability_fit, need_fit, code_overlap, best_host_ids, weights, reasons, computed_at",
      )
      .eq("referral_id", data.referral_id)
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (cached) {
      return {
        ...cached,
        overall_score: Number(cached.overall_score),
        location_fit: Number(cached.location_fit),
        host_fit: Number(cached.host_fit),
        disability_fit: Number(cached.disability_fit),
        need_fit: Number(cached.need_fit),
        code_overlap: Number(cached.code_overlap),
      } as ReferralMatchScore;
    }

    const computed = await loadAndCompute(
      supabase,
      data.organization_id,
      data.referral_id,
    );

    // Best-effort cache write — requires manage_referrals to insert; if the
    // caller is view-only, the upsert silently fails and we return the
    // computed value anyway.
    await supabase
      .from("referral_match_scores")
      .upsert(
        {
          organization_id: computed.organization_id,
          referral_id: computed.referral_id,
          overall_score: computed.overall_score,
          location_fit: computed.location_fit,
          host_fit: computed.host_fit,
          disability_fit: computed.disability_fit,
          need_fit: computed.need_fit,
          code_overlap: computed.code_overlap,
          best_host_ids: computed.best_host_ids,
          weights: computed.weights,
          reasons: computed.reasons,
          computed_at: computed.computed_at,
        },
        { onConflict: "referral_id" },
      );

    return computed;
  });

// Force recompute (manage_referrals only).
export const recomputeReferralMatchScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgRef.parse(d))
  .handler(async ({ data, context }): Promise<ReferralMatchScore> => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");

    const computed = await loadAndCompute(
      supabase,
      data.organization_id,
      data.referral_id,
    );

    const { error } = await supabase.from("referral_match_scores").upsert(
      {
        organization_id: computed.organization_id,
        referral_id: computed.referral_id,
        overall_score: computed.overall_score,
        location_fit: computed.location_fit,
        host_fit: computed.host_fit,
        disability_fit: computed.disability_fit,
        need_fit: computed.need_fit,
        code_overlap: computed.code_overlap,
        best_host_ids: computed.best_host_ids,
        weights: computed.weights,
        reasons: computed.reasons,
        computed_at: computed.computed_at,
      },
      { onConflict: "referral_id" },
    );
    if (error) throw new Error(error.message);
    return computed;
  });
