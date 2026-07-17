import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Rocket, Clock, CalendarCheck2, Sun, AlertTriangle } from "lucide-react";
import { useTodayShift } from "@/hooks/use-today-shift";
import { useTodayShifts, type TodayShiftRow } from "@/hooks/use-today-shifts";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function windowLabel(s: string, e: string) {
  return `${fmtTime(s)} – ${fmtTime(e)}`;
}

function categorize(shift: TodayShiftRow, now: number) {
  const start = new Date(shift.starts_at).getTime();
  const end = new Date(shift.ends_at).getTime();
  if (now >= start && now <= end) return "now" as const;
  if (start > now && start - now <= 30 * 60_000) return "soon" as const;
  if (end < now) return "past" as const;
  return "later" as const;
}

/**
 * Zone 1 — TODAY: a hero card with today's shift and a single big primary
 * action to clock in. Falls back to a calm "no shift today" state.
 */
export function TodayHero() {
  const { active } = useTodayShift();
  const { data: shifts = [], isLoading } = useTodayShifts();
  const now = Date.now();

  // Active EVV punch wins — return to the in-progress shift.
  if (active) {
    const clockInMs = Date.parse(active.clock_in_timestamp);
    const hoursOpen = Number.isFinite(clockInMs)
      ? (Date.now() - clockInMs) / 3_600_000
      : 0;
    const needsClockOut = hoursOpen >= 12;
    const clockInLabel = Number.isFinite(clockInMs)
      ? new Date(clockInMs).toLocaleString(undefined, {
          weekday: "short", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit",
        })
      : "earlier";

    return (
      <section
        aria-label="Active shift"
        className={`rounded-2xl border p-5 shadow-[var(--shadow-card)] ${
          needsClockOut
            ? "border-amber-400/60 bg-amber-500/10"
            : "border-[#15a06a]/50 bg-[#15a06a]/5"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
                needsClockOut
                  ? "bg-amber-500/20 text-amber-800"
                  : "bg-[#15a06a]/15 text-[#0d5c3d]"
              }`}
            >
              {needsClockOut ? <AlertTriangle className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              <p
                className={`text-xs font-semibold uppercase tracking-wide ${
                  needsClockOut ? "text-amber-800" : "text-[#0d5c3d]"
                }`}
              >
                {needsClockOut ? "Shift in progress · Needs your attention" : "Shift in progress"}
              </p>
              <h2 className="mt-0.5 text-lg font-semibold leading-snug">
                {needsClockOut ? (
                  <>You've been on the clock for {Math.round(hoursOpen)}h — clock out now</>
                ) : (
                  <>You're on the clock</>
                )}
                <span className="ml-2 font-mono text-base text-muted-foreground">
                  {active.service_type_code}
                </span>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {needsClockOut
                  ? `This shift started ${clockInLabel}. Open it and clock out to keep your timesheet accurate.`
                  : "Return to finish the shift and clock out."}
              </p>
            </div>
          </div>
          <Button asChild size="lg" className="h-12 shrink-0 px-5 text-base">
            <Link
              to="/dashboard/workspace/$clientId"
              params={{ clientId: active.client_id }}
              search={{ tab: "clock-in" }}
            >
              {needsClockOut ? "Clock out now" : "Return to shift"}
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section
        aria-label="Today"
        className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
      >
        <p className="text-sm text-muted-foreground">Loading today's schedule…</p>
      </section>
    );
  }

  // Calm empty state.
  if (!shifts.length) {
    return (
      <section
        aria-label="Today"
        className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Sun className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">No shift scheduled today</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your caseload is below. Pick a client to view services or open a workspace.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Choose the current/next as primary.
  const primary =
    shifts.find((s) => categorize(s, now) === "now") ??
    shifts.find((s) => categorize(s, now) === "soon") ??
    shifts.find((s) => new Date(s.starts_at).getTime() >= now) ??
    shifts[0];

  const others = shifts.filter((s) => s.id !== primary.id);
  const state = categorize(primary, now);
  const code = primary.job_code ?? "";

  const ctaLabel =
    state === "now" || state === "soon"
      ? "Clock in now"
      : state === "past"
        ? "Open shift"
        : `Starts at ${fmtTime(primary.starts_at)}`;

  const tone =
    state === "now"
      ? "border-[#15a06a]/50 bg-[#15a06a]/5"
      : state === "soon"
        ? "border-amber-400/50 bg-amber-500/5"
        : "border-border bg-card";

  const eyebrow =
    state === "now"
      ? "Happening now"
      : state === "soon"
        ? "Starting soon"
        : state === "past"
          ? "Earlier today"
          : "Today";

  return (
    <section
      aria-label="Today's shift"
      className={`rounded-2xl border ${tone} p-5 shadow-[var(--shadow-card)]`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-background text-foreground">
            {state === "now" ? <Clock className="h-6 w-6" /> : <CalendarCheck2 className="h-6 w-6" />}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </p>
            <h2 className="mt-0.5 break-words text-lg font-semibold leading-snug">
              {primary.client_name}
              {code ? (
                <span className="ml-2 font-mono text-base text-muted-foreground">
                  {code}
                </span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {windowLabel(primary.starts_at, primary.ends_at)}
            </p>
          </div>
        </div>
        <Button asChild size="lg" className="h-12 shrink-0 px-5 text-base">
          <Link
            to="/dashboard/workspace/$clientId"
            params={{ clientId: primary.client_id }}
            search={{ tab: "clock-in", ...(code ? { code } : {}) }}
          >
            <Rocket className="h-4 w-4" />
            {ctaLabel}
          </Link>
        </Button>
      </div>

      {others.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Also today
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {others.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 truncate">
                  <span className="font-medium">{s.client_name}</span>
                  {s.job_code ? (
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                      {s.job_code}
                    </span>
                  ) : null}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {windowLabel(s.starts_at, s.ends_at)}
                  </span>
                </div>
                <Link
                  to="/dashboard/workspace/$clientId"
                  params={{ clientId: s.client_id }}
                  search={{ tab: "clock-in", ...(s.job_code ? { code: s.job_code } : {}) }}
                  className="shrink-0 text-xs font-semibold text-primary hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
