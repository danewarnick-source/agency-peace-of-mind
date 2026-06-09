import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Coverage requirement generator — READ-ONLY / DERIVED.
 *
 * Given a home (team) and a date, returns the coverage shape for that day:
 *  - the active shift bands for the home (per-home overrides shadow org defaults)
 *  - per band, the list of coverage units derived from clients in the home + their
 *    ratios for the chosen `setting`
 *  - per band, the required staff count = sum of staff side of each unit's ratio
 *
 * A coverage unit is either:
 *   - a single client at a 1:N ratio (the unit holds that client; staff = ratio_staff)
 *   - a group of clients sharing the same ratio (the unit holds up to ratio_clients
 *     clients; staff = ratio_staff)
 *
 * This function does NOT write to or modify shifts/assignments anywhere.
 */
export const generateCoverageRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { homeId: string; date: string; setting?: string }) => ({
    homeId: input.homeId,
    date: input.date,
    setting: input.setting ?? "residential",
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { homeId, date, setting } = data;

    // Resolve org from the team/home, and ensure the caller can see it (RLS).
    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .select("id, organization_id, team_name")
      .eq("id", homeId)
      .maybeSingle();
    if (teamErr) throw teamErr;
    if (!team) throw new Error("Home not found or not accessible");

    // Active clients in the home.
    const { data: clients, error: clientsErr } = await supabase
      .from("clients")
      .select("id, first_name, last_name, account_status")
      .eq("team_id", homeId)
      .eq("account_status", "active");
    if (clientsErr) throw clientsErr;

    const clientIds = (clients ?? []).map((c) => c.id);

    // Ratios for these clients, effective on the given date, for the chosen setting.
    let ratios: Array<{
      client_id: string;
      setting: string;
      ratio_staff: number;
      ratio_clients: number;
      effective_start: string;
      effective_end: string | null;
    }> = [];
    if (clientIds.length > 0) {
      const { data: r, error: rErr } = await supabase
        .from("client_ratios")
        .select("client_id, setting, ratio_staff, ratio_clients, effective_start, effective_end")
        .in("client_id", clientIds)
        .eq("setting", setting)
        .lte("effective_start", date);
      if (rErr) throw rErr;
      ratios = (r ?? []).filter((x) => !x.effective_end || x.effective_end >= date);
    }
    const ratioByClient = new Map(ratios.map((x) => [x.client_id, x]));

    // Shift bands: per-home overrides if any, else org-level defaults.
    const { data: tmplOverride, error: tErr } = await supabase
      .from("shift_templates")
      .select("id, name, start_time, end_time, sort")
      .eq("team_id", homeId)
      .eq("active", true)
      .order("sort", { ascending: true });
    if (tErr) throw tErr;
    let templates = tmplOverride ?? [];
    if (templates.length === 0) {
      const { data: tmplOrg, error: tOrgErr } = await supabase
        .from("shift_templates")
        .select("id, name, start_time, end_time, sort")
        .eq("organization_id", team.organization_id!)
        .is("team_id", null)
        .eq("active", true)
        .order("sort", { ascending: true });
      if (tOrgErr) throw tOrgErr;
      templates = tmplOrg ?? [];
    }

    // Group clients by ratio key. 1:1 → each client is its own unit.
    // N:M (M>1) → bin-pack into units of size up to M (staff = N per unit).
    const ungrouped: typeof clients = [];
    const groups = new Map<string, { ratio_staff: number; ratio_clients: number; clients: typeof clients }>();
    for (const c of clients ?? []) {
      const r = ratioByClient.get(c.id);
      if (!r) {
        ungrouped.push(c);
        continue;
      }
      if (r.ratio_clients === 1) {
        const key = `solo:${c.id}`;
        groups.set(key, { ratio_staff: r.ratio_staff, ratio_clients: 1, clients: [c] });
      } else {
        const key = `${r.ratio_staff}:${r.ratio_clients}`;
        const existing = groups.get(key);
        if (existing) existing.clients.push(c);
        else groups.set(key, { ratio_staff: r.ratio_staff, ratio_clients: r.ratio_clients, clients: [c] });
      }
    }

    // Build coverage units (bin-pack each multi-client group).
    type Unit = { ratio: string; staff: number; clients: Array<{ id: string; name: string }> };
    const units: Unit[] = [];
    for (const g of groups.values()) {
      const cap = g.ratio_clients;
      for (let i = 0; i < g.clients.length; i += cap) {
        const slice = g.clients.slice(i, i + cap);
        units.push({
          ratio: `${g.ratio_staff}:${g.ratio_clients}`,
          staff: g.ratio_staff,
          clients: slice.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() })),
        });
      }
    }
    const requiredStaff = units.reduce((sum, u) => sum + u.staff, 0);

    // Same shape applies to each band (Step 6 spec: per band, list of units + required count).
    const bands = templates.map((t) => ({
      template_id: t.id,
      name: t.name,
      start_time: t.start_time,
      end_time: t.end_time,
      units,
      required_staff: requiredStaff,
    }));

    return {
      home: { id: team.id, name: team.team_name, organization_id: team.organization_id },
      date,
      setting,
      bands,
      clients_without_ratio: ungrouped.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() })),
      total_required_staff_per_band: requiredStaff,
    };
  });
