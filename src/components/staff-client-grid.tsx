import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCaseload, type CaseloadClient } from "@/hooks/use-caseload";
import { useActiveShift, type ActiveShift } from "@/hooks/use-active-shift";
import { useNectarPayPeriod } from "@/hooks/use-nectar-pay-period";
import {
  useMyAssignments,
  allowedCodesFor,
  caseloadCardActions,
  caseloadDailyNoteLabel,
  clientAuthorizedCodes,
  defaultCaseloadCode,
  hasHostHomeDailyCode,
  hostHomeDailyNoteCode,
  isHostHomeDailyNoteCard,
  stackDualCaseloadActions,
  type AssignmentMap,
} from "@/hooks/use-my-assignments";
import { DualCaseloadActions } from "@/components/staff-mobile/dual-caseload-actions";
import { useTodayShifts, type TodayShiftRow } from "@/hooks/use-today-shifts";
import { useTodayDailyNoteClients } from "@/hooks/use-today-daily-notes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  User,
  Search,
  Home,
  Info,
  ChevronDown,
  CalendarCheck2,
  CheckCircle2,
  GraduationCap,
  ChevronRight,
} from "lucide-react";
import { ClientQuickInfoSheet } from "@/components/staff-mobile/client-quick-info-sheet";
import { ClientCapBars } from "@/components/staff-mobile/client-cap-bars";
import { getMyClientTrainingStatuses } from "@/lib/client-specific-training.functions";
import {
  billingUnitLabel,
  isClockableServiceCode,
  isDailyServiceCode,
} from "@/lib/service-billing";
import { isEvvLockedCode } from "@/lib/evv-codes";
import { displayPersonName } from "@/lib/person-name";

type ClientTraining = {
  type: "person_specific" | "support_strategies" | "person_centered";
  label: string;
  setupStatus: "not_setup" | "draft" | "published";
  completionStatus: "not_started" | "completed";
  completedAt?: string | null;
};

function fmtElapsed(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function useTick(enabled: boolean) {
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [enabled]);
}

// `isDaily` here drives ROUTING (HHS hub vs. clock-in workspace), so it
// must be true ONLY for codes that genuinely have no staff clock surface
// (HHS host home, PPS parent-paid). RHS is daily-rate but residential
// staff DO clock for payroll, so it routes to the workspace clock-in tab.
const isDaily = (code: string) => !isClockableServiceCode(code);
const billingLabel = (code: string) => billingUnitLabel(code);

/** Expanded client detail — preserves the existing service chips, burn-down, and CTA buttons. */
function ClientDetail({
  c,
  activeShift,
  assignments,
  trainings,
  stackDual,
  cardActionsVisible,
  dailyNoteDone,
}: {
  c: CaseloadClient;
  activeShift: ActiveShift | null;
  assignments: AssignmentMap | undefined;
  trainings: ClientTraining[];
  stackDual: boolean;
  cardActionsVisible: boolean;
  dailyNoteDone: boolean;
}) {
  const allCodes = clientAuthorizedCodes(c);
  const codes = allowedCodesFor(assignments, c.id, allCodes);
  const isOnTheClock = !!activeShift && activeShift.client_id === c.id;

  const initial = isOnTheClock
    ? activeShift!.service_type_code
    : defaultCaseloadCode(codes, allCodes);
  const [selected, setSelected] = useState<string>(initial);
  useEffect(() => {
    if (isOnTheClock) setSelected(activeShift!.service_type_code);
    else if (codes.length && !codes.includes(selected)) setSelected(codes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnTheClock, activeShift, codes.join("|")]);

  const fullName = displayPersonName(c.first_name, c.last_name);
  // Empty selected must not invent a clockable code (old SEI fallback).
  const daily = !selected || isDaily(selected);
  const pills = codes.length ? codes : initial ? [initial] : [];

  return (
    <div className="space-y-4 px-4 pb-4 pt-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Select a service
        </p>
        <div
          role="radiogroup"
          aria-label={`Service for ${fullName}`}
          className="mt-2 flex flex-wrap gap-2"
        >
          {pills.map((code) => {
            const active = selected === code;
            const locked =
              isOnTheClock &&
              !stackDual &&
              code !== activeShift!.service_type_code;
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={locked}
                onClick={() => setSelected(code)}
                className={[
                  "min-h-[44px] rounded-lg border px-3 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-[color:var(--amber-600,var(--hive-gold))] bg-[image:var(--gradient-amber)] text-[color:var(--navy-900,var(--hive-text))] shadow-sm"
                    : locked
                      ? "border-border bg-muted/40 text-muted-foreground opacity-60"
                      : "border-border bg-background text-foreground hover:border-[color:var(--amber-600,var(--hive-gold))]/60",
                ].join(" ")}
              >
                <span className="block font-mono text-sm font-semibold leading-tight">{code}</span>
                <span
                  className={[
                    "block text-[10px] font-medium uppercase tracking-wide leading-tight",
                    active ? "text-[color:var(--navy-900,var(--hive-text))]/70" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {billingLabel(code)}
                </span>
                <span
                  className={[
                    "mt-1 inline-block rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide",
                    isEvvLockedCode(code)
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : isDailyServiceCode(code)
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-slate-500/15 text-slate-600 dark:text-slate-300",
                  ].join(" ")}
                  title={
                    isEvvLockedCode(code)
                      ? "EVV-billed: clock-in transmits to UEVV; time = billable units"
                      : isDailyServiceCode(code)
                        ? "Daily-rate: billed per day; clocking captures payroll only"
                        : "Payroll only: not billed by clock — separate evidence required"
                  }
                >
                  {isEvvLockedCode(code)
                    ? "EVV billable"
                    : isDailyServiceCode(code)
                      ? "Daily rate"
                      : "Payroll only"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ClientCapBars clientId={c.id} codes={codes} />

      {trainings.filter((t) => t.setupStatus === "published").length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Trainings
          </p>
          {trainings
            .filter((t) => t.setupStatus === "published")
            .map((t) =>
              t.completionStatus === "completed" ? (
                <div key={t.type} className="flex items-center gap-2 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="font-medium">{t.label}</span>
                  <span className="text-muted-foreground">· Completed</span>
                </div>
              ) : (
                <Link
                  key={t.type}
                  to="/dashboard/my-obligations"
                  className="flex items-center gap-2 rounded-md border border-amber-300/60 bg-amber-500/5 px-2 py-1.5 text-xs font-semibold text-amber-800 transition hover:border-amber-400"
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span>Review required · {t.label}</span>
                  <ChevronRight className="ml-auto h-3 w-3 opacity-60" />
                </Link>
              ),
            )}
        </div>
      )}

      {cardActionsVisible || stackDual ? (
        <p className="text-center text-xs text-muted-foreground">
          {isOnTheClock && daily
            ? "Daily note is for HHS. End shift opens the verification form for the punch already in progress."
            : isOnTheClock
              ? "End shift opens the verification form for the punch already in progress."
              : daily
                ? "Daily note · PCSP narrative · month-end paperwork"
                : "Start a new punch from the Punch pad tab — not from this card."}
        </p>
      ) : daily ? (
        <div>
          <Button asChild size="lg" className="h-12 w-full text-base">
            <Link
              to="/dashboard/hhs-hub/$clientId"
              params={{ clientId: c.id }}
              aria-label={`${caseloadDailyNoteLabel({
                code: selected || "HHS",
                alreadyDoneToday: dailyNoteDone,
              })} for ${fullName}`}
            >
              <Home />
              {caseloadDailyNoteLabel({
                code: selected || "HHS",
                alreadyDoneToday: dailyNoteDone,
              })}
            </Link>
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Daily note · PCSP narrative · month-end paperwork
          </p>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Start a new punch from the Punch pad tab — not from this card.
        </p>
      )}
    </div>
  );
}

function ClientRow({
  c,
  activeShift,
  periodHours,
  assignments,
  todayShift,
  isOpen,
  onToggle,
  trainings,
  dailyNoteDone,
}: {
  c: CaseloadClient;
  activeShift: ActiveShift | null;
  periodHours: number;
  assignments: AssignmentMap | undefined;
  todayShift: TodayShiftRow | null;
  isOpen: boolean;
  onToggle: () => void;
  trainings: ClientTraining[];
  dailyNoteDone: boolean;
}) {
  const isOnTheClock = !!activeShift && activeShift.client_id === c.id;
  useTick(isOnTheClock);
  const navigate = useNavigate();
  const allCodes = clientAuthorizedCodes(c);
  const codes = allowedCodesFor(assignments, c.id, allCodes);
  const effectiveCodes = codes.length ? codes : allCodes;
  const hasHhs = hasHostHomeDailyCode(effectiveCodes);
  const hasClockableToday = !!(todayShift && isClockableServiceCode(todayShift.job_code));
  const hostHomeCard = isHostHomeDailyNoteCard({
    codes: effectiveCodes,
    todayJobCode: todayShift?.job_code,
    isOnTheClock,
  });
  const actions = caseloadCardActions({
    codes: effectiveCodes,
    isOnTheClock,
    hasClockableShiftToday: hasClockableToday,
  });
  const stackDual = stackDualCaseloadActions({
    codes: effectiveCodes,
    isHostHomeDailyNoteCard: hostHomeCard,
    hasClockableShiftToday: hasClockableToday,
    isOnTheClock,
  });
  const punchCode = isOnTheClock ? activeShift!.service_type_code : "";
  const dailyNoteCode = actions.showDailyNote ? hostHomeDailyNoteCode(effectiveCodes) : "";
  const cardActionsVisible = actions.showDailyNote || actions.showTimeClock;

  const hasTrainingDue = trainings.some(
    (t) => t.setupStatus === "published" && t.completionStatus === "not_started",
  );

  const fullName = displayPersonName(c.first_name, c.last_name);
  const address = c.physical_address?.trim() || "No primary house on file";
  const initials = `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase() || "—";
  const elapsed = isOnTheClock
    ? fmtElapsed(Date.now() - new Date(activeShift!.clock_in_timestamp).getTime())
    : "";

  return (
    <article
      className={[
        "overflow-hidden rounded-xl border bg-card shadow-sm transition",
        isOnTheClock
          ? "border-[#15a06a] ring-1 ring-[#15a06a]/40"
          : todayShift
            ? "border-[color:var(--amber-600,var(--hive-gold))]/70 ring-1 ring-[color:var(--amber-600,var(--hive-gold))]/30"
            : "border-border",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => {
          if (hostHomeCard) {
            navigate({ to: "/dashboard/hhs-hub/$clientId", params: { clientId: c.id } });
            return;
          }
          onToggle();
        }}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40"
      >
        <span
          aria-hidden
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--navy-900,var(--hive-text))] text-sm font-semibold text-white"
        >
          {initials || <User className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{fullName}</h3>
            {isOnTheClock ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#117a52]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0d5c3d]">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#15a06a] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#15a06a]" />
                </span>
                On clock · {elapsed}
              </span>
            ) : todayShift ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--amber-600,var(--hive-gold))]/15 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--amber-700,var(--hive-gold))]">
                <CalendarCheck2 className="h-3 w-3" />
                Scheduled · {fmtTime(todayShift.starts_at)}–{fmtTime(todayShift.ends_at)}
                {todayShift.job_code ? ` · ${todayShift.job_code}` : ""}
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {hasHhs ? "Daily note" : "No shift today"}
              </span>
            )}
            {hasTrainingDue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                <GraduationCap className="h-3 w-3" />
                Training due
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{address}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <span className="rounded-full bg-[color:var(--navy-900,var(--hive-text))]/5 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-[color:var(--navy-900,var(--hive-text))]">
            {periodHours.toFixed(1)}h
          </span>
        </div>
        <ClientQuickInfoSheet
          client={c}
          trigger={
            <span
              role="button"
              aria-label={`Quick info for ${fullName}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:border-[color:var(--amber-600,var(--hive-gold))]/60 hover:text-[color:var(--amber-700,var(--hive-gold))]"
            >
              <Info className="h-4 w-4" />
            </span>
          }
        />
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {cardActionsVisible ? (
        <div className="border-t border-border px-4 py-3">
          <DualCaseloadActions
            clientId={c.id}
            fullName={fullName}
            punchCode={punchCode}
            isOnTheClock={isOnTheClock}
            dailyNoteCode={dailyNoteCode || null}
            dailyNoteDone={dailyNoteDone}
          />
        </div>
      ) : null}

      {isOpen && (
        <div className="border-t border-border bg-background/60">
          <ClientDetail
            c={c}
            activeShift={activeShift}
            assignments={assignments}
            trainings={trainings}
            stackDual={stackDual}
            cardActionsVisible={cardActionsVisible}
            dailyNoteDone={dailyNoteDone}
          />
        </div>
      )}
    </article>
  );
}

export function StaffClientGrid() {
  const { data: caseload, isLoading } = useCaseload();
  const { data: activeShift } = useActiveShift();
  const { data: nectar } = useNectarPayPeriod();
  const { data: assignments } = useMyAssignments();
  const { data: todayShifts = [] } = useTodayShifts();
  const { data: todayNotes } = useTodayDailyNoteClients();
  const fetchCT = useServerFn(getMyClientTrainingStatuses);
  const { data: ct } = useQuery({
    queryKey: ["my-client-training-statuses"],
    queryFn: () => fetchCT(),
    staleTime: 60_000,
  });
  const trainingsByClient = useMemo(() => {
    const m = new Map<string, ClientTraining[]>();
    for (const it of (ct?.items ?? []) as Array<{
      clientId: string;
      trainings: ClientTraining[];
    }>) {
      m.set(it.clientId, it.trainings ?? []);
    }
    return m;
  }, [ct]);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const KEY = "staff-welcome-toast";
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(KEY)) return;
    window.sessionStorage.setItem(KEY, "1");
    const t = window.setTimeout(() => {
      import("sonner").then(({ toast }) => toast.success("Welcome back!", { duration: 2500 }));
    }, 50);
    return () => window.clearTimeout(t);
  }, []);

  const todayByClient = useMemo(() => {
    const map = new Map<string, TodayShiftRow>();
    for (const s of todayShifts) {
      // Keep the earliest shift per client.
      const existing = map.get(s.client_id);
      if (!existing || new Date(s.starts_at) < new Date(existing.starts_at)) {
        map.set(s.client_id, s);
      }
    }
    return map;
  }, [todayShifts]);

  const source = caseload ?? [];

  const clients = useMemo(() => {
    const t = q.trim().toLowerCase();
    const filtered = !t
      ? source
      : source.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(t));
    // Pin clients with a shift today to the top, ordered by start time.
    return [...filtered].sort((a, b) => {
      const ta = todayByClient.get(a.id);
      const tb = todayByClient.get(b.id);
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      if (ta && tb) return new Date(ta.starts_at).getTime() - new Date(tb.starts_at).getTime();
      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
    });
  }, [source, q, todayByClient]);

  return (
    <section aria-label="My Caseload" data-tour="staff.caseload" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            My caseload · {source.length} {source.length === 1 ? "person" : "people"}
          </h2>
          <p className="text-xs text-muted-foreground">
            Tap a person to view services. Host home (HHS) always has a daily-note action. Open time
            clock appears only when you are already punched in. Start a new punch from the Punch pad
            tab. EVV is submitted by CSV.
          </p>
        </div>
      </div>

      {/*
        Flex, not absolute. An absolute glass in the hidden desktop Outlet
        (staff phones still mount that tree) paints as a left-edge leftover.
      */}
      <div
        data-caseload-search
        className="flex h-11 w-full items-center gap-2 rounded-lg border border-input bg-card px-3"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
          inputMode="search"
          aria-label="Search caseload by name"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading caseload…</p>
      ) : !clients.length ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-warm p-6 text-center text-sm text-muted-foreground">
          {q
            ? "No matches in your caseload."
            : "No clients assigned yet — contact your administrator to be assigned to individuals on your caseload."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {clients.map((c) => (
            <li key={c.id}>
              <ClientRow
                c={c}
                activeShift={activeShift ?? null}
                periodHours={nectar?.per_client_hours[c.id] ?? 0}
                assignments={assignments}
                todayShift={todayByClient.get(c.id) ?? null}
                isOpen={openId === c.id}
                onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
                trainings={trainingsByClient.get(c.id) ?? []}
                dailyNoteDone={!!todayNotes?.has(c.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
