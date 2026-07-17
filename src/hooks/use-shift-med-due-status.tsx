import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ScheduledDose = {
  medication_id: string;
  medication_name: string;
  dosage: string | null;
  route: string | null;
  is_prn: boolean;
  is_controlled: boolean;
  is_rescue: boolean;
  time_label: string;        // "HH:MM"
  scheduled_for_iso: string; // anchored within window
  logged: boolean;
};

export type ShiftMedDueStatus = {
  loading: boolean;
  scheduledDoses: ScheduledDose[];
  allDosesLogged: boolean;
  unloggedCount: number;
};

/**
 * Expands the client's active medication `scheduled_times` into concrete dose
 * timestamps inside the given window and checks `emar_logs` for a matching
 * (medication_id, scheduled_for) row. Single source of truth used by both the
 * EVV clock-out gate (window = clock-in → now) and the HHS daily-note gate
 * (window = start-of-day → end-of-day) — "was this dose logged?" is answered
 * by the real MAR (`emar_logs`), never by a shadow attestation.
 */
export function useShiftMedDueStatus(args: {
  organizationId: string | null | undefined;
  clientId: string | null | undefined;
  windowStart: string | null | undefined;
  windowEnd: string | null | undefined;
  enabled?: boolean;
}): ShiftMedDueStatus {
  const { organizationId, clientId, windowStart, windowEnd } = args;
  const enabled = !!(args.enabled !== false && organizationId && clientId && windowStart && windowEnd);

  const q = useQuery({
    enabled,
    // Refetch when the user returns from the eMAR tab so newly-logged doses
    // flip the gate green automatically.
    refetchOnWindowFocus: true,
    queryKey: [
      "shift-med-due-status",
      organizationId,
      clientId,
      windowStart,
      windowEnd,
    ],
    queryFn: async (): Promise<{ scheduledDoses: ScheduledDose[] }> => {
      // 1) Active medications for this client.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: meds, error: medsErr } = await (supabase as any)
        .from("client_medications")
        .select("id, medication_name, dosage, route, scheduled_times, is_prn, is_controlled, is_rescue")
        .eq("organization_id", organizationId!)
        .eq("client_id", clientId!)
        .eq("is_active", true);
      if (medsErr) throw new Error(medsErr.message);

      const activeMeds = (meds ?? []) as Array<{
        id: string;
        medication_name: string;
        dosage: string | null;
        route: string | null;
        scheduled_times: string[] | null;
        is_prn: boolean;
        is_controlled: boolean;
        is_rescue: boolean;
      }>;
      if (activeMeds.length === 0) return { scheduledDoses: [] };

      // 2) Expand scheduled_times into concrete ISO times inside the window.
      const wsMs = new Date(windowStart!).getTime();
      const weMs = new Date(windowEnd!).getTime();
      const dayAnchor = new Date(windowStart!);
      dayAnchor.setHours(0, 0, 0, 0);

      const doses: ScheduledDose[] = [];
      activeMeds.forEach((m) => {
        (m.scheduled_times ?? []).forEach((t) => {
          const [hh, mm] = String(t).split(":").map(Number);
          if (Number.isNaN(hh)) return;
          // Try the anchor day + 1 day on either side to catch overnight windows.
          for (const dayOffset of [-1, 0, 1]) {
            const d = new Date(dayAnchor);
            d.setDate(d.getDate() + dayOffset);
            d.setHours(hh, Number.isFinite(mm) ? mm : 0, 0, 0);
            const ms = d.getTime();
            if (ms >= wsMs && ms <= weMs) {
              doses.push({
                medication_id: m.id,
                medication_name: m.medication_name,
                dosage: m.dosage,
                route: m.route,
                is_prn: m.is_prn,
                is_controlled: m.is_controlled,
                is_rescue: m.is_rescue,
                time_label: t,
                scheduled_for_iso: d.toISOString(),
                logged: false,
              });
            }
          }
        });
      });

      // 3) Cross-check existing eMAR logs in window.
      if (doses.length > 0) {
        const medIds = Array.from(new Set(doses.map((d) => d.medication_id)));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: logs } = await (supabase as any)
          .from("emar_logs")
          .select("medication_id, scheduled_for")
          .eq("organization_id", organizationId!)
          .eq("client_id", clientId!)
          .in("medication_id", medIds)
          .gte("scheduled_for", new Date(wsMs).toISOString())
          .lte("scheduled_for", new Date(weMs).toISOString());
        const loggedKeys = new Set<string>(
          ((logs ?? []) as Array<{ medication_id: string; scheduled_for: string }>).map(
            (l) => `${l.medication_id}|${new Date(l.scheduled_for).toISOString()}`,
          ),
        );
        doses.forEach((d) => {
          d.logged = loggedKeys.has(`${d.medication_id}|${d.scheduled_for_iso}`);
        });
      }

      // Dedupe by medication_id + time_label — the [-1,0,1] day expansion above
      // can match the same scheduled time on multiple calendar days when the
      // shift window is long or straddles midnight. Keep the occurrence whose
      // scheduled_for_iso is closest to the window midpoint.
      const midMs = (wsMs + weMs) / 2;
      const bestByKey = new Map<string, ScheduledDose>();
      for (const d of doses) {
        const key = `${d.medication_id}|${d.time_label}`;
        const existing = bestByKey.get(key);
        if (!existing) {
          bestByKey.set(key, d);
          continue;
        }
        // Any logged occurrence wins; otherwise closest to window midpoint.
        if (d.logged && !existing.logged) {
          bestByKey.set(key, d);
          continue;
        }
        if (existing.logged && !d.logged) continue;
        const distNew = Math.abs(new Date(d.scheduled_for_iso).getTime() - midMs);
        const distOld = Math.abs(new Date(existing.scheduled_for_iso).getTime() - midMs);
        if (distNew < distOld) bestByKey.set(key, d);
      }
      const deduped = Array.from(bestByKey.values());
      deduped.sort((a, b) => a.scheduled_for_iso.localeCompare(b.scheduled_for_iso));
      return { scheduledDoses: deduped };
    },
  });

  const doses = q.data?.scheduledDoses ?? [];
  const unloggedCount = doses.filter((d) => !d.logged).length;
  return {
    loading: enabled && q.isLoading,
    scheduledDoses: doses,
    allDosesLogged: doses.length === 0 || unloggedCount === 0,
    unloggedCount,
  };
}
