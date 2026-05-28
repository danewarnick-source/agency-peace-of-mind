import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCaseload, type CaseloadClient } from "@/hooks/use-caseload";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Search, MapPin, Rocket, Clock, Home } from "lucide-react";


// Service-mode pills shown directly under the address. Only codes that
// represent a worker-facing "mode" (hourly EVV vs. residential HHS) are
// rendered as interactive pills here.
const MODE_CODES = ["SEI", "DSI", "HHS"] as const;
type ModeCode = (typeof MODE_CODES)[number];

function ClientCard({ c }: { c: CaseloadClient }) {
  const allCodes = Array.isArray(c.job_code) ? c.job_code : [];
  const availableModes = MODE_CODES.filter((m) => allCodes.includes(m));
  // Fallback rule: when the card mounts, auto-select the first available
  // service tag in the array. If the client has no mode-coded service, fall
  // back to HHS-vs-hourly inference from the broader code list.
  const initialMode: ModeCode =
    availableModes[0] ?? (allCodes.includes("HHS") ? "HHS" : "SEI");
  const [mode, setMode] = useState<ModeCode>(initialMode);

  const fullName = `${c.first_name} ${c.last_name}`.trim();
  const location = c.physical_address?.trim() || "No primary house on file";
  const isHHS = mode === "HHS";

  // Pills to render: prefer codes the client actually has; otherwise show
  // the inferred default so the worker still sees an active mode chip.
  const pills: ModeCode[] = availableModes.length ? availableModes : [initialMode];

  return (
    <li className="relative">
      <div className="group flex w-full flex-col gap-4 rounded-2xl border border-border bg-background p-5 text-left shadow-sm transition hover:border-primary hover:shadow-md">
        <div className="flex items-start gap-4">
          <span
            className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${
              isHHS ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"
            }`}
          >
            <User className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold leading-tight">{fullName}</p>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="line-clamp-2">{location}</span>
            </p>

            {/* Interactive service-mode pills (replaces the static tag row). */}
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Service mode">
              {pills.map((code) => {
                const active = mode === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setMode(code)}
                    aria-pressed={active}
                    className={`min-h-[32px] rounded-full border px-3 py-1 font-mono text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      active
                        ? code === "HHS"
                          ? "border-amber-500 bg-amber-100 text-amber-800 ring-2 ring-amber-300 shadow-sm dark:bg-amber-900/40 dark:text-amber-100"
                          : "border-primary bg-primary/15 text-primary ring-2 ring-primary/30 shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    [{code}]
                  </button>
                );
              })}
              {/* Show any remaining non-mode codes as plain reference badges. */}
              {allCodes
                .filter((code) => !MODE_CODES.includes(code as ModeCode))
                .slice(0, 4)
                .map((code) => (
                  <Badge key={code} variant="outline" className="font-mono text-[10px]">
                    {code}
                  </Badge>
                ))}
            </div>
          </div>
        </div>

        {/* Dynamic primary action — text + route follow selected pill. */}
        <Button asChild size="lg" className="h-12 w-full text-base font-semibold">
          <Link
            to={isHHS ? "/dashboard/hhs-hub/$clientId" : "/dashboard/workspace/$clientId"}
            params={{ clientId: c.id }}
            aria-label={`Open ${isHHS ? "host home client hub" : "hourly time clock"} for ${fullName}`}
          >
            {isHHS ? (
              <>
                <Rocket className="mr-1 h-5 w-5" />
                <Home className="mr-2 h-5 w-5" /> 🚀 🏡 Open Client Hub
              </>
            ) : (
              <>
                <Rocket className="mr-1 h-5 w-5" />
                <Clock className="mr-2 h-5 w-5" /> 🚀 🕒 Open Hourly Time Clock
              </>
            )}
          </Link>
        </Button>
      </div>
    </li>
  );
}

export function StaffClientGrid() {
  const { data: caseload, isLoading } = useCaseload();
  const [q, setQ] = useState("");

  const usingMock = false;
  const source = caseload ?? [];

  const clients = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return source;
    return source.filter((c) =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(t),
    );
  }, [source, q]);

  return (
    <section
      aria-label="My Caseload"
      className="relative z-0 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-6"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">My Caseload</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Tap a service pill to switch modes, then open the matching workspace.
          </p>
        </div>
        <div className="relative w-full md:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 pl-9 text-base md:h-9 md:text-sm"
            inputMode="search"
          />
        </div>
      </div>

      {usingMock && (
        <div className="mt-4 rounded-lg border border-dashed border-amber-400/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>Test Clients:</strong> No live assignments found yet. These
          sample cards let you tap through and verify the Shift Profile flow.
        </div>
      )}

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading caseload…</p>
      ) : !clients.length ? (
        <Card className="mt-6 p-8 text-center text-sm text-muted-foreground">
          {q ? "No matches in your caseload." : "No individuals currently assigned to you."}
        </Card>
      ) : (
        <ul className="mt-5 flex flex-col gap-3 md:grid md:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <ClientCard key={c.id} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}
