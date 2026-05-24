import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCaseload } from "@/hooks/use-caseload";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Search, ArrowRight } from "lucide-react";

export function StaffClientGrid() {
  const { data: caseload, isLoading } = useCaseload();
  const [q, setQ] = useState("");

  const clients = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = caseload ?? [];
    if (!t) return list;
    return list.filter((c) =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(t),
    );
  }, [caseload, q]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">My Assigned Individuals</h3>
          <p className="text-xs text-muted-foreground">
            Tap an individual to open their workspace.
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading caseload…</p>
      ) : !clients.length ? (
        <Card className="mt-6 p-8 text-center text-sm text-muted-foreground">
          {q
            ? "No matches in your caseload."
            : "No individuals currently assigned to you. Please contact an Administrator."}
        </Card>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const codes = Array.isArray(c.job_code) ? c.job_code : [];
            return (
              <Link
                key={c.id}
                to="/dashboard/workspace/$clientId"
                params={{ clientId: c.id }}
                className="group flex items-start gap-3 rounded-xl border border-border bg-background p-4 text-left shadow-sm transition hover:border-primary hover:shadow-md"
              >
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {c.first_name} {c.last_name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {codes.length ? (
                      codes.slice(0, 4).map((code) => (
                        <Badge
                          key={code}
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
                          {code}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        No billing codes
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
