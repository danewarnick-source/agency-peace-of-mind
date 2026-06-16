import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ScheduledDose = {
  medication_id: string;
  medication_name: string;
  dosage: string | null;
  time_label: string;        // "HH:MM"
  scheduled_for_iso: string; // anchored within window
  logged: boolean;
};

export type ShiftMedAttestationStatus = {
  loading: boolean;
  tableMissing: boolean;     // shift_medication_attestations not created yet
  hasActiveMeds: boolean;
  scheduledDoses: ScheduledDose[];
  allDosesLogged: boolean;
  unloggedCount: number;
};

/**
 * Reads the client's active medications, expands their scheduled_times into
 * concrete dose timestamps falling inside the given window, then checks
 * `emar_logs` for matching observed/refused/etc. entries.
 *
 * Used by both the staff clock-out gate (EVV punch-pad) and the HHS daily
 * note gate. The window for clock-out is clock-in → now; the window for an
 * HHS daily note is start-of-day → end-of-day for that record.
 */
export function useShiftMedAttestationStatus(args: {
  organizationId: string | null | undefined;
  clientId: string | null | undefined;
  windowStart: string | null | undefined;
  windowEnd: string | null | undefined;
  enabled?: boolean;
}): ShiftMedAttestationStatus {
  const { organizationId, clientId, windowStart, windowEnd } = args;
  const enabled = !!(args.enabled !== false && organizationId && clientId && windowStart && windowEnd);

  const q = useQuery({
    enabled,
    queryKey: [
      "shift-med-attestation-status",
      organizationId,
      clientId,
      windowStart,
      windowEnd,
    ],
    queryFn: async () => {
      // 1) Probe whether the attestation table exists yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const probe = await (supabase as any)
        .from("shift_medication_attestations")
        .select("id", { head: true, count: "exact" })
        .limit(1);
      const tableMissing =
        !!probe.error && /relation .* does not exist|schema cache/i.test(String(probe.error.message));

      // 2) Active medications for this client.
      const { data: meds, error: medsErr } = await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              eq: (
                c: string,
                v: string,
              ) => {
                eq: (c: string, v: boolean) => Promise<{
                  data: Array<{
                    id: string;
                    medication_name: string;
                    dosage: string | null;
                    scheduled_times: string[] | null;
                  }> | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      })
        .from("client_medications")
        .select("id, medication_name, dosage, scheduled_times")
        .eq("organization_id", organizationId!)
        .eq("client_id", clientId!)
        .eq("is_active", true);
      if (medsErr) throw new Error(medsErr.message);

      const activeMeds = meds ?? [];
      if (activeMeds.length === 0) {
        return {
          tableMissing,
          hasActiveMeds: false,
          scheduledDoses: [] as ScheduledDose[],
        };
      }

      // 3) Expand scheduled_times into concrete ISO times inside the window.
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
                time_label: t,
                scheduled_for_iso: d.toISOString(),
                logged: false,
              });
            }
          }
        });
      });

      // 4) Cross-check existing eMAR logs in window.
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

      // Sort by scheduled time.
      doses.sort((a, b) => a.scheduled_for_iso.localeCompare(b.scheduled_for_iso));

      return {
        tableMissing,
        hasActiveMeds: true,
        scheduledDoses: doses,
      };
    },
  });

  const data = q.data ?? { tableMissing: false, hasActiveMeds: false, scheduledDoses: [] };
  const unloggedCount = data.scheduledDoses.filter((d) => !d.logged).length;
  return {
    loading: enabled && q.isLoading,
    tableMissing: data.tableMissing,
    hasActiveMeds: data.hasActiveMeds,
    scheduledDoses: data.scheduledDoses,
    allDosesLogged: data.scheduledDoses.length === 0 || unloggedCount === 0,
    unloggedCount,
  };
}
