/**
 * CRM Phase B1 — Client Whiteboard data loader.
 *
 * READ-ONLY. This server fn aggregates the snapshot the planning Whiteboard
 * needs and NEVER writes to Teams/Homes, clients, placements, hhp_cue_cards,
 * or referrals. B2 will add the drag-and-drop rematch board on top of this.
 *
 * Gating:
 *   - read → view_referrals OR manage_referrals
 *   - staff blocked
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyPermission } from "@/lib/require-permission";

export type WhiteboardCategory = "direct_support" | "rhs" | "hhs";

export type WhiteboardReferral = {
  id: string;
  first_name: string;
  location_city: string | null;
  location_county: string | null;
  requested_codes: string[];
  need_level: string | null;
  category: WhiteboardCategory | null;
  inferred_category: WhiteboardCategory;
  stage: string | null;
  status: string | null;
  match_score: number | null;
  scored_components: string[] | null;
  best_host_ids: string[];
};

export type WhiteboardClient = {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string | null;
  team_name: string | null;
  team_setting: string | null;
  authorized_dspd_codes: string[];
  account_status: string;
  inferred_category: WhiteboardCategory;
};

export type WhiteboardHost = {
  id: string;
  name: string;
  location_city: string | null;
  location_county: string | null;
  independence_levels_accepted: string[];
  medical_comfort: string[];
  behavioral_comfort: string | null;
  wheelchair_accessible: boolean;
  sign_language: boolean;
  status: "onboarding" | "ready" | "placed";
};

export type WhiteboardSnapshot = {
  organization_id: string;
  referrals: WhiteboardReferral[];
  clients: WhiteboardClient[];
  hosts: WhiteboardHost[];
  /** Map of host_id → array of suggested new referrals (by id), with score. */
  host_suggestions: Array<{
    host_id: string;
    referral_id: string;
    score: number;
  }>;
};

// Code → category inference. Used when a referral or client has no explicit
// category set. Conservative: residential / host-home codes win; otherwise
// direct_support.
const HHS_CODES = new Set(["hhs", "rhs"]); // RHS is residential staffed; HHS host-home daily.
const RESIDENTIAL_CODES = new Set(["rhs", "slh", "sln"]);
const HOST_HOME_CODES = new Set(["hhs"]);

function inferCategory(codes: string[] | null | undefined): WhiteboardCategory {
  const norm = (codes ?? []).map((c) => c.toLowerCase().trim()).filter(Boolean);
  if (norm.some((c) => HOST_HOME_CODES.has(c))) return "hhs";
  if (norm.some((c) => RESIDENTIAL_CODES.has(c))) return "rhs";
  return "direct_support";
}

const orgOnly = z.object({ organization_id: z.string().uuid() });

export const getWhiteboardSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }): Promise<WhiteboardSnapshot> => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);

    const [refQ, clientQ, teamQ, hostQ, scoreQ] = await Promise.all([
      supabase
        .from("referrals")
        .select(
          "id, first_name, location_city, location_county, requested_codes, need_level, category, stage, status",
        )
        .eq("organization_id", data.organization_id)
        .neq("status", "archived")
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("clients")
        .select(
          "id, first_name, last_name, team_id, authorized_dspd_codes, account_status",
        )
        .eq("organization_id", data.organization_id)
        .eq("account_status", "active"),
      supabase
        .from("teams")
        .select("id, team_name, setting")
        .eq("organization_id", data.organization_id)
        .eq("active", true),
      supabase
        .from("hhp_cue_cards")
        .select(
          "id, name, location_city, location_county, independence_levels_accepted, medical_comfort, behavioral_comfort, wheelchair_accessible, sign_language, status",
        )
        .eq("organization_id", data.organization_id)
        .in("status", ["ready", "onboarding"]),
      supabase
        .from("referral_match_scores")
        .select(
          "referral_id, overall_score, scored_components, best_host_ids",
        )
        .eq("organization_id", data.organization_id),
    ]);

    for (const q of [refQ, clientQ, teamQ, hostQ, scoreQ]) {
      if (q.error) throw new Error(q.error.message);
    }

    const teamById = new Map<
      string,
      { team_name: string; setting: string | null }
    >();
    for (const t of (teamQ.data ?? []) as Array<{
      id: string;
      team_name: string;
      setting: string | null;
    }>) {
      teamById.set(t.id, { team_name: t.team_name, setting: t.setting });
    }

    const scoreByRef = new Map<
      string,
      { overall: number; scored: string[] | null; bestHosts: string[] }
    >();
    for (const s of (scoreQ.data ?? []) as Array<{
      referral_id: string;
      overall_score: string | number;
      scored_components: string[] | null;
      best_host_ids: string[] | null;
    }>) {
      scoreByRef.set(s.referral_id, {
        overall: Number(s.overall_score),
        scored: s.scored_components ?? null,
        bestHosts: s.best_host_ids ?? [],
      });
    }

    const referrals: WhiteboardReferral[] = (
      (refQ.data ?? []) as Array<{
        id: string;
        first_name: string;
        location_city: string | null;
        location_county: string | null;
        requested_codes: string[] | null;
        need_level: string | null;
        category: string | null;
        stage: string | null;
        status: string | null;
      }>
    ).map((r) => {
      const codes = r.requested_codes ?? [];
      const cat = (r.category as WhiteboardCategory | null) ?? null;
      const score = scoreByRef.get(r.id);
      return {
        id: r.id,
        first_name: r.first_name,
        location_city: r.location_city,
        location_county: r.location_county,
        requested_codes: codes,
        need_level: r.need_level,
        category: cat,
        inferred_category: cat ?? inferCategory(codes),
        stage: r.stage,
        status: r.status,
        match_score:
          score && score.scored && score.scored.length > 0
            ? score.overall
            : null,
        scored_components: score?.scored ?? null,
        best_host_ids: score?.bestHosts ?? [],
      };
    });

    const clients: WhiteboardClient[] = (
      (clientQ.data ?? []) as Array<{
        id: string;
        first_name: string;
        last_name: string;
        team_id: string | null;
        authorized_dspd_codes: string[] | null;
        account_status: string;
      }>
    ).map((c) => {
      const team = c.team_id ? teamById.get(c.team_id) : undefined;
      const codes = c.authorized_dspd_codes ?? [];
      return {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        team_id: c.team_id,
        team_name: team?.team_name ?? null,
        team_setting: team?.setting ?? null,
        authorized_dspd_codes: codes,
        account_status: c.account_status,
        inferred_category: inferCategory(codes),
      };
    });

    const hosts: WhiteboardHost[] = (
      (hostQ.data ?? []) as WhiteboardHost[]
    ).map((h) => ({
      ...h,
      independence_levels_accepted: h.independence_levels_accepted ?? [],
      medical_comfort: h.medical_comfort ?? [],
    }));

    // Build host_suggestions: for each ready/onboarding host, the referrals
    // that listed it among their best_host_ids (those came out of the A5
    // matcher) with the referral's cached overall score. Only meaningful
    // scores (scored_components non-empty) are surfaced.
    const hostIds = new Set(hosts.map((h) => h.id));
    const host_suggestions: WhiteboardSnapshot["host_suggestions"] = [];
    for (const r of referrals) {
      if (r.match_score == null) continue;
      for (const hid of r.best_host_ids) {
        if (!hostIds.has(hid)) continue;
        host_suggestions.push({
          host_id: hid,
          referral_id: r.id,
          score: r.match_score,
        });
      }
    }
    host_suggestions.sort((a, b) => b.score - a.score);

    return {
      organization_id: data.organization_id,
      referrals,
      clients,
      hosts,
      host_suggestions,
    };
  });
