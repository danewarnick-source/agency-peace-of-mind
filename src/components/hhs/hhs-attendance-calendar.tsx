import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { listAttendance } from "@/lib/hhs.functions";
import { denverYmd, parseYmd, ymdFromParts } from "@/lib/denver-date";
import { HhsMonthGrid } from "@/components/hhs/hhs-month-grid";

type Presence = "Present" | "Away" | null;

function monthEndYmd(year: number, month: number): string {
  const last = new Date(year, month, 0).getDate();
  return ymdFromParts(year, month, last);
}

/**
 * Phone month calendar for HHS attendance. View only.
 * Green = present / services provided (saved daily note or Present row).
 * Red = existing not-present (Away) row. Empty day = no mark.
 */
export function HhsAttendanceCalendar({
  orgId,
  clientId,
}: {
  orgId: string;
  clientId: string;
}) {
  const todayYmd = denverYmd();
  const todayParts = parseYmd(todayYmd) ?? { year: 2026, month: 8, day: 30 };
  const [cursor, setCursor] = useState({ year: todayParts.year, month: todayParts.month });
  const listFn = useServerFn(listAttendance);
  const monthStart = ymdFromParts(cursor.year, cursor.month, 1);
  const monthEnd = monthEndYmd(cursor.year, cursor.month);
  const isCurrentMonth = cursor.year === todayParts.year && cursor.month === todayParts.month;

  const { data: attRows = [] } = useQuery({
    enabled: !!orgId && !!clientId,
    queryKey: ["hhs-att-month", orgId, clientId, monthStart],
    queryFn: () =>
      listFn({ data: { organizationId: orgId, monthStart, monthEnd } }),
  });

  const { data: noteDates = [] } = useQuery({
    enabled: !!orgId && !!clientId,
    queryKey: ["hhs-note-dates", orgId, clientId, monthStart],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("daily_logs")
        .select("log_date")
        .eq("organization_id", orgId)
        .eq("client_id", clientId)
        .gte("log_date", monthStart)
        .lte("log_date", monthEnd);
      if (error) throw error;
      return (data ?? []).map((r: { log_date: string }) => String(r.log_date).slice(0, 10));
    },
  });

  const byDate = useMemo(() => {
    const m = new Map<string, Presence>();
    for (const r of attRows as Array<Record<string, unknown>>) {
      if (String(r.client_id) !== clientId) continue;
      const status = String(r.presence_status ?? "");
      m.set(String(r.record_date).slice(0, 10), status === "Away" ? "Away" : status === "Present" ? "Present" : null);
    }
    return m;
  }, [attRows, clientId]);

  const notes = useMemo(() => new Set(noteDates), [noteDates]);

  function markFor(ymd: string): "green" | "red" | "none" {
    if (notes.has(ymd) || byDate.get(ymd) === "Present") return "green";
    if (byDate.get(ymd) === "Away") return "red";
    return "none";
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-3 sm:p-4">
        <HhsMonthGrid
          year={cursor.year}
          month={cursor.month}
          onMonthChange={setCursor}
          disableNext={isCurrentMonth}
          title="Monthly attendance"
          subtitle="A saved daily note marks the day present. Green = services provided. Red = recorded not present. Empty = no mark. Logging Present happens on the daily note."
          legend={
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden />
                Present / services provided
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden />
                Not present
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-border bg-background" aria-hidden />
                No mark
              </span>
            </div>
          }
          childrenForDay={({ day, ymd }) => {
            const mark = markFor(ymd);
            const future = ymd > todayYmd;
            const label =
              mark === "green"
                ? `Day ${day}: present, services provided`
                : mark === "red"
                  ? `Day ${day}: not present`
                  : `Day ${day}: no attendance mark`;
            return (
              <div
                className={`relative flex h-12 flex-col items-center justify-start rounded-lg border pt-1 text-xs font-medium ${
                  future ? "border-transparent bg-muted/30 text-muted-foreground/50" : "bg-background"
                }`}
                aria-label={label}
              >
                <span>{day}</span>
                {!future && mark === "green" ? (
                  <span className="mt-auto mb-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                ) : null}
                {!future && mark === "red" ? (
                  <span className="mt-auto mb-1 h-2.5 w-2.5 rounded-full bg-rose-500" />
                ) : null}
              </div>
            );
          }}
        />
      </CardContent>
    </Card>
  );
}
