import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, AlertTriangle, TrendingDown, TrendingUp, Download, History, Loader2, Settings, Save, Pin, PinOff, Trash2, Calendar, X, Play } from "lucide-react";
import { useNectarAlerts, DEFAULT_NECTAR_ALERT_SETTINGS, type NectarAlert, type NectarAlertSettings } from "@/hooks/use-nectar-alerts";
import { askNectarReport, type NectarReportResult } from "@/lib/nectar-reports.functions";
import { listSavedReports, saveReport, deleteSavedReport, togglePinReport, upsertReportSchedule, unscheduleReport, type SavedReport } from "@/lib/saved-reports.functions";


export const Route = createFileRoute("/dashboard/billing/nectar")({
  head: () => ({ meta: [{ title: "NECTAR — Billing" }] }),
  component: NectarPage,
});

const SETTINGS_KEY = "hive.nectar.alertSettings";
const HISTORY_KEY = "hive.nectar.reportHistory";

function loadSettings(): NectarAlertSettings {
  if (typeof window === "undefined") return DEFAULT_NECTAR_ALERT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_NECTAR_ALERT_SETTINGS;
    const p = JSON.parse(raw) as Partial<NectarAlertSettings>;
    return {
      overWeeksAhead: typeof p.overWeeksAhead === "number" ? p.overWeeksAhead : DEFAULT_NECTAR_ALERT_SETTINGS.overWeeksAhead,
      underUnusedPct: typeof p.underUnusedPct === "number" ? p.underUnusedPct : DEFAULT_NECTAR_ALERT_SETTINGS.underUnusedPct,
    };
  } catch {
    return DEFAULT_NECTAR_ALERT_SETTINGS;
  }
}

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function NectarPage() {
  const [settings, setSettings] = useState<NectarAlertSettings>(DEFAULT_NECTAR_ALERT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { setSettings(loadSettings()); }, []);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
  }, [settings]);

  const { alerts, isLoading } = useNectarAlerts(settings);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#d97a1c]" />
            <h2 className="font-display text-lg font-semibold">NECTAR utilization alerts</h2>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            <Settings className="h-3.5 w-3.5" /> Sensitivity
          </button>
        </div>

        {showSettings && (
          <div className="mb-3 grid gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 sm:grid-cols-2">
            <label className="text-xs">
              Over-utilization lead (weeks before renewal)
              <input
                type="number" min={0} max={26} step={0.5}
                value={settings.overWeeksAhead}
                onChange={(e) => setSettings((s) => ({ ...s, overWeeksAhead: Number(e.target.value) || 0 }))}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs">
              Under-utilization threshold (% projected unused)
              <input
                type="number" min={0} max={100} step={1}
                value={Math.round(settings.underUnusedPct * 100)}
                onChange={(e) => setSettings((s) => ({ ...s, underUnusedPct: (Number(e.target.value) || 0) / 100 }))}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
          </div>
        )}

        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No clients flagged at current sensitivity. {isLoading ? "Loading usage data…" : "All budgets are on pace."}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map((a, i) => <AlertCard key={`${a.client_id}-${a.service_code}-${i}`} alert={a} />)}
          </div>
        )}
      </section>

      <SavedReportsSection onRunPrompt={(p: string) => {
        window.dispatchEvent(new CustomEvent("hive:nectar:run", { detail: { prompt: p } }));
      }} />
      <ReportBuilder />
    </div>
  );
}


function AlertCard({ alert: a }: { alert: NectarAlert }) {
  const palette = {
    exhausted: { bg: "bg-[#fef2f2]", border: "border-[#fecaca]", text: "text-[#991b1b]", Icon: AlertTriangle },
    expired:   { bg: "bg-[#fef2f2]", border: "border-[#fecaca]", text: "text-[#991b1b]", Icon: AlertTriangle },
    over:      { bg: "bg-[#fff7ed]", border: "border-[#fed7aa]", text: "text-[#9a3412]", Icon: TrendingUp },
    under:     { bg: "bg-[#eff6ff]", border: "border-[#bfdbfe]", text: "text-[#1e40af]", Icon: TrendingDown },
  }[a.kind];
  const Icon = palette.Icon;

  return (
    <Link
      to="/dashboard/billing/$clientId"
      params={{ clientId: a.client_id }}
      className={`block rounded-lg border ${palette.border} ${palette.bg} p-3 transition hover:shadow-sm`}
    >
      <div className={`flex items-start gap-2 ${palette.text}`}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold">{a.client_name}</h3>
            <span className="rounded bg-white/60 px-1.5 py-0.5 font-mono text-xs">{a.service_code}</span>
          </div>
          <p className="mt-1 text-xs">{a.message}</p>
          <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-foreground/80">
            <div>Used: <span className="tabular-nums font-medium">{Math.round(a.used_units)}/{Math.round(a.annual_units)} u</span></div>
            <div>Pace: <span className="tabular-nums font-medium">{a.weekly_pace_hours.toFixed(1)} hr/wk</span></div>
            <div>Target: <span className="tabular-nums font-medium">{a.hours_per_week_target.toFixed(1)} hr/wk</span></div>
            <div>Renewal: <span className="tabular-nums font-medium">{a.weeks_to_renewal.toFixed(1)} wks</span></div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Report builder ────────────────────────────────────────────────────────

function ReportBuilder() {
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [result, setResult] = useState<NectarReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ask = useServerFn(askNectarReport);

  useEffect(() => { setHistory(loadHistory()); }, []);

  // Listen for "run this saved report" events from SavedReportsSection.
  useEffect(() => {
    const onRun = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt: string }>).detail;
      if (detail?.prompt) {
        setPrompt(detail.prompt);
        m.mutate(detail.prompt);
      }
    };
    window.addEventListener("hive:nectar:run", onRun as EventListener);
    return () => window.removeEventListener("hive:nectar:run", onRun as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qc = useQueryClient();
  const saveSrv = useServerFn(saveReport);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const saveM = useMutation({
    mutationFn: async (name: string) => saveSrv({ data: { name, prompt: prompt.trim(), pinned: true } }),
    onSuccess: () => {
      setSaveOpen(false);
      setSaveName("");
      qc.invalidateQueries({ queryKey: ["saved-reports"] });
    },
  });


  const m = useMutation({
    mutationFn: async (p: string) => ask({ data: { prompt: p } }),
    onSuccess: (r, p) => {
      setResult(r);
      setError(null);
      const next = [p, ...history.filter((x) => x !== p)].slice(0, 8);
      setHistory(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      }
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    },
  });

  function submit(p?: string) {
    const q = (p ?? prompt).trim();
    if (q.length < 3) return;
    setPrompt(q);
    m.mutate(q);
  }

  function exportCsv() {
    if (!result) return;
    const headers = result.columns.map((c) => c.label);
    const lines = [headers.join(",")];
    for (const row of result.rows) {
      lines.push(result.columns.map((c) => csvCell(row[c.key])).join(","));
    }
    if (result.totals) {
      lines.push(result.columns.map((c) => csvCell(result.totals![c.key])).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nectar-report-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#d97a1c]" />
        <h2 className="font-display text-lg font-semibold">Ask NECTAR</h2>
        <span className="text-xs text-muted-foreground">Natural-language reports from HIVE data</span>
      </div>

      <div className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder='e.g. "Total DSI hours per client last quarter" or "All shifts John worked this month with Tonya"'
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => submit()}
          disabled={m.isPending || prompt.trim().length < 3}
          className="inline-flex items-center gap-2 rounded-md bg-[image:var(--gradient-brand)] px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-50"
        >
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Run
        </button>
        <button
          type="button"
          onClick={() => { setSaveName(prompt.slice(0, 60)); setSaveOpen(true); }}
          disabled={prompt.trim().length < 3}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> Save
        </button>
      </div>

      {saveOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this report (e.g. Weekly DSI hours)"
            className="flex-1 min-w-[200px] rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => saveName.trim() && saveM.mutate(saveName.trim())}
            disabled={saveM.isPending || saveName.trim().length === 0}
            className="inline-flex items-center gap-1 rounded-md bg-[#0f1b3d] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {saveM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save &amp; pin
          </button>
          <button type="button" onClick={() => setSaveOpen(false)} className="inline-flex items-center rounded-md border border-border p-1 text-xs">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <History className="h-3.5 w-3.5" /> Recent:
          {history.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => submit(h)}
              className="rounded-full border border-border bg-background px-2 py-0.5 hover:bg-muted"
            >
              {h.length > 60 ? h.slice(0, 57) + "…" : h}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">{error}</p>
      )}

      {result && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{result.title}</h3>
              <p className="text-xs text-muted-foreground">
                Intent: <span className="font-mono">{result.plan.intent}</span> · {result.rows.length} rows
              </p>
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
          {result.notice && (
            <p className="rounded-md border border-[#fed7aa] bg-[#fff7ed] px-2 py-1 text-xs text-[#9a3412]">
              {result.notice}
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>{result.columns.map((c) => (
                  <th key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>
                ))}</tr>
              </thead>
              <tbody>
                {result.rows.length === 0 ? (
                  <tr><td colSpan={result.columns.length} className="p-4 text-center text-muted-foreground">No rows matched.</td></tr>
                ) : result.rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {result.columns.map((c) => (
                      <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                        {fmt(r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                {result.totals && (
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                    {result.columns.map((c) => (
                      <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                        {fmt(result.totals![c.key])}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function fmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  return v;
}
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ─── Saved reports + schedules ─────────────────────────────────────────────

function SavedReportsSection({ onRunPrompt }: { onRunPrompt: (p: string) => void }) {
  const list = useServerFn(listSavedReports);
  const del = useServerFn(deleteSavedReport);
  const togglePin = useServerFn(togglePinReport);
  const upsertSched = useServerFn(upsertReportSchedule);
  const unschedule = useServerFn(unscheduleReport);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["saved-reports"],
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["saved-reports"] });
  const delM = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: invalidate });
  const pinM = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      togglePin({ data: { id, pinned } }),
    onSuccess: invalidate,
  });
  const unscheduleM = useMutation({
    mutationFn: (id: string) => unschedule({ data: { id } }),
    onSuccess: invalidate,
  });

  const [scheduleFor, setScheduleFor] = useState<SavedReport | null>(null);

  const reports = q.data ?? [];

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Pin className="h-4 w-4 text-[#d97a1c]" />
        <h2 className="font-display text-lg font-semibold">Saved reports</h2>
        <span className="text-xs text-muted-foreground">
          Pin one-tap re-runs and schedule recurring delivery
        </span>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading saved reports…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No saved reports yet. Run an Ask NECTAR query below and click <span className="font-medium">Save</span> to pin it here.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {reports.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-sm font-semibold text-[#0f1b3d]">
                    {r.pinned && <Pin className="h-3 w-3 text-[#d97a1c]" />}
                    <span className="truncate">{r.name}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.prompt}</p>
                  {r.schedule && r.schedule.active && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#1e40af]">
                      <Calendar className="h-3 w-3" />
                      {r.schedule.cadence === "weekly"
                        ? `Weekly · ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][r.schedule.day_of_week ?? 1]} @ ${r.schedule.hour}:00`
                        : `Monthly · day ${r.schedule.day_of_month} @ ${r.schedule.hour}:00`}
                      {r.schedule.next_run_at && ` · next ${new Date(r.schedule.next_run_at).toLocaleDateString()}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Run now"
                    onClick={() => onRunPrompt(r.prompt)}
                    className="rounded-md border border-border p-1.5 text-xs hover:bg-muted"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title={r.pinned ? "Unpin" : "Pin"}
                    onClick={() => pinM.mutate({ id: r.id, pinned: !r.pinned })}
                    className="rounded-md border border-border p-1.5 text-xs hover:bg-muted"
                  >
                    {r.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    title="Schedule"
                    onClick={() => setScheduleFor(r)}
                    className="rounded-md border border-border p-1.5 text-xs hover:bg-muted"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                  </button>
                  {r.schedule?.active && (
                    <button
                      type="button"
                      title="Unschedule"
                      onClick={() => unscheduleM.mutate(r.id)}
                      className="rounded-md border border-border p-1.5 text-xs hover:bg-muted"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => { if (confirm(`Delete "${r.name}"?`)) delM.mutate(r.id); }}
                    className="rounded-md border border-border p-1.5 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {scheduleFor && (
        <ScheduleDialog
          report={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onSave={async (input) => {
            await upsertSched({ data: { ...input, saved_report_id: scheduleFor.id } });
            setScheduleFor(null);
            invalidate();
          }}
        />
      )}
    </section>
  );
}

function ScheduleDialog({
  report, onClose, onSave,
}: {
  report: SavedReport;
  onClose: () => void;
  onSave: (input: {
    cadence: "weekly" | "monthly"; day_of_week: number | null; day_of_month: number | null;
    hour: number; deliver_email: boolean; recipients: string[]; deliver_save: boolean;
  }) => void | Promise<void>;
}) {
  const existing = report.schedule;
  const [cadence, setCadence] = useState<"weekly" | "monthly">(existing?.cadence ?? "weekly");
  const [dayOfWeek, setDayOfWeek] = useState<number>(existing?.day_of_week ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(existing?.day_of_month ?? 1);
  const [hour, setHour] = useState<number>(existing?.hour ?? 8);
  const [emailOn, setEmailOn] = useState<boolean>(existing?.deliver_email ?? true);
  const [recipientsRaw, setRecipientsRaw] = useState<string>((existing?.recipients ?? []).join(", "));
  const [saveOn, setSaveOn] = useState<boolean>(existing?.deliver_save ?? true);
  const [pending, setPending] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">Schedule "{report.name}"</h3>
          <button type="button" onClick={onClose} className="rounded-md border border-border p-1"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCadence("weekly")}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${cadence === "weekly" ? "border-[#0f1b3d] bg-[#0f1b3d] text-white" : "border-border"}`}
            >Weekly</button>
            <button
              type="button"
              onClick={() => setCadence("monthly")}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${cadence === "monthly" ? "border-[#0f1b3d] bg-[#0f1b3d] text-white" : "border-border"}`}
            >Monthly</button>
          </div>

          {cadence === "weekly" ? (
            <label className="block text-xs">
              Day of week
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-xs">
              Day of month (1–28)
              <input
                type="number" min={1} max={28}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          )}

          <label className="block text-xs">
            Hour (24h)
            <input
              type="number" min={0} max={23}
              value={hour}
              onChange={(e) => setHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={saveOn} onChange={(e) => setSaveOn(e.target.checked)} />
            Save each run to this tab
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={emailOn} onChange={(e) => setEmailOn(e.target.checked)} />
            Email results
          </label>

          {emailOn && (
            <label className="block text-xs">
              Recipients (comma-separated)
              <input
                value={recipientsRaw}
                onChange={(e) => setRecipientsRaw(e.target.value)}
                placeholder="ops@example.com, billing@example.com"
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm">Cancel</button>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                const recipients = recipientsRaw.split(",").map((s) => s.trim()).filter(Boolean);
                await onSave({
                  cadence,
                  day_of_week: cadence === "weekly" ? dayOfWeek : null,
                  day_of_month: cadence === "monthly" ? dayOfMonth : null,
                  hour, deliver_email: emailOn, recipients, deliver_save: saveOn,
                });
              } finally { setPending(false); }
            }}
            className="inline-flex items-center gap-1 rounded-md bg-[#0f1b3d] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save schedule
          </button>
        </div>
      </div>
    </div>
  );
}
