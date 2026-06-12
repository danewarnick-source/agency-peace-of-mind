/**
 * CRM Phase B2 — RHS planning board data loader.
 *
 * READ-ONLY. Returns RHS residential homes + their currently-placed RHS
 * clients, plus the small set of REAL composition signals we have stored
 * (capacity, DOB→age, medication load incl. choking-risk and controlled
 * counts, presence of special_directions, compliance flag count).
 *
 * What we deliberately do NOT return (because it isn't stored) and what
 * the UI therefore must NOT claim to score:
 *   - aggression / behavioral compatibility between clients
 *   - disability type or level
 *   - known client↔client conflicts
 *   - interests / personality
 *
 * The board NEVER writes. Session-scoped reshuffling lives entirely in
 * the client component. Gating: view_referrals OR manage_referrals; staff
 * blocked. Dragging itself is gated to manage_referrals client-side.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyPermission } from "@/lib/require-permission";

export type RhsHome = {
  id: string;
  team_name: string;
  setting: string | null;
  capacity: number | null;
  address: string | null;
};

export type RhsClient = {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string | null;
  date_of_birth: string | null;
  authorized_dspd_codes: string[];
  has_special_directions: boolean;
  med_count: number;
  choking_risk: boolean;
  controlled_med: boolean;
  compliance_flag_count: number;
};

export type RhsBoardSnapshot = {
  organization_id: string;
  homes: RhsHome[];
  clients: RhsClient[];
  /** Signals NOT stored — UI must surface this honestly. */
  unscored_signals: string[];
};

const orgOnly = z.object({ organization_id: z.string().uuid() });

export const getRhsBoardSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }): Promise<RhsBoardSnapshot> => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);

    const [teamQ, clientQ, medQ, flagQ] = await Promise.all([
      supabase
        .from("teams")
        .select("id, team_name, setting, capacity, address, team_type, active")
        .eq("organization_id", data.organization_id)
        .eq("active", true),
      supabase
        .from("clients")
        .select(
          "id, first_name, last_name, team_id, date_of_birth, authorized_dspd_codes, special_directions, account_status",
        )
        .eq("organization_id", data.organization_id)
        .eq("account_status", "active"),
      supabase
        .from("client_medications")
        .select("client_id, is_active, choking_risk, is_controlled")
        .eq("organization_id", data.organization_id)
        .eq("is_active", true),
      supabase
        .from("bc_flags")
        .select("client_id")
        .eq("organization_id", data.organization_id),
    ]);

    for (const q of [teamQ, clientQ, medQ, flagQ]) {
      if (q.error) throw new Error(q.error.message);
    }

    // Filter teams down to residential (RHS lives in residential homes; we
    // treat setting='residential' or team_type='group_home' as in-scope).
    const homes: RhsHome[] = (
      (teamQ.data ?? []) as Array<{
        id: string;
        team_name: string;
        setting: string | null;
        capacity: number | null;
        address: string | null;
        team_type: string | null;
      }>
    )
      .filter(
        (t) =>
          (t.setting ?? "").toLowerCase() === "residential" ||
          t.team_type === "group_home",
      )
      .map(({ id, team_name, setting, capacity, address }) => ({
        id,
        team_name,
        setting,
        capacity,
        address,
      }));

    // Roll up medication signals per client.
    type MedRow = {
      client_id: string;
      is_active: boolean | null;
      choking_risk: boolean | null;
      is_controlled: boolean | null;
    };
    const medByClient = new Map<
      string,
      { count: number; choking: boolean; controlled: boolean }
    >();
    for (const m of (medQ.data ?? []) as MedRow[]) {
      const prev = medByClient.get(m.client_id) ?? {
        count: 0,
        choking: false,
        controlled: false,
      };
      prev.count += 1;
      if (m.choking_risk) prev.choking = true;
      if (m.is_controlled) prev.controlled = true;
      medByClient.set(m.client_id, prev);
    }

    const flagByClient = new Map<string, number>();
    for (const f of (flagQ.data ?? []) as Array<{ client_id: string }>) {
      flagByClient.set(f.client_id, (flagByClient.get(f.client_id) ?? 0) + 1);
    }

    // Only RHS-authorized clients. RHS is a residential daily-rate; if it's
    // not on authorized_dspd_codes the client isn't an RHS planning target.
    const isRhs = (codes: string[] | null | undefined) =>
      (codes ?? []).some((c) => c.toLowerCase().trim() === "rhs");

    const clients: RhsClient[] = (
      (clientQ.data ?? []) as Array<{
        id: string;
        first_name: string;
        last_name: string;
        team_id: string | null;
        date_of_birth: string | null;
        authorized_dspd_codes: string[] | null;
        special_directions: string | null;
      }>
    )
      .filter((c) => isRhs(c.authorized_dspd_codes))
      .map((c) => {
        const med = medByClient.get(c.id) ?? {
          count: 0,
          choking: false,
          controlled: false,
        };
        return {
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          team_id: c.team_id,
          date_of_birth: c.date_of_birth,
          authorized_dspd_codes: c.authorized_dspd_codes ?? [],
          has_special_directions: !!(
            c.special_directions && c.special_directions.trim().length > 0
          ),
          med_count: med.count,
          choking_risk: med.choking,
          controlled_med: med.controlled,
          compliance_flag_count: flagByClient.get(c.id) ?? 0,
        };
      });

    return {
      organization_id: data.organization_id,
      homes,
      clients,
      unscored_signals: [
        "behavioral / interpersonal compatibility",
        "disability type and level",
        "known client–client conflicts",
        "interests and personality",
      ],
    };
  });
