import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCaseload, type CaseloadClient } from "@/hooks/use-caseload";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Search, MapPin, Clock, Home } from "lucide-react";


// Service-mode pills shown under the address. Only codes that represent a
// worker-facing "mode" (hourly EVV vs. residential HHS) are rendered as
// interactive pills here.
const MODE_CODES = ["SEI", "DSI", "HHS"] as const;
type ModeCode = (typeof MODE_CODES)[number];

function ClientRow({ c }: { c: CaseloadClient }) {
  const allCodes = Array.isArray(c.job_code) ? c.job_code : [];
  const availableModes = MODE_CODES.filter((m) => allCodes.includes(m));
  const initialMode: ModeCode =
    availableModes[0] ?? (allCodes.includes("HHS") ? "HHS" : "SEI");
  const [mode, setMode] = useState<ModeCode>(initialMode);

  const fullName = `${c.first_name} ${c.last_name}`.trim();
  const location = c.physical_address?.trim() || "No primary house on file";
  const isHHS = mode === "HHS";

  const pills: ModeCode[] = availableModes.length ? availableModes : [initialMode];

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-accent/50 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
            isHHS ? "bg-warning/15 text-warning-foreground" : "bg-accent/10 text-accent"
          }`}
        >
          <User className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{fullName}</p>
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2">{location}</span>
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Service mode">
            {pills.map((code) => {
              const active = mode === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setMode(code)}
                  aria-pressed={active}
                  className={`min-h-[28px] rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? code === "HHS"
                        ? "border-warning bg-warning/15 text-warning-foreground"
                        : "border-accent bg-accent/10 text-accent"
                      : "border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground"
                  }`}
                >
                  [{code}]
                </button>
              );
            })}
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

      <Button asChild size="default" className="shrink-0 md:ml-4">
        <Link
          to={isHHS ? "/dashboard/hhs-hub/$clientId" : "/dashboard/workspace/$clientId"}
          params={{ clientId: c.id }}
          aria-label={`Open ${isHHS ? "host home client hub" : "hourly time clock"} for ${fullName}`}
        >
          {isHHS ? <Home /> : <Clock />}
          {isHHS ? "Open Client Hub" : "Open Time Clock"}
        </Link>
      </Button>
    </li>
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
    <section
      aria-label="My Caseload"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="sticky top-14 z-10 -mx-4 flex flex-col gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:flex-row md:items-center md:justify-between md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">My Caseload</h2>
          <p className="hidden text-xs text-muted-foreground md:block">
            Tap a service pill to switch modes, then open the matching workspace.
          </p>
        </div>
        <div className="relative w-full md:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 pl-9 text-base md:h-10 md:text-sm"
            inputMode="search"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading caseload…</p>
      ) : !clients.length ? (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-surface-warm p-6 text-center text-sm text-muted-foreground">
          {q ? "No matches in your caseload." : "No clients assigned yet — contact your administrator to be assigned to individuals on your caseload."}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {clients.map((c) => (
            <ClientRow key={c.id} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}
