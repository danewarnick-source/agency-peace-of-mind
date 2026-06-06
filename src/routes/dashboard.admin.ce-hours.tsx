// Continuing Education — Admin roster.
// Phase 2: org-wide hours tracker (X/12), per-staff signed ledger, CSV + print.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getOrgCeRoster, getStaffCeLedger, type CeRosterRow, type CeLedgerEntry } from "@/lib/ce.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { GraduationCap, Download, Printer, ChevronLeft, ArrowLeft, FileCheck2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/dashboard/admin/ce-hours")({ component: AdminCeHours });

function statusBadge(s: CeRosterRow["status"]) {
  if (s === "complete") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Complete</Badge>;
  if (s === "on_track") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">On track</Badge>;
  if (s === "behind") return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Behind</Badge>;
  return <Badge variant="outline">Year 1</Badge>;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsv(s: unknown): string {
  const v = String(s ?? "");
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function AdminCeHours() {
  const navigate = useNavigate();
  const fetchRoster = useServerFn(getOrgCeRoster);
  const { data, isLoading } = useQuery({ queryKey: ["ce-roster"], queryFn: () => fetchRoster() });
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<CeRosterRow | null>(null);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (!q.trim()) return all;
    const t = q.toLowerCase();
    return all.filter((r) => r.fullName.toLowerCase().includes(t) || (r.email ?? "").toLowerCase().includes(t));
  }, [data, q]);

  function exportCsv() {
    const header = ["Staff", "Email", "Hire Date", "Status", "Hours This Year", "Goal", "Expected To Date", "Days Left", "Year Start", "Year End", "Last Completed"];
    const lines = [header.join(",")];
    for (const r of (data?.rows ?? [])) {
      lines.push([
        r.fullName, r.email ?? "", r.hireDate ?? "", r.status,
        r.hoursThisYear, r.goalHours, r.expectedHoursToDate, r.daysLeftInYear,
        r.ceYearStart ?? "", r.ceYearEnd ?? "", r.lastCompletedAt ?? "",
      ].map(escapeCsv).join(","));
    }
    downloadCsv(`ce-hours-${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"));
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate({ to: "/dashboard" })} />
        <Card className="p-6 text-sm text-muted-foreground">Loading CE roster…</Card>
      </div>
    );
  }

  if (selected) {
    return <StaffDetail row={selected} onBack={() => setSelected(null)} />;
  }

  const total = data.rows.length;
  const applies = data.rows.filter((r) => r.ceApplies).length;
  const complete = data.rows.filter((r) => r.status === "complete").length;
  const behind = data.behindCount;

  return (
    <div className="space-y-5 print:space-y-3">
      <BackLink onClick={() => navigate({ to: "/dashboard" })} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">CE Hours — Annual Roster</h1>
            <p className="text-xs text-muted-foreground">
              DSPD scope-of-work: {data.goalHours} continuing-education hours per staff per year (Year 2+).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" /> Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" /> Print</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total staff" value={total} />
        <Stat label="In CE (Year 2+)" value={applies} />
        <Stat label="Complete" value={complete} tone="good" />
        <Stat label="Behind pace" value={behind} tone={behind > 0 ? "bad" : "muted"} />
      </div>

      <div className="print:hidden">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff…" className="max-w-sm" />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Staff</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Progress</th>
                <th className="px-3 py-2 text-left">Hours</th>
                <th className="px-3 py-2 text-left">Year ends</th>
                <th className="px-3 py-2 text-left print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No staff match.</td></tr>
              )}
              {rows.map((r) => {
                const pct = r.ceApplies ? Math.min(100, (r.hoursThisYear / r.goalHours) * 100) : 0;
                return (
                  <tr key={r.staffId} className="border-t border-border">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{r.fullName}</div>
                      <div className="text-xs text-muted-foreground">{r.email ?? ""}</div>
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(r.status)}</td>
                    <td className="px-3 py-2.5 min-w-[140px]">
                      {r.ceApplies ? (
                        <Progress value={pct} className="h-2" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.ceApplies ? (
                        <>
                          <span className="font-semibold">{r.hoursThisYear.toFixed(1)}</span>
                          <span className="text-muted-foreground"> / {r.goalHours}</span>
                          {r.status === "behind" && (
                            <div className="text-[11px] text-rose-600">expected {r.expectedHoursToDate.toFixed(1)} by now</div>
                          )}
                        </>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {r.ceYearEnd ?? "—"}
                      {r.ceApplies && <div>{r.daysLeftInYear} days left</div>}
                    </td>
                    <td className="px-3 py-2.5 print:hidden">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>
                        View ledger
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" | "muted" }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-foreground";
  return (
    <Card className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${cls}`}>{value}</div>
    </Card>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground print:hidden">
      <ChevronLeft className="h-3.5 w-3.5" /> Back to dashboard
    </button>
  );
}

function StaffDetail({ row, onBack }: { row: CeRosterRow; onBack: () => void }) {
  const fetchLedger = useServerFn(getStaffCeLedger);
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["ce-ledger", row.staffId],
    queryFn: () => fetchLedger({ data: { staffId: row.staffId } }),
  });

  function exportCsv() {
    const header = ["Completed", "Title", "Hours", "Active Minutes", "Type", "Signed By", "Source"];
    const lines = [header.join(",")];
    for (const e of entries) {
      lines.push([e.completed_at, e.title, e.hours, e.active_minutes, e.type, e.signature_name, e.source ?? ""].map(escapeCsv).join(","));
    }
    downloadCsv(`ce-ledger-${row.fullName.replace(/\s+/g,"_")}.csv`, lines.join("\n"));
  }

  return (
    <div className="space-y-5 print:space-y-3">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to roster
      </button>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{row.fullName}</h1>
          <p className="text-xs text-muted-foreground">{row.email ?? ""}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>{statusBadge(row.status)}</div>
          <div><span className="font-semibold">{row.hoursThisYear.toFixed(1)}</span><span className="text-muted-foreground"> / {row.goalHours} hours</span></div>
          {row.ceApplies && (
            <div className="text-xs text-muted-foreground">
              CE year: {row.ceYearStart} → {row.ceYearEnd} · {row.daysLeftInYear} days left
            </div>
          )}
          {row.status === "behind" && (
            <div className="inline-flex items-center gap-1 text-xs text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Behind pace — expected {row.expectedHoursToDate.toFixed(1)}h by now
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Signed CE Ledger
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading ledger…</div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No completed CE entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Completed</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Hours</th>
                  <th className="px-3 py-2 text-left">Active min</th>
                  <th className="px-3 py-2 text-left">Signed by</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e: CeLedgerEntry) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
                        {new Date(e.completed_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-3 py-2">{e.title}</td>
                    <td className="px-3 py-2">{Number(e.hours).toFixed(1)}</td>
                    <td className="px-3 py-2">{e.active_minutes}</td>
                    <td className="px-3 py-2">{e.signature_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
