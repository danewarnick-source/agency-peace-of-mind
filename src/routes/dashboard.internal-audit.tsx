import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCurrentOrg } from "@/hooks/use-org";
import { useCaseload } from "@/hooks/use-caseload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ShieldAlert,
  Info,
  Loader2,
  PlayCircle,
  FileDown,
  ExternalLink,
  Hexagon,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

import { AddonLock } from "@/components/nectar/addon-lock";
import { useEntitlements } from "@/hooks/use-entitlements";
import {
  runInternalAudit,
  listAuditableStaff,
  type AuditFinding,
  type AuditSummary,
  type FindingArea,
  type Severity,
} from "@/lib/internal-audit.functions";
import { RequirePermission } from "@/components/rbac-guard";
import { SamplePicker } from "@/components/internal-audit/sample-picker";
import { toast } from "sonner";


export const Route = createFileRoute("/dashboard/internal-audit")({
  head: () => ({ meta: [{ title: "Internal Audit — NECTAR — HIVE" }] }),
  component: () => (
    <RequirePermission perm="view_analytics">
      <InternalAuditPage />
    </RequirePermission>
  ),
});

const AREA_LABEL: Record<FindingArea, string> = {
  documentation: "Documentation",
  daily_logs: "Daily Logs",
  evv_timesheets: "EVV / Timesheets",
  billing: "Billing & Authorizations",
  staff_certifications: "Staff Certifications",
  requirements_engine: "Requirements Engine",
  external_attestations: "External Attestations",
};

const SEVERITY_BADGE: Record<Severity, { label: string; cls: string; Icon: typeof AlertTriangle }> = {
  critical: {
    label: "Critical gap",
    cls: "bg-red-50 text-red-700 border-red-200",
    Icon: ShieldAlert,
  },
  attention: {
    label: "Needs attention",
    cls: "bg-amber-50 text-amber-800 border-amber-200",
    Icon: AlertTriangle,
  },
  minor: {
    label: "Minor",
    cls: "bg-slate-50 text-slate-700 border-slate-200",
    Icon: Info,
  },
};

export function InternalAuditPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? "";
  const { hasAddon } = useEntitlements();
  const auditEntitled = hasAddon("internal_audit");
  const { data: caseload } = useCaseload();
  const run = useServerFn(runInternalAudit);
  const listStaff = useServerFn(listAuditableStaff);

  const [clientId, setClientId] = useState<string>("all");
  const [area, setArea] = useState<string>("all");
  const [serviceCode, setServiceCode] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [sampleClientIds, setSampleClientIds] = useState<string[]>([]);
  const [sampleStaffIds, setSampleStaffIds] = useState<string[]>([]);
  const [targetClientCount, setTargetClientCount] = useState<string>("");
  const [targetStaffCount, setTargetStaffCount] = useState<string>("");

  const staffQ = useQuery({
    enabled: !!orgId,
    queryKey: ["internal-audit-staff", orgId],
    queryFn: () => listStaff({ data: { organizationId: orgId } }),
    staleTime: 60_000,
  });

  const clientOptions = useMemo(
    () =>
      (caseload ?? []).map((c) => ({
        id: c.id,
        label: `${c.last_name}, ${c.first_name}`,
      })),
    [caseload],
  );
  const staffOptions = useMemo(
    () =>
      (staffQ.data ?? []).map((s) => ({
        id: s.user_id,
        label: s.full_name || s.email || "Staff",
        sublabel: s.job_title || s.role,
      })),
    [staffQ.data],
  );

  const usingSample = sampleClientIds.length > 0 || sampleStaffIds.length > 0;

  const auditQ = useQuery<AuditSummary>({
    enabled: !!orgId,
    queryKey: [
      "internal-audit",
      orgId,
      clientId,
      area,
      serviceCode.trim().toUpperCase(),
      dateFrom,
      dateTo,
      sampleClientIds.join(","),
      sampleStaffIds.join(","),
    ],
    // Continuous mode: keep readiness fresh in the background.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: () =>
      run({
        data: {
          organizationId: orgId,
          clientId:
            sampleClientIds.length > 0 ? null : clientId === "all" ? null : clientId,
          clientIds: sampleClientIds.length ? sampleClientIds : null,
          staffIds: sampleStaffIds.length ? sampleStaffIds : null,
          serviceCode: serviceCode.trim() ? serviceCode.trim().toUpperCase() : null,
          area: area === "all" ? null : (area as FindingArea),
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
        },
      }),
  });


  const findings = useMemo(() => {
    const all = auditQ.data?.findings ?? [];
    return severityFilter === "all" ? all : all.filter((f) => f.severity === severityFilter);
  }, [auditQ.data, severityFilter]);

  const exportCsv = () => {
    if (!auditQ.data?.findings.length) {
      toast.error("Nothing to export yet");
      return;
    }
    const s = auditQ.data;
    const meta: string[][] = [
      ["# Internal Audit Report"],
      ["# Generated", new Date(s.generatedAt).toISOString()],
      ["# Date range", `${dateFrom || "—"} to ${dateTo || "—"}`],
      ["# Area", area === "all" ? "All areas" : AREA_LABEL[area as FindingArea]],
      ["# Service code", serviceCode || "—"],
      [
        "# Sample clients",
        s.scope.sampleClients?.length
          ? `${s.scope.sampleClients.length} — ${s.scope.sampleClients
              .map((c) => c.name)
              .join("; ")}`
          : clientId === "all"
          ? "All clients"
          : clientOptions.find((c) => c.id === clientId)?.label ?? clientId,
      ],
      [
        "# Sample staff",
        s.scope.sampleStaff?.length
          ? `${s.scope.sampleStaff.length} — ${s.scope.sampleStaff
              .map((p) => p.name)
              .join("; ")}`
          : "All staff",
      ],
      ["# Readiness score", `${s.readinessScore}/100`],
      [
        "# Totals",
        `critical=${s.totals.critical}; attention=${s.totals.attention}; minor=${s.totals.minor}`,
      ],
      [""],
    ];
    const rows: string[][] = [
      ...meta,
      ["severity", "area", "title", "detail", "subject", "source_citation", "as_of", "fix_link"],
      ...s.findings.map((f) => [
        f.severity,
        AREA_LABEL[f.area],
        f.title,
        f.detail,
        f.subjectName ?? "",
        f.sourceCitation ?? "",
        f.asOf,
        f.fixHref ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `internal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Internal audit report downloaded");
  };


  const summary = auditQ.data;

  const body = (
    <div className="space-y-6">
      {/* Header / posture */}
      <div className="rounded-2xl border border-[#f4a93a]/30 bg-gradient-to-br from-[#fff7ed] via-white to-white p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4a93a]/15 ring-1 ring-[#f4a93a]/30">
              <Hexagon className="h-5 w-5 text-[#d97a1c]" />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight text-[#0f1b3d]">
                Internal Audit
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#f4a93a]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#9a3412]">
                  <Sparkles className="h-3 w-3" /> NECTAR
                </span>
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                NECTAR audits your company against your own confirmed requirements so QA catches
                gaps before a state audit does. Results are advisory — review recommended, not a
                guarantee of compliance. NECTAR identifies; your team acts.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => auditQ.refetch()}
              disabled={auditQ.isFetching}
            >
              {auditQ.isFetching ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-3.5 w-3.5" />
              )}
              Run audit now
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <FileDown className="mr-2 h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </div>
      </div>

      {/* DSPD-style sample builder */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#0f1b3d]">DSPD-style sample</h3>
            <p className="text-xs text-muted-foreground">
              Hand-pick the specific clients and staff to audit (e.g. a DSPD sample request of
              8 clients + 5 staff). Leave both empty to use the standard scope below.
            </p>
          </div>
          {usingSample && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSampleClientIds([]);
                setSampleStaffIds([]);
              }}
            >
              Clear sample
            </Button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <SamplePicker
              label="Sample clients"
              placeholder="Pick clients for the sample…"
              options={clientOptions}
              selected={sampleClientIds}
              onChange={setSampleClientIds}
              targetCount={
                targetClientCount && /^\d+$/.test(targetClientCount)
                  ? Number(targetClientCount)
                  : null
              }
              emptyHint="No clients in your caseload"
            />
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-muted-foreground">DSPD requested</label>
              <Input
                value={targetClientCount}
                onChange={(e) => setTargetClientCount(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="e.g. 8"
                className="h-7 w-20 text-xs"
              />
            </div>
          </div>
          <div className="space-y-2">
            <SamplePicker
              label="Sample staff"
              placeholder="Pick staff for the sample…"
              options={staffOptions}
              selected={sampleStaffIds}
              onChange={setSampleStaffIds}
              targetCount={
                targetStaffCount && /^\d+$/.test(targetStaffCount)
                  ? Number(targetStaffCount)
                  : null
              }
              emptyHint={staffQ.isLoading ? "Loading staff…" : "No active staff"}
            />
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-muted-foreground">DSPD requested</label>
              <Input
                value={targetStaffCount}
                onChange={(e) => setTargetStaffCount(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="e.g. 5"
                className="h-7 w-20 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Scope filters (whole company / single client / area / date) */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0f1b3d]">Other scope filters</h3>
          {usingSample && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              Sample active — single-client filter ignored
            </span>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Client (single)
            </label>
            <Select value={clientId} onValueChange={setClientId} disabled={sampleClientIds.length > 0}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {(caseload ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.last_name}, {c.first_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Area</label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
                {Object.entries(AREA_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Service code
            </label>
            <Input
              value={serviceCode}
              placeholder="e.g. S5125"
              onChange={(e) => setServiceCode(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>


      {/* Summary cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <ReadinessCard score={summary?.readinessScore} loading={auditQ.isLoading} />
        <SummaryStat
          label="Critical gaps"
          value={summary?.totals.critical ?? 0}
          tone="critical"
        />
        <SummaryStat
          label="Needs attention"
          value={summary?.totals.attention ?? 0}
          tone="attention"
        />
        <SummaryStat label="Minor" value={summary?.totals.minor ?? 0} tone="minor" />
      </div>

      {/* Requirement scope (Prompt 33): dormant reqs never touch the score. */}
      <div className="grid gap-3 md:grid-cols-4">
        <ScopeStat label="In scope" value={summary?.inScopeCount ?? 0} />
        <ScopeStat label="Dormant" value={summary?.dormantCount ?? 0} muted />
        <ScopeStat label="Auto-satisfied" value={summary?.autoSatisfiedCount ?? 0} tone="ok" />
        <ScopeStat label="Need evidence" value={summary?.needsEvidenceCount ?? 0} tone="warn" />
      </div>

      {/* By-area breakdown */}
      {summary && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Findings by area</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Filter:</span>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="h-8 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="critical">Critical only</SelectItem>
                  <SelectItem value="attention">Needs attention</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            {(Object.keys(AREA_LABEL) as FindingArea[]).map((a) => (
              <div
                key={a}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">{AREA_LABEL[a]}</span>
                <span className="font-semibold">{summary.byArea[a] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Findings list */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">
            Findings {summary ? `· ${findings.length} shown` : ""}
          </h3>
          {summary && (
            <span className="text-[11px] text-muted-foreground">
              Last run {new Date(summary.generatedAt).toLocaleString()} · refreshes every 60s
            </span>
          )}
        </div>
        {auditQ.isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running internal audit…
          </div>
        ) : findings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <span>No findings in this scope. Nice work.</span>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {findings.map((f) => (
              <FindingRow key={f.id} f={f} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  // Visible-but-locked when the tier doesn't include Internal Audit.
  // Baseline (manual record pulls, manual billing) still works regardless.
  if (!auditEntitled) {
    return (
      <AddonLock
        addon="internal_audit"
        featureName="Internal Audit"
        benefit="Continuously audit your own HIVE data against your confirmed requirements and catch gaps before a state audit does. Includes whole-company and targeted runs, severity-ranked findings with source citations, and exportable QA reports."
      >
        {body}
      </AddonLock>
    );
  }
  return body;
}

function ReadinessCard({ score, loading }: { score?: number; loading: boolean }) {
  const s = score ?? 0;
  const tone =
    s >= 90
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : s >= 70
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-red-700 bg-red-50 border-red-200";
  return (
    <div className={`rounded-2xl border p-4 shadow-[var(--shadow-card)] ${tone}`}>
      <div className="text-xs font-medium uppercase tracking-wider opacity-80">
        Audit Readiness
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold">{loading ? "…" : s}</span>
        <span className="text-sm opacity-80">/ 100</span>
      </div>
      <p className="mt-1 text-[11px] opacity-80">
        Weighted: critical −8, attention −3, minor −1. Indicative, not a compliance guarantee.
      </p>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Severity;
}) {
  const b = SEVERITY_BADGE[tone];
  const Icon = b.Icon;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </div>
  );
}

function FindingRow({ f }: { f: AuditFinding }) {
  const b = SEVERITY_BADGE[f.severity];
  const Icon = b.Icon;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}
          >
            <Icon className="h-3 w-3" /> {b.label}
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
            {AREA_LABEL[f.area]}
          </span>
          {f.subjectName && (
            <span className="text-[11px] text-muted-foreground">· {f.subjectName}</span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium text-foreground">{f.title}</p>
        <p className="text-sm text-muted-foreground">{f.detail}</p>
        {f.sourceCitation && (
          <p className="mt-1 text-[11px] italic text-[#9a3412]">per {f.sourceCitation}</p>
        )}
      </div>
      {f.fixHref && (
        <div className="shrink-0">
          <Button asChild variant="outline" size="sm">
            <a href={f.fixHref}>
              {f.fixLabel ?? "Open"} <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      )}
    </li>
  );
}
