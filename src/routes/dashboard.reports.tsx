import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FileDown, FileBarChart } from "lucide-react";

export const Route = createFileRoute("/dashboard/reports")({ component: ReportsPage });

function ReportsPage() {
  const reports = [
    { name: "Q2 Compliance Summary", generated: "May 18, 2026", status: "Ready" },
    { name: "Staff Training Completion", generated: "May 12, 2026", status: "Ready" },
    { name: "Incident Reports — April", generated: "May 02, 2026", status: "Ready" },
    { name: "DSPD Annual Audit Pack", generated: "April 28, 2026", status: "Ready" },
  ];
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Audit-ready reports</h2>
        <p className="text-sm text-muted-foreground">Download up-to-date compliance evidence on demand.</p>
      </div>
      <div className="grid gap-3">
        {reports.map((r) => (
          <div key={r.name} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <FileBarChart className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">Generated {r.generated}</p>
              </div>
            </div>
            <Button variant="outline" size="sm"><FileDown className="mr-2 h-3.5 w-3.5" /> Download</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
