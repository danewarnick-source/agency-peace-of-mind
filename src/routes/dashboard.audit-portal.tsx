import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequireRole } from "@/components/rbac-guard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  SearchCode, User, Home as HomeIcon, MapPin, Clock, ClipboardCheck,
  FileText, Download, ShieldAlert, Filter, AlertTriangle,
} from "lucide-react";
import { jobCodeLabel } from "@/lib/job-codes";
import { decimalHoursBetween, roundToQuarterHour } from "@/lib/time-rounding";

export const Route = createFileRoute("/dashboard/audit-portal")({
  head: () => ({ meta: [{ title: "Audit Portal — Care Academy" }] }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <AuditPortalPage />
    </RequireRole>
  ),
});

type Mode = "staff" | "client";

function AuditPortalPage() {
  const { data: org } = useCurrentOrg();
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000);

  const [mode, setMode] = useState<Mode>("staff");
  const [staffId, setStaffId] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [startDate, setStartDate] = useState(monthAgo.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [armed, setArmed] = useState(false);

  // Picker data: org-scoped employees & clients.
  const { data: employees } = useQuery({
    enabled: !!org,
    queryKey: ["audit-employees", org?.organization_id],
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", org!.organization_id)
        .eq("active", true);
      if (error) throw error;
      const ids = (members ?? []).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []).sort((a, b) =>
        (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""),
      );
    },
  });

  const { data: clients } = useQuery({
    enabled: !!org,
    queryKey: ["audit-clients", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, medicaid_id, job_code")
        .eq("organization_id", org!.organization_id)
        .order("last_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const targetLabel = mode === "staff"
    ? (employees ?? []).find((e) => e.id === staffId)
        ? ((employees ?? []).find((e) => e.id === staffId)!.full_name ||
            (employees ?? []).find((e) => e.id === staffId)!.email || "—")
        : ""
    : (clients ?? []).find((c) => c.id === clientId)
        ? `${(clients ?? []).find((c) => c.id === clientId)!.first_name} ${
            (clients ?? []).find((c) => c.id === clientId)!.last_name}`
        : "";

  const canRun = mode === "staff" ? !!staffId : !!clientId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldAlert className="h-6 w-6 text-primary" /> Audit Portal
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-assisted compliance scrape for state inspections. Scope by staff or by individual, then export a unified audit bundle.
          </p>
        </div>
      </div>

      {/* Mode toggles */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => { setMode("staff"); setArmed(false); }}
          className={`group flex items-center gap-3 rounded-2xl border p-5 text-left transition ${
            mode === "staff"
              ? "border-primary bg-primary/5 shadow-md"
              : "border-border bg-card hover:border-primary/60"
          }`}
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <User className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">👤 Scope by Staff Member</p>
            <p className="text-xs text-muted-foreground">Pulls every punch, geofence pin, and bypass for one caregiver.</p>
          </div>
        </button>
        <button
          onClick={() => { setMode("client"); setArmed(false); }}
          className={`group flex items-center gap-3 rounded-2xl border p-5 text-left transition ${
            mode === "client"
              ? "border-primary bg-primary/5 shadow-md"
              : "border-border bg-card hover:border-primary/60"
          }`}
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HomeIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">🏠 Scope by Client Profile</p>
            <p className="text-xs text-muted-foreground">Pulls every shift, daily log, and submitted form for one individual.</p>
          </div>
        </button>
      </div>

      {/* Controls */}
      <Card className="p-5">
        <div className="grid items-end gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {mode === "staff" ? "Select staff member" : "Select client"}
            </Label>
            {mode === "staff" ? (
              <Select value={staffId} onValueChange={(v) => { setStaffId(v); setArmed(false); }}>
                <SelectTrigger><SelectValue placeholder="Pick a caregiver…" /></SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={clientId} onValueChange={(v) => { setClientId(v); setArmed(false); }}>
                <SelectTrigger><SelectValue placeholder="Pick an individual…" /></SelectTrigger>
                <SelectContent>
                  {(clients ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}{c.medicaid_id ? ` · ${c.medicaid_id}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Start date</Label>
            <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setArmed(false); }} />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">End date</Label>
            <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setArmed(false); }} />
          </div>
          <Button disabled={!canRun} onClick={() => setArmed(true)}>
            <SearchCode className="mr-2 h-4 w-4" /> Run Compliance Search
          </Button>
        </div>
      </Card>

      {armed && (
        <AuditResults
          mode={mode}
          targetId={mode === "staff" ? staffId : clientId}
          targetLabel={targetLabel}
          startDate={startDate}
          endDate={endDate}
          search={search}
          onSearchChange={setSearch}
          orgName={org?.organization_name ?? "Agency"}
        />
      )}
    </div>
  );
}

/* ===================== RESULTS ===================== */

type ResultRow = {
  id: string;
  kind: "shift" | "daily_log" | "submitted_form";
  occurred_at: string;
  title: string;
  subtitle: string;
  searchBlob: string;
  // Display payload
  meta: Record<string, string | number | boolean | null | undefined>;
};

function AuditResults({
  mode, targetId, targetLabel, startDate, endDate, search, onSearchChange, orgName,
}: {
  mode: Mode; targetId: string; targetLabel: string;
  startDate: string; endDate: string; search: string;
  onSearchChange: (s: string) => void; orgName: string;
}) {
  const { data: org } = useCurrentOrg();
  const startIso = `${startDate}T00:00:00.000Z`;
  const endIso = `${endDate}T23:59:59.999Z`;

  const { data, isLoading } = useQuery({
    enabled: !!org && !!targetId,
    queryKey: ["audit-results", mode, org?.organization_id, targetId, startIso, endIso],
    queryFn: async () => {
      const orgId = org!.organization_id;
      const filterCol = mode === "staff" ? "user_id" : "client_id";

      const [shiftsRes, logsRes, formsRes] = await Promise.all([
        supabase
          .from("shifts")
          .select("id, user_id, client_id, clock_in_time, clock_out_time, job_code, clock_in_lat, clock_in_long, clock_out_lat, clock_out_long, outside_geofence, clock_in_bypass_reason, clock_out_bypass_reason, geofence_bypass_reason, created_at, status")
          .eq("organization_id", orgId)
          .eq(filterCol, targetId)
          .gte("clock_in_time", startIso)
          .lte("clock_in_time", endIso),
        supabase
          .from("daily_logs")
          .select("id, user_id, client_id, log_date, narrative, pcsp_goals_addressed, signature_data_url, status, submitted_at")
          .eq("organization_id", orgId)
          .eq(filterCol, targetId)
          .gte("submitted_at", startIso)
          .lte("submitted_at", endIso),
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("submitted_forms" as any)
          .select("id, user_id, client_id, form_type, title, narrative, payload, occurred_at")
          .eq("organization_id", orgId)
          .eq(filterCol, targetId)
          .gte("occurred_at", startIso)
          .lte("occurred_at", endIso),
      ]);
      if (shiftsRes.error) throw shiftsRes.error;
      if (logsRes.error) throw logsRes.error;
      if (formsRes.error) throw formsRes.error;

      // Resolve names for the "other side" (the side not used as filter).
      const staffIds = new Set<string>();
      const clientIds = new Set<string>();
      (shiftsRes.data ?? []).forEach((r) => { if (r.user_id) staffIds.add(r.user_id); if (r.client_id) clientIds.add(r.client_id); });
      (logsRes.data ?? []).forEach((r) => { if (r.user_id) staffIds.add(r.user_id); if (r.client_id) clientIds.add(r.client_id); });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((formsRes.data ?? []) as any[]).forEach((r) => { if (r.user_id) staffIds.add(r.user_id); if (r.client_id) clientIds.add(r.client_id); });

      const staffMap = new Map<string, string>();
      const clientMap = new Map<string, string>();
      if (staffIds.size) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", Array.from(staffIds));
        (profs ?? []).forEach((p) => staffMap.set(p.id, p.full_name || p.email || "—"));
      }
      if (clientIds.size) {
        const { data: cls } = await supabase.from("clients").select("id, first_name, last_name").in("id", Array.from(clientIds));
        (cls ?? []).forEach((c) => clientMap.set(c.id, `${c.first_name} ${c.last_name}`));
      }
      const staffName = (id: string | null | undefined) => (id && staffMap.get(id)) || "—";
      const clientName = (id: string | null | undefined) => (id && clientMap.get(id)) || "—";

      const rows: ResultRow[] = [];
      let totalHours = 0;
      let bypasses = 0;
      let shiftCount = 0;

      (shiftsRes.data ?? []).forEach((s) => {
        const hrs = decimalHoursBetween(s.clock_in_time, s.clock_out_time);
        const rawIn = s.clock_in_time ? new Date(s.clock_in_time) : null;
        const rawOut = s.clock_out_time ? new Date(s.clock_out_time) : null;
        const billedIn = rawIn ? roundToQuarterHour(rawIn) : null;
        const billedOut = rawOut ? roundToQuarterHour(rawOut) : null;
        const billedHrs = rawIn && rawOut
          ? decimalHoursBetween(billedIn!, billedOut!)
          : 0;
        totalHours += billedHrs;
        shiftCount += 1;
        const bypassed = !!(s.outside_geofence || s.clock_in_bypass_reason || s.clock_out_bypass_reason || s.geofence_bypass_reason);
        if (bypassed) bypasses += 1;

        const blob = [
          jobCodeLabel(s.job_code), staffName(s.user_id), clientName(s.client_id),
          s.clock_in_bypass_reason, s.clock_out_bypass_reason, s.geofence_bypass_reason,
        ].filter(Boolean).join(" ").toLowerCase();

        rows.push({
          id: `shift-${s.id}`,
          kind: "shift",
          occurred_at: s.clock_in_time ?? s.created_at,
          title: `Shift · ${jobCodeLabel(s.job_code).split(" — ")[0]} · ${mode === "staff" ? clientName(s.client_id) : staffName(s.user_id)}`,
          subtitle: rawOut
            ? `${billedHrs.toFixed(2)} billed hrs · raw ${rawIn?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${rawOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "In progress",
          searchBlob: blob,
          meta: {
            "Raw clock-in": rawIn?.toISOString() ?? "—",
            "Billed clock-in": billedIn?.toISOString() ?? "—",
            "Raw clock-out": rawOut?.toISOString() ?? "—",
            "Billed clock-out": billedOut?.toISOString() ?? "—",
            "Billed hours": billedHrs.toFixed(2),
            "Code": jobCodeLabel(s.job_code),
            "GPS (in)": s.clock_in_lat != null && s.clock_in_long != null ? `${Number(s.clock_in_lat).toFixed(5)}, ${Number(s.clock_in_long).toFixed(5)}` : "—",
            "GPS (out)": s.clock_out_lat != null && s.clock_out_long != null ? `${Number(s.clock_out_lat).toFixed(5)}, ${Number(s.clock_out_long).toFixed(5)}` : "—",
            "Outside geofence": s.outside_geofence ? "YES" : "No",
            "Bypass reason": s.clock_in_bypass_reason || s.geofence_bypass_reason || s.clock_out_bypass_reason || "",
            "Staff": staffName(s.user_id),
            "Client": clientName(s.client_id),
          },
        });
      });

      (logsRes.data ?? []).forEach((l) => {
        const blob = [
          l.narrative, (l.pcsp_goals_addressed ?? []).join(" "),
          staffName(l.user_id), clientName(l.client_id),
        ].filter(Boolean).join(" ").toLowerCase();
        rows.push({
          id: `log-${l.id}`,
          kind: "daily_log",
          occurred_at: l.submitted_at,
          title: `Daily Log · ${mode === "staff" ? clientName(l.client_id) : staffName(l.user_id)}`,
          subtitle: `${(l.pcsp_goals_addressed ?? []).length} goals addressed · ${String(l.status).replace("_", " ")}`,
          searchBlob: blob,
          meta: {
            "Log date": l.log_date,
            "Status": String(l.status),
            "Goals addressed": (l.pcsp_goals_addressed ?? []).join("; ") || "—",
            "Caregiver signature": l.signature_data_url ? "On file" : "Missing",
            "Narrative": l.narrative,
            "Staff": staffName(l.user_id),
            "Client": clientName(l.client_id),
          },
        });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((formsRes.data ?? []) as any[]).forEach((f) => {
        const blob = [f.title, f.narrative, JSON.stringify(f.payload ?? {}), staffName(f.user_id), clientName(f.client_id)]
          .filter(Boolean).join(" ").toLowerCase();
        rows.push({
          id: `form-${f.id}`,
          kind: "submitted_form",
          occurred_at: f.occurred_at,
          title: `${formTypeLabel(f.form_type)} · ${f.title}`,
          subtitle: `${mode === "staff" ? clientName(f.client_id) : staffName(f.user_id)}`,
          searchBlob: blob,
          meta: {
            "Type": f.form_type,
            "Title": f.title,
            "Narrative": f.narrative ?? "—",
            "Staff": staffName(f.user_id),
            "Client": clientName(f.client_id),
          },
        });
      });

      rows.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
      return { rows, totalHours, bypasses, shiftCount };
    },
  });

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t || !data) return data?.rows ?? [];
    return data.rows.filter((r) =>
      r.searchBlob.includes(t) || r.title.toLowerCase().includes(t) || r.subtitle.toLowerCase().includes(t),
    );
  }, [data, search]);

  const handleExport = () => {
    exportAuditBundle({
      orgName,
      mode,
      targetLabel,
      startDate,
      endDate,
      rows: filtered,
      summary: data ? { totalHours: data.totalHours, bypasses: data.bypasses, shiftCount: data.shiftCount } : null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            {mode === "staff" ? "Staff scope" : "Client scope"}
          </Badge>
          <p className="text-sm font-medium">{targetLabel || "—"}</p>
          <span className="text-xs text-muted-foreground">
            {startDate} → {endDate}
          </span>
        </div>
        <Button onClick={handleExport} disabled={!data || filtered.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Export Unified Audit Bundle (PDF)
        </Button>
      </div>

      {/* Summary card (staff mode only emphasis, but always useful) */}
      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total shifts worked" value={String(data.shiftCount)} icon={Clock} />
          <StatCard label="Total decimal hours (billed)" value={data.totalHours.toFixed(2)} icon={ClipboardCheck} />
          <StatCard label="Geofence bypasses" value={String(data.bypasses)} icon={AlertTriangle} tone={data.bypasses ? "warn" : "ok"} />
        </div>
      )}

      <Card className="p-4">
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="AI Filter Content — e.g. ‘Seizure’, ‘Dr. Aris’, ‘bypass’"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">Compliance Ledger</h3>
          <span className="text-xs text-muted-foreground">{filtered.length} entries</span>
        </div>
        {isLoading ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Scraping database…</p>
        ) : !filtered.length ? (
          <p className="p-12 text-center text-sm text-muted-foreground">
            No records found in this scope.
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {filtered.map((r) => <ResultRowItem key={r.id} row={r} />)}
          </ol>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: {
  label: string; value: string; icon: typeof Clock; tone?: "ok" | "warn";
}) {
  const ring = tone === "warn"
    ? "border-orange-400/40 bg-orange-50 dark:bg-orange-500/10"
    : "border-border bg-card";
  return (
    <div className={`rounded-2xl border p-4 ${ring}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function fmtLongDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}
function fmtClockTime(iso: string | null | undefined) {
  if (!iso || iso === "—") return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ResultRowItem({ row }: { row: ResultRow }) {
  const staffName = String(row.meta["Staff"] ?? "—");
  const clientName = String(row.meta["Client"] ?? "—");
  const dateLabel = fmtLongDate(row.occurred_at);

  if (row.kind === "shift") {
    const billedIn = fmtClockTime(row.meta["Billed clock-in"] as string);
    const billedOut = fmtClockTime(row.meta["Billed clock-out"] as string);
    const billedHrs = String(row.meta["Billed hours"] ?? "0.00");
    const code = String(row.meta["Code"] ?? "—");
    return (
      <li className="px-8 py-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            {staffName} <span className="text-muted-foreground font-medium">·</span> {clientName}
          </h3>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Hourly Shift</Badge>
        </div>
        <p className="mt-2 text-base font-medium text-muted-foreground">📅 {dateLabel}</p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time Window</p>
            <p className="text-2xl font-semibold tabular-nums">
              {billedIn} <span className="text-muted-foreground">–</span> {billedOut}
            </p>
            <span className="inline-flex rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground/80">
              Code: {code}
            </span>
          </div>

          <div className="rounded-xl border border-primary/15 bg-primary/5 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Billing Impact</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-primary">{billedHrs} <span className="text-base font-semibold text-foreground/70">Hours Billed</span></p>
          </div>
        </div>
      </li>
    );
  }

  // daily_log or submitted_form — archival document layout
  const kindLabel = row.kind === "daily_log" ? "🏠 Daily Host Home Log" : formTypeLabel(String(row.meta["Type"] ?? "submitted_form"));
  const narrative = String(row.meta["Narrative"] ?? "");
  const goals = row.kind === "daily_log" ? String(row.meta["Goals addressed"] ?? "") : "";
  return (
    <li className="px-8 py-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-xl font-bold tracking-tight text-foreground">{clientName}</h3>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{kindLabel}</Badge>
      </div>
      <p className="mt-2 text-base font-medium text-muted-foreground">📅 {dateLabel}</p>
      <p className="mt-1 text-sm text-muted-foreground">Caregiver: <span className="font-medium text-foreground">{staffName}</span></p>

      {goals && goals !== "—" && (
        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PCSP Goals Addressed</p>
          <p className="mt-1.5 text-sm font-medium text-foreground/90">{goals}</p>
        </div>
      )}
      {narrative && narrative !== "—" && (
        <div className="mt-5 rounded-xl border border-border bg-muted/40 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Narrative</p>
          <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-foreground">{narrative}</p>
        </div>
      )}
    </li>
  );
}

function formTypeLabel(t: string) {
  if (t === "incident_report") return "🚨 Incident Report";
  if (t === "medical_summary") return "🩺 Medical Summary";
  if (t === "monthly_summary") return "📅 Monthly Summary";
  if (t === "receipt_upload") return "📸 Receipt";
  return t;
}

/* ===================== EXPORT (PRINT-TO-PDF) ===================== */

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}

function exportAuditBundle(opts: {
  orgName: string; mode: Mode; targetLabel: string;
  startDate: string; endDate: string; rows: ResultRow[];
  summary: { totalHours: number; bypasses: number; shiftCount: number } | null;
}) {
  const win = window.open("", "_blank", "width=1024,height=800");
  if (!win) return;
  const rowsHtml = opts.rows.map((r) => {
    const metaRows = Object.entries(r.meta)
      .filter(([, v]) => v !== "" && v != null)
      .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`)
      .join("");
    return `
      <section class="row">
        <header>
          <span class="kind kind-${r.kind}">${r.kind.replace("_", " ")}</span>
          <h3>${escapeHtml(r.title)}</h3>
          <time>${escapeHtml(new Date(r.occurred_at).toLocaleString())}</time>
        </header>
        <p class="sub">${escapeHtml(r.subtitle)}</p>
        <table>${metaRows}</table>
      </section>
    `;
  }).join("");

  const summary = opts.summary ? `
    <div class="summary">
      <div><span>Total shifts</span><strong>${opts.summary.shiftCount}</strong></div>
      <div><span>Billed hours</span><strong>${opts.summary.totalHours.toFixed(2)}</strong></div>
      <div><span>Bypasses</span><strong>${opts.summary.bypasses}</strong></div>
    </div>` : "";

  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Audit Bundle — ${escapeHtml(opts.orgName)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;margin:32px;font-size:12px;line-height:1.45}
  header.brand{border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end}
  header.brand h1{margin:0;font-size:20px}
  header.brand .meta{text-align:right;font-size:11px;color:#444}
  .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 18px}
  .summary > div{border:1px solid #ddd;border-radius:8px;padding:10px 12px}
  .summary span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#666}
  .summary strong{font-size:18px}
  .row{border:1px solid #e5e5e5;border-radius:8px;padding:10px 14px;margin-bottom:10px;page-break-inside:avoid}
  .row header{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .row header h3{margin:0;font-size:13px;flex:1 1 auto}
  .row header time{font-size:11px;color:#555}
  .kind{font-size:9px;text-transform:uppercase;letter-spacing:.08em;padding:2px 6px;border-radius:4px;background:#eee}
  .kind-shift{background:#dbeafe;color:#1d4ed8}
  .kind-daily_log{background:#dcfce7;color:#166534}
  .kind-submitted_form{background:#fef3c7;color:#92400e}
  .sub{margin:4px 0 6px;color:#555;font-size:11px}
  table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11px}
  th{text-align:left;width:32%;padding:3px 6px;color:#555;font-weight:500;vertical-align:top}
  td{padding:3px 6px;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;word-break:break-word}
  @media print{ body{margin:18mm 14mm} .no-print{display:none} }
</style>
</head><body>
<header class="brand">
  <div>
    <h1>${escapeHtml(opts.orgName)} — Compliance Audit Bundle</h1>
    <p style="margin:4px 0 0;color:#555">${opts.mode === "staff" ? "Staff Scope" : "Client Scope"} · ${escapeHtml(opts.targetLabel)}</p>
  </div>
  <div class="meta">
    <div>Period: ${escapeHtml(opts.startDate)} → ${escapeHtml(opts.endDate)}</div>
    <div>Generated: ${escapeHtml(new Date().toLocaleString())}</div>
    <div>${opts.rows.length} entries</div>
  </div>
</header>
${summary}
${rowsHtml || '<p style="color:#666">No entries.</p>'}
<button class="no-print" style="position:fixed;bottom:16px;right:16px;padding:10px 16px;border-radius:8px;border:0;background:#111;color:#fff;cursor:pointer" onclick="window.print()">Print / Save as PDF</button>
<script>setTimeout(()=>window.print(),400)</script>
</body></html>`);
  win.document.close();
}
