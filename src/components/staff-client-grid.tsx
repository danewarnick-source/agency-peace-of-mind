import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCaseload, type CaseloadClient } from "@/hooks/use-caseload";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, Search, Clock, Home } from "lucide-react";

// Service codes billed per day (daily workspace). Everything else is treated
// as hourly (EVV time punch). HHS and RHS are the canonical daily codes;
// DSG and the room-and-board respite codes also bill per day.
const DAILY_CODES = new Set(["HHS", "RHS", "DSG", "RL6", "RP3", "RP4", "RP5"]);
const isDaily = (code: string) => DAILY_CODES.has(code);
const billingLabel = (code: string) => (isDaily(code) ? "Daily" : "Hourly");

function ClientCard({ c }: { c: CaseloadClient }) {
  const codes = (Array.isArray(c.job_code) ? c.job_code : []).filter(Boolean);
  // Default to first available (treated as primary/most-frequent).
  const initial = codes[0] ?? "SEI";
  const [selected, setSelected] = useState<string>(initial);

  const fullName = `${c.first_name} ${c.last_name}`.trim();
  const address = c.physical_address?.trim() || "No primary house on file";
  const daily = isDaily(selected);

  // Avatar initials
  const initials = `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase() || "—";

  const pills = codes.length ? codes : [initial];

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      {/* Header: avatar + name + address (no truncation) */}
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
        </div>
      </header>

      {/* Service selector */}
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
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(code)}
                className={[
                  "min-h-[44px] rounded-lg border px-3 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-[color:var(--amber-600,#f59324)] bg-[image:var(--gradient-amber)] text-[color:var(--navy-900,#0d112b)] shadow-sm"
                    : "border-border bg-background text-foreground hover:border-[color:var(--amber-600,#f59324)]/60",
                ].join(" ")}
              >
                <span className="block font-mono text-sm font-semibold leading-tight">
                  {code}
                </span>
                <span
                  className={[
                    "block text-[10px] font-medium uppercase tracking-wide leading-tight",
                    active ? "text-[color:var(--navy-900,#0d112b)]/70" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {billingLabel(code)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary action */}
      <div className="mt-4">
        <Button
          asChild
          size="lg"
          className="h-12 w-full text-base"
          aria-label={`${daily ? "Open Client Hub" : "Open Time Clock"} for ${fullName} (${selected})`}
        >
          <Link
            to={daily ? "/dashboard/hhs-hub/$clientId" : "/dashboard/workspace/$clientId"}
            params={{ clientId: c.id }}
            search={{ service: selected }}
          >
            {daily ? <Home /> : <Clock />}
            {daily ? "Open Client Hub" : "Open Time Clock"}
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
              <ClientCard c={c} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
