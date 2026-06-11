import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  User,
  ArrowRight,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useTimePaySettings } from "@/hooks/use-time-pay-settings";
import { respondToShift } from "@/lib/scheduling/workflow.functions";
import { OpenShiftsPanel } from "@/components/scheduling/open-shifts-panel";
import { useGeneralShift } from "@/hooks/use-general-shift";
import { fmtElapsed } from "@/components/staff-mobile/general-time-clock";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { GeneralTimeClock } from "@/components/staff-mobile/general-time-clock";
import { isDailyServiceCode } from "@/lib/service-billing";
import { RequestTimeOffDialog } from "@/components/schedule-preview/request-time-off-dialog";
import { RequestSwapDialog } from "@/components/schedule-preview/request-swap-dialog";
import { CalendarOff, ArrowLeftRight } from "lucide-react";

export const Route = createFileRoute("/dashboard/schedule")({
  head: () => ({ meta: [{ title: "My Schedule — HIVE" }] }),
  component: SchedulePage,
});

// Same daily-vs-hourly split used in staff-client-grid.tsx so the schedule
// routes shifts into the correct service Hub (source of truth: service-billing.ts).
const isDaily = (code: string | null | undefined) => isDailyServiceCode(code);

type ScheduledShift = {
  id: string;
  client_id: string;
  client_name: string;
  home_name: string | null;
  job_code: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  published: boolean;
};


type ViewMode = "day" | "week" | "month";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date) {
  // Sunday start to match common US scheduling UX
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return endOfDay(e);
}
function startOfMonth(d: Date) {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}
function endOfMonth(d: Date) {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function rangeFor(view: ViewMode, anchor: Date) {
  if (view === "day") return { from: startOfDay(anchor), to: endOfDay(anchor) };
  if (view === "week") return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

function shiftAnchor(view: ViewMode, anchor: Date, dir: -1 | 1): Date {
  const next = new Date(anchor);
  if (view === "day") next.setDate(next.getDate() + dir);
  else if (view === "week") next.setDate(next.getDate() + dir * 7);
  else next.setMonth(next.getMonth() + dir);
  return next;
}

function fmtRangeLabel(view: ViewMode, anchor: Date): string {
  if (view === "day") {
    return anchor.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }
  if (view === "week") {
    const s = startOfWeek(anchor);
    const e = endOfWeek(anchor);
    return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function fmtTimeRange(startISO: string, endISO: string) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${s.toLocaleTimeString(undefined, opts)} – ${e.toLocaleTimeString(undefined, opts)}`;
}

function fmtDayHeader(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function useMyScheduledShifts(view: ViewMode, anchor: Date) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { from, to } = rangeFor(view, anchor);

  return useQuery({
    enabled: !!user?.id && !!org?.organization_id,
    queryKey: [
      "my-scheduled-shifts",
      user?.id,
      org?.organization_id,
      from.toISOString(),
      to.toISOString(),
    ],
    queryFn: async (): Promise<ScheduledShift[]> => {
      const { data, error } = await supabase
        .from("scheduled_shifts")
        .select(
          "id, client_id, job_code, starts_at, ends_at, status, published, clients:client_id(first_name, last_name, team_id, teams:team_id(team_name))",
        )
        .eq("staff_id", user!.id)
        .eq("organization_id", org!.organization_id)
        .gte("starts_at", from.toISOString())
        .lte("starts_at", to.toISOString())
        .or("published.eq.true,status.eq.accepted")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        client_id: r.client_id,
        client_name: r.clients
          ? `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim()
          : "Client",
        home_name: r.clients?.teams?.team_name ?? null,
        job_code: r.job_code,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        status: r.status,
        published: r.published,
      }));
    },
  });
}


function ShiftCard({ s }: { s: ScheduledShift }) {
  const daily = isDaily(s.job_code);
  const code = s.job_code ?? "";
  const codeLabel = code || "Service TBD";
  const initials =
    s.client_name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "—";

  const statusTone =
    s.status === "accepted"
      ? "bg-[#117a52]/10 text-[#0d5c3d]"
      : s.status === "declined"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";

  const card = (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm transition active:scale-[0.99] hover:border-[color:var(--amber-600,#f59324)]/60">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--navy-900,#0d112b)] text-sm font-semibold text-white"
        >
          {initials || <User className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {s.home_name && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.home_name}</p>
              )}
              <h3 className="break-words text-base font-semibold leading-snug text-foreground">
                {s.client_name}
              </h3>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone}`}
            >
              {s.status}
            </span>
          </div>

          <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="tabular-nums">{fmtTimeRange(s.starts_at, s.ends_at)}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${
                code
                  ? "border-[color:var(--amber-600,#f59324)]/40 bg-[image:var(--gradient-amber)] text-[color:var(--navy-900,#0d112b)]"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {codeLabel}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {daily ? "Daily · Client Hub" : "Hourly · EVV time punch"}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs font-semibold text-[color:var(--amber-700,#d97a1c)]">
        <RequestSwapDialog
          shiftId={s.id}
          shiftLabel={`${s.client_name} · ${fmtTimeRange(s.starts_at, s.ends_at)}`}
          trigger={
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftRight className="h-3 w-3" /> Request swap
            </button>
          }
        />
        <span className="inline-flex items-center">
          {daily ? "Open Client Hub" : "Open Time Clock"}
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </span>
      </div>
    </article>
  );

  const linkWrap = daily ? (
    <Link to="/dashboard/hhs-hub/$clientId" params={{ clientId: s.client_id }} aria-label={`Open Client Hub for ${s.client_name} (${codeLabel})`}>
      {card}
    </Link>
  ) : (
    <Link to="/dashboard/workspace/$clientId" params={{ clientId: s.client_id }} search={{ tab: "clock-in", ...(code ? { code } : {}) }} aria-label={`Open Time Clock for ${s.client_name} (${codeLabel})`}>
      {card}
    </Link>
  );

  // Treat both legacy "pending" and the widened "published" status as
  // awaiting-acceptance. "draft" and "cancelled" never reach this view
  // (filtered by the fetch query), and "open" shifts have no staff_id.
  if ((s.status === "pending" || s.status === "published") && s.published) {
    return (
      <div className="space-y-2">
        {linkWrap}
        <AcceptDeclineBar
          shiftIds={s.id}
          meta={{
            homeName: s.home_name ?? "Home",
            startISO: s.starts_at,
            endISO: s.ends_at,
            clientNames: [s.client_name],
          }}
        />
      </div>
    );
  }
  return linkWrap;
}

type DeclineMeta = {
  homeName: string;
  startISO: string;
  endISO: string;
  clientNames: string[];
};

function AcceptDeclineBar({ shiftIds, meta }: { shiftIds: string[] | string; meta?: DeclineMeta }) {
  const ids = Array.isArray(shiftIds) ? shiftIds : [shiftIds];
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const respond = useServerFn(respondToShift);

  const accept = async () => {
    if (ids.length === 0) return;
    setBusy("accept");
    try {
      for (const id of ids) await respond({ data: { shiftId: id, response: "accepted" } });
      toast.success("Shift accepted.");
      qc.invalidateQueries({ queryKey: ["my-scheduled-shifts"] });
      qc.invalidateQueries({ queryKey: ["builder-data"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not accept.");
    } finally { setBusy(null); }
  };

  const decline = async () => {
    if (ids.length === 0) return;
    const reason = window.prompt("Why are you declining? (a short reason is required)")?.trim();
    if (!reason) { toast.error("A reason is required to decline."); return; }
    setBusy("decline");
    try {
      for (const id of ids) await respond({ data: { shiftId: id, response: "declined", declineReason: reason } });
      // best-effort context line for admin notification body (already created server-side)
      if (meta) {
        const dayLabel = new Date(meta.startISO).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        toast.success(`Declined ${meta.homeName} · ${dayLabel} — admin notified.`);
      } else {
        toast.success("Shift declined — admin will be notified.");
      }
      qc.invalidateQueries({ queryKey: ["my-scheduled-shifts"] });
      qc.invalidateQueries({ queryKey: ["builder-data"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not decline.");
    } finally { setBusy(null); }
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" className="flex-1 min-h-[44px] max-md:min-h-12 max-md:text-base" disabled={!!busy} onClick={decline}>
        {busy === "decline" ? "…" : "Decline"}
      </Button>
      <Button size="sm" className="flex-1 min-h-[44px] max-md:min-h-12 max-md:text-base" disabled={!!busy} onClick={accept}>
        {busy === "accept" ? "…" : "Accept"}
      </Button>
    </div>
  );
}

function bandLabel(startISO: string): string {
  const h = new Date(startISO).getHours();
  if (h >= 5 && h < 13) return "Day";
  if (h >= 13 && h < 21) return "Swing";
  return "Overnight";
}

function GroupCard({ shifts }: { shifts: ScheduledShift[] }) {
  const first = shifts[0];
  const home = first.home_name ?? "Home";
  const band = bandLabel(first.starts_at);
  const ratioLabel = `1:${shifts.length} group`;
  const names = shifts.map((s) => s.client_name).join(", ");
  const allAccepted = shifts.every((s) => s.status === "accepted");
  const allDeclined = shifts.every((s) => s.status === "declined");
  const groupStatus = allAccepted ? "accepted" : allDeclined ? "declined" : "pending";
  const statusTone =
    groupStatus === "accepted"
      ? "bg-[#117a52]/10 text-[#0d5c3d]"
      : groupStatus === "declined"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  const pendingIds = shifts.filter((s) => (s.status === "pending" || s.status === "published") && s.published).map((s) => s.id);
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{home}</p>
          <h3 className="mt-0.5 break-words text-base font-semibold leading-snug text-foreground">{names}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-[color:var(--amber-600,#f59324)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--amber-700,#d97a1c)]">
            {ratioLabel}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone}`}>
            {groupStatus}
          </span>
        </div>
      </div>
      <p className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span className="tabular-nums">{band} · {fmtTimeRange(first.starts_at, first.ends_at)}</span>
      </p>
      <ul className="mt-3 space-y-1">
        {shifts.map((s) => {
          const daily = isDaily(s.job_code);
          const code = s.job_code ?? "";
          return (
            <li key={s.id}>
              <Link
                to={daily ? "/dashboard/hhs-hub/$clientId" : "/dashboard/workspace/$clientId"}
                params={{ clientId: s.client_id }}
                {...(daily ? {} : { search: { tab: "clock-in", ...(code ? { code } : {}) } as any })}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-warm px-2 py-1.5 text-xs hover:border-[color:var(--amber-600,#f59324)]/60"
              >
                <span className="truncate font-medium text-foreground">{s.client_name}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--amber-700,#d97a1c)]">
                  {daily ? "Client Hub" : "Time Clock"}
                  <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {pendingIds.length > 0 && (
        <div className="mt-3">
          <AcceptDeclineBar
            shiftIds={pendingIds}
            meta={{
              homeName: home,
              startISO: first.starts_at,
              endISO: first.ends_at,
              clientNames: shifts.map((x) => x.client_name),
            }}
          />
        </div>
      )}
    </article>
  );
}

function ShiftList({ shifts }: { shifts: ScheduledShift[] }) {
  // Group by local date for week/month views; for day view groups collapse to one.
  const groups = useMemo(() => {
    const map = new Map<string, ScheduledShift[]>();
    for (const s of shifts) {
      const key = startOfDay(new Date(s.starts_at)).toISOString();
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [shifts]);

  // Within each day, collapse shifts that share the same starts_at+ends_at
  // (admin published one slot for a grouped unit → one card listing all clients).
  function bandGroups(items: ScheduledShift[]): ScheduledShift[][] {
    const m = new Map<string, ScheduledShift[]>();
    for (const s of items) {
      const k = `${s.starts_at}|${s.ends_at}`;
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    return Array.from(m.values());
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([key, items]) => (
        <section key={key} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {fmtDayHeader(key)}
          </h2>
          <ul className="flex flex-col gap-3">
            {bandGroups(items).map((bg) => (
              <li key={bg[0].id}>
                {bg.length === 1 ? <ShiftCard s={bg[0]} /> : <GroupCard shifts={bg} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}


function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-warm p-6 text-center">
      <p className="text-sm font-semibold text-foreground">No shifts scheduled</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Need to clock in? Open My Caseload to start a client shift.
      </p>
      <Button asChild className="mt-3" size="sm">
        <Link to="/dashboard">Go to My Caseload</Link>
      </Button>
    </div>
  );
}

function SchedulePage() {
  const [view, setView] = useState<ViewMode>("day");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const { settings } = useTimePaySettings();
  const { data: shifts, isLoading } = useMyScheduledShifts(view, anchor);
  const { data: org } = useCurrentOrg();
  const range = rangeFor(view, anchor);

  const goPrev = () => setAnchor((a) => shiftAnchor(view, a, -1));
  const goNext = () => setAnchor((a) => shiftAnchor(view, a, 1));
  const goToday = () => setAnchor(new Date());

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <StaffPageHeader
        eyebrow="My Schedule"
        eyebrowIcon={CalendarDays}
        title="My Schedule"
        subtitle="Tap a shift to open the client's Hub and clock in. EVV is enforced inside the Hub."
      />

      <div className="flex justify-end">
        <RequestTimeOffDialog
          trigger={
            <Button variant="outline" size="sm" className="min-h-[40px]">
              <CalendarOff className="h-4 w-4 mr-1" /> Request time off
            </Button>
          }
        />
      </div>

      {org?.organization_id && (
        <OpenShiftsPanel
          organizationId={org.organization_id}
          startIso={range.from.toISOString()}
          endIso={range.to.toISOString()}
          mode="staff"
        />
      )}


      {/* View toggle */}
      <div
        role="tablist"
        aria-label="Schedule view"
        className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-1"
      >
        {(["day", "week", "month"] as ViewMode[]).map((v) => {
          const active = view === v;
          return (
            <button
              key={v}
              role="tab"
              aria-selected={active}
              onClick={() => setView(v)}
              className={`min-h-[40px] rounded-md px-3 text-sm font-semibold capitalize transition ${
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>

      {/* Range nav */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={goPrev}
          aria-label="Previous"
          className="h-11 w-11"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <p className="truncate text-sm font-semibold text-foreground">
            {fmtRangeLabel(view, anchor)}
          </p>
          <button
            type="button"
            onClick={goToday}
            className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--amber-700,#d97a1c)] hover:underline"
          >
            Jump to today
          </button>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={goNext}
          aria-label="Next"
          className="h-11 w-11"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Shift list */}
      <section aria-label="Scheduled shifts">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading schedule…</p>
        ) : !shifts || shifts.length === 0 ? (
          <EmptyState />
        ) : (
          <ShiftList shifts={shifts} />
        )}
      </section>

      {/* Non-client time — collapsible, clearly secondary */}
      {settings.allow_non_client_clockins && (
        <CollapsibleGeneralClock />
      )}
    </div>
  );
}

function CollapsibleGeneralClock() {
  const { shift } = useGeneralShift();
  const [open, setOpen] = useState(!!shift);
  const [now, setNow] = useState(Date.now());

  const running = !!shift;

  // Default to expanded when on the clock so staff see their running shift.
  useEffect(() => {
    setOpen(!!shift);
  }, [shift?.start_iso]);

  // Keep elapsed time ticking while collapsed + running.
  useEffect(() => {
    if (!shift) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [shift]);

  const elapsed = running
    ? fmtElapsed(now - new Date(shift!.start_iso).getTime())
    : "00:00:00";

  return (
    <section className="mt-6 border-t border-border pt-5" aria-label="General time clock">
      <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Time Clock
      </h2>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="rounded-xl border border-border bg-muted/50">
          {/* Collapsed pill / toggle header */}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.99]"
              aria-label={
                running
                  ? "Non-client time is running. Tap to manage or clock out."
                  : "Tap to start non-client time clock"
              }
            >
              <span
                aria-hidden
                className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
                  running ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {running
                    ? `Time Clock — On non-client time · ${elapsed}`
                    : "Time Clock — Clock In"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {running ? (
                    <>
                      Tap to manage / clock out{" "}
                      <span className="ml-1 inline-flex items-center rounded bg-amber-100 px-1 py-0 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        NO EVV
                      </span>
                    </>
                  ) : (
                    <>
                      Non-client work · no EVV{" "}
                      <span className="ml-1 inline-flex items-center rounded bg-amber-100 px-1 py-0 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        NO EVV
                      </span>
                    </>
                  )}
                </p>
              </div>
              <ChevronUp
                className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                  open ? "" : "rotate-180"
                }`}
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="border-t border-border px-4 pb-4 pt-1">
              <p className="mb-3 text-[11px] text-muted-foreground">
                Client shifts start from a scheduled shift or My Caseload — with
                EVV.
              </p>
              <GeneralTimeClock />
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </section>
  );
}
