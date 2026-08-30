import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { EMAR_STATUS_LABELS, normalizeEmarStatus, type EmarStatus } from "@/lib/emar-status";
import {
  denverMonthUtcBounds,
  denverYmd,
  denverYmdFromInstant,
  parseYmd,
} from "@/lib/denver-date";
import { HhsMonthGrid } from "@/components/hhs/hhs-month-grid";

type LogRow = {
  id: string;
  scheduled_for: string;
  status: string;
  medication_id: string | null;
};

const DOT: Record<EmarStatus, string> = {
  self_administered: "bg-emerald-500",
  refused: "bg-rose-500",
  missed: "bg-amber-500",
  loa: "bg-sky-500",
  omitted: "bg-amber-600",
};

function summarize(statuses: EmarStatus[]): string {
  if (statuses.length === 0) return "no medication log";
  const counts = new Map<EmarStatus, number>();
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .map(([s, n]) => `${n} ${EMAR_STATUS_LABELS[s]}`)
    .join(", ");
}

/**
 * Phone month calendar of eMAR outcomes already saved from the daily note.
 * No per-med log controls.
 */
export function HhsMarOverviewCalendar({
  orgId,
  clientId,
}: {
  orgId: string;
  clientId: string;
}) {
  const todayYmd = denverYmd();
  const todayParts = parseYmd(todayYmd) ?? { year: 2026, month: 8, day: 30 };
  const [cursor, setCursor] = useState({ year: todayParts.year, month: todayParts.month });
  const isCurrentMonth = cursor.year === todayParts.year && cursor.month === todayParts.month;
  const [openYmd, setOpenYmd] = useState<string | null>(null);

  const bounds = denverMonthUtcBounds(cursor.year, cursor.month);

  const { data: logs = [] } = useQuery({
    enabled: !!orgId && !!clientId,
    queryKey: ["hhs-mar-month", orgId, clientId, cursor.year, cursor.month],
    queryFn: async (): Promise<LogRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("emar_logs")
        .select("id, scheduled_for, status, medication_id")
        .eq("organization_id", orgId)
        .eq("client_id", clientId)
        .gte("scheduled_for", bounds.startIso)
        .lt("scheduled_for", bounds.endExclusiveIso);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, EmarStatus[]>();
    for (const row of logs) {
      const ymd = denverYmdFromInstant(row.scheduled_for);
      if (!ymd) continue;
      const list = m.get(ymd) ?? [];
      list.push(normalizeEmarStatus(row.status));
      m.set(ymd, list);
    }
    return m;
  }, [logs]);

  const openStatuses = openYmd ? (byDay.get(openYmd) ?? []) : [];

  return (
    <Card>
      <CardContent className="space-y-3 p-3 sm:p-4">
        <HhsMonthGrid
          year={cursor.year}
          month={cursor.month}
          onMonthChange={(next) => {
            setCursor(next);
            setOpenYmd(null);
          }}
          disableNext={isCurrentMonth}
          title="Medication overview"
          subtitle="Outcomes already recorded on daily notes. Tap a day to see that day’s statuses. Logging is only on the daily note."
          legend={
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden />
                Self administered
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden />
                Missed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden />
                Refused
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" aria-hidden />
                LOA
              </span>
            </div>
          }
          childrenForDay={({ day, ymd }) => {
            const statuses = byDay.get(ymd) ?? [];
            const future = ymd > todayYmd;
            const unique = [...new Set(statuses)];
            return (
              <button
                type="button"
                disabled={future}
                onClick={() => setOpenYmd(ymd)}
                className={`flex h-12 w-full flex-col items-center rounded-lg border pt-1 text-xs font-medium ${
                  future
                    ? "cursor-not-allowed border-transparent bg-muted/30 text-muted-foreground/50"
                    : openYmd === ymd
                      ? "border-primary ring-2 ring-primary"
                      : "bg-background"
                }`}
                aria-label={`Day ${day}: ${summarize(statuses)}`}
              >
                <span>{day}</span>
                {!future && unique.length > 0 ? (
                  <span className="mt-auto mb-1 flex max-w-full flex-wrap justify-center gap-0.5 px-0.5">
                    {unique.slice(0, 4).map((s) => (
                      <span key={s} className={`h-2 w-2 rounded-full ${DOT[s]}`} />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          }}
        />

        {openYmd ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-semibold">{openYmd}</p>
            {openStatuses.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                No medication outcomes saved for this day.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {openStatuses.map((s, i) => (
                  <li key={`${openYmd}-${s}-${i}`} className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${DOT[s]}`} />
                    {EMAR_STATUS_LABELS[s]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Tap a day for that day’s medication outcomes.</p>
        )}
      </CardContent>
    </Card>
  );
}
