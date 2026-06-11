import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ShieldCheck, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  getHhsMonthData, getMonthCertification, certifyHhsMonth,
  type AttendanceRow, type BlockedDay,
} from "@/lib/hhs-certifications.functions";

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Monthly Attendance roll-up for an HHS client: a read-only month grid
 * compiled from the host family's daily attendance entries, present/away/
 * unbillable counts, and a month-end "Certify month" sign-off. The certify
 * action and status come from hhs_monthly_certifications (a human SQL
 * handoff) — until that table exists, Certify is disabled with a
 * "Pending database update" tooltip and nothing crashes.
 */
export function HhsMonthlyAttendanceTab({
  orgId, clientId, clientName,
}: {
  orgId: string;
  clientId: string;
  clientName: string;
}) {
  const { data: org } = useCurrentOrg();
  const canCertify = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";
  const qc = useQueryClient();

  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const monthKey = fmt(monthStart);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isFutureMonth = monthStart > today;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const monthEnded = monthEnd < today;

  const dataFn = useServerFn(getHhsMonthData);
  const certGetFn = useServerFn(getMonthCertification);
  const certifyFn = useServerFn(certifyHhsMonth);

  const { data, isLoading } = useQuery({
    enabled: !!orgId && !isFutureMonth,
    queryKey: ["hhs-month-rollup", orgId, clientId, monthKey],
    queryFn: () => dataFn({ data: { organizationId: orgId, clientId, monthStart: fmt(monthStart), monthEnd: fmt(monthEnd) } }),
  });

  const certQ = useQuery({
    enabled: !!orgId,
    queryKey: ["hhs-month-cert", orgId, clientId, monthKey],
    queryFn: () => certGetFn({ data: { organizationId: orgId, clientId, month: monthKey } }),
  });

  const attByDate = useMemo(() => {
    const m = new Map<string, AttendanceRow>();
    for (const r of (data?.attendance ?? [])) m.set(r.record_date, r);
    return m;
  }, [data]);
  const blockedByDate = useMemo(() => {
    const m = new Map<string, BlockedDay>();
    for (const b of (data?.blocked ?? [])) m.set(b.record_date, b);
    return m;
  }, [data]);

  const counts = useMemo(() => {
    let present = 0, away = 0;
    for (const r of (data?.attendance ?? [])) {
      if (r.presence_status === "Present") present++;
      else if (r.presence_status === "Away") away++;
    }
    const blocked = (data?.blocked ?? []).length;
    // "No entry" = elapsed days in the month with no attendance row.
    const lastElapsed = isCurrentMonth ? today.getDate() : daysInMonth;
    let noEntry = 0;
    for (let day = 1; day <= lastElapsed; day++) {
      if (!attByDate.has(fmt(new Date(year, month, day)))) noEntry++;
    }
    return { present, away, blocked, noEntry };
  }, [data, attByDate, isCurrentMonth, daysInMonth, today, year, month]);

  const certify = useMutation({
    mutationFn: () =>
      certifyFn({
        data: {
          organizationId: orgId, clientId, month: monthKey,
          presentDays: counts.present, awayDays: counts.away, blockedDays: counts.blocked,
        },
      }),
    onSuccess: () => {
      toast.success(`${monthStart.toLocaleString(undefined, { month: "long", year: "numeric" })} certified.`);
      qc.invalidateQueries({ queryKey: ["hhs-month-cert", orgId, clientId, monthKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tableReady = certQ.data?.tableReady ?? false;
  const cert = certQ.data?.cert ?? null;
  const needsCertification = monthEnded && !cert; // amber chip on uncertified PAST months

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">📅 Monthly Attendance · {clientName}</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Previous month"
              onClick={() => setAnchor(new Date(year, month - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[7.5rem] text-center text-sm font-semibold">
              {monthStart.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </span>
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Next month"
              disabled={isCurrentMonth || isFutureMonth}
              onClick={() => setAnchor(new Date(year, month + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Compiled from the host family's daily attendance. Green = present (billable), amber = away,
          red dot = unbillable day, grey = no entry. Read-only — entries are made on the Attendance tab.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Counts */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <CountTile label="Present" value={counts.present} tone="green" />
          <CountTile label="Away" value={counts.away} tone="amber" />
          <CountTile label="Unbillable" value={counts.blocked} tone="red" />
          <CountTile label="No entry" value={counts.noEntry} tone="muted" />
        </div>

        {/* Month grid */}
        {isFutureMonth ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Future month.</p>
        ) : isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading attendance…</p>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-medium text-muted-foreground">{d}</div>
            ))}
            {Array.from({ length: monthStart.getDay() }).map((_, i) => <div key={`pad-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const key = fmt(new Date(year, month, day));
              const rec = attByDate.get(key);
              const blocked = blockedByDate.get(key);
              const status = rec?.presence_status ?? null;
              const future = isCurrentMonth && day > today.getDate();
              const cls = future
                ? "bg-muted/30 text-muted-foreground/40"
                : status === "Present"
                  ? "bg-green-200 dark:bg-green-900/40 text-green-900 dark:text-green-100 border-green-400"
                  : status === "Away"
                    ? "bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border-amber-400"
                    : "bg-background";
              const title = status
                ? `Day ${day}: ${status}${rec?.away_category ? ` (${rec.away_category})` : ""}${blocked ? ` · unbillable: ${blocked.blocked_reason ?? "—"}` : ""}`
                : blocked
                  ? `Day ${day}: unbillable — ${blocked.blocked_reason ?? "—"}`
                  : `Day ${day}: no entry`;
              return (
                <div key={day} title={title}
                  className={`relative h-11 rounded border text-xs font-medium ${cls}`}>
                  <div className="absolute left-1 top-0.5">{day}</div>
                  {status === "Present" && <div className="absolute right-1 top-0.5 text-[9px]">✓</div>}
                  {status === "Away" && <div className="absolute right-1 top-0.5 text-[8px] font-bold">AWAY</div>}
                  {blocked && <div className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-red-500" />}
                </div>
              );
            })}
          </div>
        )}

        {/* Unbillable reasons list */}
        {(data?.blocked ?? []).length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50/60 p-2 text-xs dark:border-red-900 dark:bg-red-950/20">
            <p className="mb-1 font-semibold text-red-800 dark:text-red-200">Unbillable days</p>
            <ul className="space-y-0.5">
              {(data?.blocked ?? []).slice().sort((a, b) => a.record_date.localeCompare(b.record_date)).map((b) => (
                <li key={b.record_date} className="text-red-700 dark:text-red-300">
                  {b.record_date} — {b.blocked_reason ?? "Not billable"}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Certification */}
        <div className="rounded-lg border p-3">
          {cert ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Certified
              </Badge>
              <span className="text-muted-foreground">
                by {cert.certified_by_name ?? "—"} on {new Date(cert.certified_at).toLocaleDateString()} ·{" "}
                {cert.present_days} present / {cert.away_days} away / {cert.blocked_days} unbillable
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                {needsCertification && (
                  <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" /> Needs certification
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  {isCurrentMonth ? "Month in progress — certify at month end." : "Not yet certified."}
                </span>
              </div>
              {canCertify ? (
                tableReady ? (
                  <Button size="sm" onClick={() => certify.mutate()} disabled={certify.isPending || isFutureMonth}>
                    {certify.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
                    Certify month
                  </Button>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0}>
                          <Button size="sm" disabled className="pointer-events-none">
                            <ShieldCheck className="mr-1 h-4 w-4" /> Certify month
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Pending database update</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              ) : (
                <span className="text-xs text-muted-foreground">Admin / manager signs off.</span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CountTile({ label, value, tone }: { label: string; value: number; tone: "green" | "amber" | "red" | "muted" }) {
  const toneCls = {
    green: "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200",
    amber: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
    red: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200",
    muted: "border-border bg-muted/40 text-muted-foreground",
  }[tone];
  return (
    <div className={`rounded-lg border p-2 text-center ${toneCls}`}>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide">{label}</div>
    </div>
  );
}
