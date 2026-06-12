import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequireRole } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Download,
  Printer,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  askFinancialNectar,
  type NectarFinReport,
  type NectarFinSource,
} from "@/lib/financial-nectar.functions";

export const Route = createFileRoute("/dashboard/financial/nectar")({
  head: () => ({ meta: [{ title: "NECTAR Financial — HIVE" }] }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <NectarFinancialPage />
    </RequireRole>
  ),
});

const SOURCE_LABEL: Record<NectarFinSource, string> = {
  revenue: "Revenue",
  monthly_grid: "Monthly Grid",
  host_home: "Host Home",
  rhs: "RHS",
  contractors: "Contractors",
  employees: "Employees",
  totals: "Totals",
  tns_gross: "TNS Gross",
  distributions: "Distributions",
};

const SUGGESTIONS = [
  "Summarize this year's revenue vs total payroll expenses.",
  "How much did we bill from Host Home this year? How many billable days?",
  "Compare contractor pay vs W-2 employee additional pay.",
  "Show distribution plan participants and retention for the active plan.",
  "What's the net after expenses for the year?",
  "How much RHS billed this year?",
];

function NectarFinancialPage() {
  const { data: org } = useCurrentOrg();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<NectarFinReport[]>([]);

  const fnAsk = useServerFn(askFinancialNectar);

  const ask = useMutation({
    mutationFn: async (q: string): Promise<NectarFinReport> => {
      return await fnAsk({
        data: { organizationId: org!.organization_id, year, question: q },
      });
    },
    onSuccess: (report) => {
      setHistory((h) => [report, ...h].slice(0, 20));
      setQuestion("");
    },
    onError: (e: Error) => toast.error(e.message || "NECTAR request failed"),
  });

  const onSubmit = (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || !org?.organization_id) return;
    ask.mutate(text);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight inline-flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            NECTAR Financial Reporting
          </h2>
          <p className="text-sm text-muted-foreground">
            Ask financial questions in plain English. NECTAR only reports on data you have permission to see — restricted sources are
            declined, never partially leaked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setYear((y) => y - 1)}>
            ◀ {year - 1}
          </Button>
          <div className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium">{year}</div>
          <Button variant="outline" size="sm" onClick={() => setYear((y) => y + 1)}>
            {year + 1} ▶
          </Button>
        </div>
      </header>

      <Card className="p-4 space-y-3">
        <Label className="text-sm font-semibold">Ask NECTAR</Label>
        <Textarea
          rows={3}
          placeholder="e.g. Summarize revenue vs payroll for this year, or compare contractor and W-2 pay."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuestion(s);
                  onSubmit(s);
                }}
                className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            disabled={ask.isPending || !question.trim() || !org?.organization_id}
            onClick={() => onSubmit()}
          >
            {ask.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Asking…
              </>
            ) : (
              <>
                <Sparkles className="mr-1 h-4 w-4" /> Ask NECTAR
              </>
            )}
          </Button>
        </div>
        <p className="text-[11px] italic text-muted-foreground">
          NECTAR uses only the figures it is permitted to see this turn. It will refuse to estimate any
          restricted source — distribution / owner payouts are visible only to admin and super admin.
        </p>
      </Card>

      <div className="space-y-3">
        {history.length === 0 && !ask.isPending && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No reports yet. Ask a question above to get started.
          </Card>
        )}
        {history.map((report, i) => (
          <ReportCard key={`${report.question}-${i}`} report={report} />
        ))}
      </div>
    </div>
  );
}

function ReportCard({ report }: { report: NectarFinReport }) {
  const printRef = useMemo(() => `nectar-report-${Math.random().toString(36).slice(2)}`, []);
  const allowed = report.sources.filter((s) => s.allowed);
  const declined = report.sources.filter((s) => !s.allowed);

  const exportCsv = () => {
    const rows: string[] = ["source,key,value"];
    for (const s of allowed) {
      if (!s.data) continue;
      for (const [k, v] of Object.entries(s.data)) {
        const cell = Array.isArray(v) ? JSON.stringify(v) : String(v ?? "");
        const escaped = `"${cell.replace(/"/g, '""')}"`;
        rows.push(`${s.source},${k},${escaped}`);
      }
    }
    for (const s of declined) {
      rows.push(`${s.source},_declined,"${(s.decline_reason ?? "no access").replace(/"/g, '""')}"`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nectar-financial-${report.year}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const node = document.getElementById(printRef);
    if (!node) {
      window.print();
      return;
    }
    const w = window.open("", "_blank", "noopener,noreferrer,width=860,height=900");
    if (!w) {
      window.print();
      return;
    }
    w.document.write(`<!doctype html><html><head><title>NECTAR Financial — ${report.year}</title>
      <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; color: #111; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        h2 { font-size: 14px; margin: 16px 0 6px; }
        .q { color: #444; font-style: italic; margin-bottom: 12px; }
        .pre { white-space: pre-wrap; font-size: 13px; line-height: 1.5; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
        th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; }
        th { background: #f7f7f7; }
        .declined { color: #a33; }
      </style></head><body>${node.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 200);
  };

  return (
    <Card className="p-4 space-y-3" id={printRef}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b pb-2">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            {report.year} ·{" "}
            <span className="inline-flex items-center gap-1">
              {report.any_declined ? (
                <>
                  <ShieldAlert className="h-3 w-3 text-amber-600" /> partial access
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3 w-3 text-emerald-600" /> full access (requested sources)
                </>
              )}
            </span>
          </div>
          <p className="text-sm font-semibold">{report.question}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={printReport}>
            <Printer className="mr-1 h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </header>

      <section className="pre text-sm whitespace-pre-wrap leading-relaxed">{report.answer}</section>

      {declined.length > 0 && (
        <section className="rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs space-y-1">
          <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Declined sources (you do not have access)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {declined.map((s) => (
              <Badge key={s.source} variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                {SOURCE_LABEL[s.source]}
              </Badge>
            ))}
          </div>
          <p className="italic text-amber-700/80 dark:text-amber-300/80">
            NECTAR did not include any figures from these sources in its answer.
          </p>
        </section>
      )}

      {allowed.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-muted-foreground">Sources used:</span>
            {allowed.map((s) => (
              <Badge key={s.source} variant="secondary" className="text-[10px]">
                {SOURCE_LABEL[s.source]}
              </Badge>
            ))}
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-2 py-1.5 text-left">Source</th>
                  <th className="px-2 py-1.5 text-left">Key</th>
                  <th className="px-2 py-1.5 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {allowed.flatMap((s) =>
                  Object.entries(s.data ?? {}).map(([k, v]) => (
                    <tr key={`${s.source}-${k}`} className="border-t">
                      <td className="px-2 py-1.5 font-medium">{SOURCE_LABEL[s.source]}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{k}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {Array.isArray(v) ? JSON.stringify(v) : String(v ?? "—")}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Card>
  );
}
