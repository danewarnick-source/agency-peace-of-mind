import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCaseload, type CaseloadClient } from "@/hooks/use-caseload";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Search, MapPin, Rocket } from "lucide-react";

// Local mobile fail-safe fixtures so frontline staff can test the workspace
// even before an admin links them to real clients in the assignments table.
const MOCK_CLIENTS: CaseloadClient[] = [
  {
    id: "mock-client-john-smith",
    first_name: "John",
    last_name: "Smith",
    home_latitude: null,
    home_longitude: null,
    pcsp_goals: [],
    job_code: ["T2017"],
    medicaid_id: null,
    physical_address: "Maple House — 412 N Main St",
  },
  {
    id: "mock-client-jane-doe",
    first_name: "Jane",
    last_name: "Doe",
    home_latitude: null,
    home_longitude: null,
    pcsp_goals: [],
    job_code: ["S5125"],
    medicaid_id: null,
    physical_address: "Oak House — 88 Willow Ln",
  },
];

export function StaffClientGrid() {
  const { data: caseload, isLoading } = useCaseload();
  const [q, setQ] = useState("");

  const usingMock = !isLoading && (caseload?.length ?? 0) === 0;
  const source = usingMock ? MOCK_CLIENTS : (caseload ?? []);

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
            Tap a client to open their Unified Shift Profile.
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
          {clients.map((c) => {
            const codes = Array.isArray(c.job_code) ? c.job_code : [];
            const fullName = `${c.first_name} ${c.last_name}`.trim();
            const location = c.physical_address?.trim() || "No primary house on file";
            const isHHS = codes.includes("HHS");
            return (
              <li key={c.id} className="relative">
                <Link
                  to={isHHS ? "/dashboard/hhs-hub/$clientId" : "/dashboard/workspace/$clientId"}
                  params={{ clientId: c.id }}
                  aria-label={`Open ${isHHS ? "host home client hub" : "shift profile"} for ${fullName}`}
                  className="group flex w-full flex-col gap-4 rounded-2xl border border-border bg-background p-5 text-left shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex items-start gap-4">
                    <span className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${isHHS ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
                      <User className="h-7 w-7" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold leading-tight">{fullName}</p>
                      {isHHS && <Badge className="mt-1 bg-amber-500 hover:bg-amber-600">🏡 HHS — Host Home Supports</Badge>}
                      <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="line-clamp-2">{location}</span>
                      </p>
                      {codes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {codes.slice(0, 4).map((code) => (
                            <Badge key={code} variant="outline" className="font-mono text-[10px]">
                              {code}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    asChild
                    size="lg"
                    className="h-12 w-full text-base font-semibold"
                    tabIndex={-1}
                  >
                    <span>
                      <Rocket className="mr-2 h-5 w-5" /> {isHHS ? "🏡 Open Client Hub" : "Open Shift Profile"}
                    </span>
                  </Button>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
