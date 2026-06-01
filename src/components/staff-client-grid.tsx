import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCaseload, type CaseloadClient } from "@/hooks/use-caseload";
import { useActiveShift, type ActiveShift } from "@/hooks/use-active-shift";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, Search, Clock, Home, Info } from "lucide-react";
import { ClientQuickInfoSheet } from "@/components/staff-mobile/client-quick-info-sheet";

function fmtElapsed(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function useTick(enabled: boolean) {
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [enabled]);
}

// Service codes billed per day (daily workspace). Everything else is treated
// as hourly (EVV time punch). HHS and RHS are the canonical daily codes;
// DSG and the room-and-board respite codes also bill per day.
const DAILY_CODES = new Set(["HHS", "RHS", "DSG", "RL6", "RP3", "RP4", "RP5"]);
const isDaily = (code: string) => DAILY_CODES.has(code);
const billingLabel = (code: string) => (isDaily(code) ? "Daily" : "Hourly");

function ClientCard({
  c,
  activeShift,
}: {
  c: CaseloadClient;
  activeShift: ActiveShift | null;
}) {
  const codes = (Array.isArray(c.job_code) ? c.job_code : []).filter(Boolean);
  const isOnTheClock = !!activeShift && activeShift.client_id === c.id;

  // If this client is the active one, lock the pill selection to that service.
  const initial = isOnTheClock
    ? activeShift!.service_type_code
    : codes[0] ?? "SEI";
  const [selected, setSelected] = useState<string>(initial);
  useEffect(() => {
    if (isOnTheClock) setSelected(activeShift!.service_type_code);
  }, [isOnTheClock, activeShift]);

  useTick(isOnTheClock);

  const fullName = `${c.first_name} ${c.last_name}`.trim();
  const address = c.physical_address?.trim() || "No primary house on file";
  const daily = isDaily(selected);

  const initials =
    `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase() || "—";

  const pills = codes.length ? codes : [initial];

  const elapsed = isOnTheClock
    ? fmtElapsed(Date.now() - new Date(activeShift!.clock_in_timestamp).getTime())
    : "";

  return (
    <article
      className={[
        "rounded-xl border bg-card p-4 shadow-sm",
        isOnTheClock ? "border-[#15a06a] ring-1 ring-[#15a06a]/40" : "border-border",
      ].join(" ")}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--navy-900,#0d112b)] text-sm font-semibold text-white"
        >
          {initials || <User className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-semibold leading-snug text-foreground">
            {fullName}
          </h3>
          <p className="mt-1 break-words text-sm leading-snug text-muted-foreground">
            {address}
          </p>
          {isOnTheClock && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#117a52]/10 px-2.5 py-1 text-[11px] font-semibold text-[#0d5c3d]">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#15a06a] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#15a06a]" />
              </span>
              On the clock · {activeShift!.service_type_code} ·{" "}
              <span className="font-mono tabular-nums">{elapsed}</span>
            </p>
          )}
        </div>
      </header>

      <div className="mt-4">
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
            const locked = isOnTheClock && code !== activeShift!.service_type_code;
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
                    ? "border-[color:var(--amber-600,#f59324)] bg-[image:var(--gradient-amber)] text-[color:var(--navy-900,#0d112b)] shadow-sm"
                    : locked
                      ? "border-border bg-muted/40 text-muted-foreground opacity-60"
                      : "border-border bg-background text-foreground hover:border-[color:var(--amber-600,#f59324)]/60",
                ].join(" ")}
              >
                <span className="block font-mono text-sm font-semibold leading-tight">
                  {code}
                </span>
                <span
                  className={[
                    "block text-[10px] font-medium uppercase tracking-wide leading-tight",
                    active
                      ? "text-[color:var(--navy-900,#0d112b)]/70"
                      : "text-muted-foreground",
                  ].join(" ")}
                >
                  {billingLabel(code)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <Button
          asChild
          size="lg"
          className={[
            "h-12 w-full text-base",
            isOnTheClock
              ? "bg-[#117a52] text-white shadow-sm hover:bg-[#0f6b48] hover:brightness-100"
              : "",
          ].join(" ")}
          aria-label={`${
            isOnTheClock
              ? "Continue Time Clock"
              : daily
                ? "Open Client Hub"
                : "Open Time Clock"
          } for ${fullName} (${selected})`}
        >
          <Link
            to={daily ? "/dashboard/hhs-hub/$clientId" : "/dashboard/workspace/$clientId"}
            params={{ clientId: c.id }}
          >
            {daily && !isOnTheClock ? <Home /> : <Clock />}
            {isOnTheClock
              ? "Continue Time Clock"
              : daily
                ? "Open Client Hub"
                : "Open Time Clock"}
          </Link>
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {daily
            ? "Daily note · PCSP narrative · month-end paperwork"
            : "EVV time punch · shift & month-end paperwork"}
        </p>
      </div>
    </article>
  );
}

export function StaffClientGrid() {
  const { data: caseload, isLoading } = useCaseload();
  const { data: activeShift } = useActiveShift();
  const [q, setQ] = useState("");

  const source = caseload ?? [];

  const clients = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return source;
    return source.filter((c) =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(t),
    );
  }, [source, q]);

  return (
    <section aria-label="My Caseload" className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {source.length
            ? `${source.length} ${source.length === 1 ? "person" : "people"} on your caseload`
            : "Your caseload"}
        </p>
      </div>

      {/* Sticky search */}
      <div className="sticky top-14 z-10 -mx-3 border-b border-border bg-background/95 px-3 py-2 backdrop-blur md:top-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-12 w-full pl-10 text-base"
            inputMode="search"
            aria-label="Search caseload by name"
          />
        </div>
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
        <ul className="flex flex-col gap-3">
          {clients.map((c) => (
            <li key={c.id}>
              <ClientCard c={c} activeShift={activeShift ?? null} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
