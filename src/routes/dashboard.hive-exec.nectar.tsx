import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Hexagon, Sparkles, AlertTriangle, ShieldAlert, Filter } from "lucide-react";
import { listCompanies } from "@/lib/hive-exec.functions";

export const Route = createFileRoute("/dashboard/hive-exec/nectar")({
  component: HiveNectarPage,
});

type Severity = "low" | "medium" | "high" | "critical";
type Status = "new" | "in_progress" | "resolved";
type Category = "structural_gap" | "parsing_failure" | "expansion_need" | "mapping_gap";

type Observation = {
  id: string;
  title: string;
  detail: string;
  category: Category;
  severity: Severity;
  status: Status;
  triggeringOrgId: string | null;
  triggeringOrgName: string;
  affectedOrgs: number;
  detectedAt: string; // ISO
};

const CATEGORY_LABEL: Record<Category, string> = {
  structural_gap: "Structural gap",
  parsing_failure: "Parsing failure",
  expansion_need: "Expansion need",
  mapping_gap: "Mapping gap",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  critical: "bg-red-100 text-red-800 border-red-300",
};

const STATUS_STYLE: Record<Status, string> = {
  new: "bg-[#fff7ed] text-[#9a3412] border-[#fed7aa]",
  in_progress: "bg-blue-50 text-blue-800 border-blue-200",
  resolved: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

// Deterministic seed: NECTAR's platform-wide observations. Seeded from real
// companies the executive can see, but kept account/structural — no PHI.
const SEED_TEMPLATES: Array<Omit<Observation, "id" | "triggeringOrgId" | "triggeringOrgName" | "detectedAt" | "affectedOrgs">> = [
  {
    title: "New IDD service code type not representable in code catalog",
    detail:
      "State requirement update introduces an IDD respite variant with hourly + unit dual-billing rules. Current authorized_codes schema only supports a single rate model per code — needs platform schema change to express composite rules.",
    category: "structural_gap",
    severity: "high",
    status: "new",
  },
  {
    title: "Addendum PDFs with embedded image-only tables fail OCR pass",
    detail:
      "Recurring parsing failure: scanned addenda using image tables produce zero extracted requirements. Recommend platform-level OCR fallback (image-table reconstruction) before requirements engine ingestion.",
    category: "parsing_failure",
    severity: "medium",
    status: "in_progress",
  },
  {
    title: "Updated state requirement: 14-day staff training attestation cadence",
    detail:
      "State published a cadence change (annual → 14-day rolling) that the current requirements model expresses only as annual. Needs platform support for rolling-window recurrence patterns.",
    category: "expansion_need",
    severity: "high",
    status: "new",
  },
  {
    title: "Requirements with cross-code applicability cannot be mapped",
    detail:
      "Several state requirements apply jointly across two or more service codes (single attestation covers both). Current mapping model is one-requirement-to-one-code; needs many-to-many extension.",
    category: "mapping_gap",
    severity: "medium",
    status: "new",
  },
  {
    title: "Contract addendum implies new authorized-code source: 'pilot waiver'",
    detail:
      "Detected an addendum pattern naming a pilot waiver authorization that doesn't match any existing source type (contract / SOW / amendment / addendum). Recommend adding 'waiver' as a first-class source so coverage is auditable.",
    category: "expansion_need",
    severity: "low",
    status: "resolved",
  },
  {
    title: "Tokenizer truncates long policy documents at ~80 pages",
    detail:
      "Platform parsing pipeline truncates company policy docs beyond ~80 pages, causing late-section requirements to be silently dropped. Needs chunking strategy update.",
    category: "parsing_failure",
    severity: "critical",
    status: "in_progress",
  },
];

function seedObservations(companies: Array<{ id: string; name: string }>): Observation[] {
  if (companies.length === 0) {
    return SEED_TEMPLATES.map((t, i) => ({
      ...t,
      id: `obs-${i}`,
      triggeringOrgId: null,
      triggeringOrgName: "Platform-wide pattern",
      affectedOrgs: 1 + (i % 4),
      detectedAt: new Date(Date.now() - i * 86_400_000 * 2).toISOString(),
    }));
  }
  return SEED_TEMPLATES.map((t, i) => {
    const org = companies[i % companies.length];
    return {
      ...t,
      id: `obs-${i}`,
      triggeringOrgId: org.id,
      triggeringOrgName: org.name,
      affectedOrgs: 1 + (i % Math.max(1, companies.length)),
      detectedAt: new Date(Date.now() - i * 86_400_000 * 2).toISOString(),
    };
  });
}

function HiveNectarPage() {
  const listFn = useServerFn(listCompanies);
  const companiesQ = useQuery({ queryKey: ["hive-exec-companies-lite"], queryFn: () => listFn() });

  const seeded = useMemo(
    () => seedObservations((companiesQ.data ?? []).map((c) => ({ id: c.organization_id, name: c.name }))),
    [companiesQ.data],
  );

  const [items, setItems] = useState<Observation[]>([]);
  const observations = items.length ? items : seeded;

  const [statusFilter, setStatusFilter] = useState<Status | "all" | "open">("open");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");

  const filtered = observations.filter((o) => {
    if (statusFilter === "open" && o.status === "resolved") return false;
    if (statusFilter !== "open" && statusFilter !== "all" && o.status !== statusFilter) return false;
    if (categoryFilter !== "all" && o.category !== categoryFilter) return false;
    return true;
  });

  const counts = {
    new: observations.filter((o) => o.status === "new").length,
    in_progress: observations.filter((o) => o.status === "in_progress").length,
    resolved: observations.filter((o) => o.status === "resolved").length,
  };

  function setStatus(id: string, status: Status) {
    setItems((prev) => {
      const base = prev.length ? prev : seeded;
      return base.map((o) => (o.id === id ? { ...o, status } : o));
    });
  }

  return (
    <div className="space-y-4">
      {/* NECTAR header — amber/hexagon treatment, platform-scoped */}
      <section className="rounded-xl border border-[#fed7aa] bg-gradient-to-r from-[#fff7ed] to-[#ffedd5] p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#d97a1c] text-white">
              <Hexagon className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9a3412]">
                <Sparkles className="h-3.5 w-3.5" /> NECTAR · Platform observations
              </div>
              <h2 className="font-display text-lg font-semibold text-[#7c2d12]">
                Structural &amp; expansion signals across all companies
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-[#7c2d12]/80">
                When NECTAR finds that the platform can't represent a new state requirement, a parsing
                pipeline keeps failing, or a contract pattern implies a schema change — it escalates here
                instead of silently failing on the company side.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#fed7aa] bg-white/70 px-3 py-1.5 text-xs font-medium text-[#9a3412]">
            <ShieldAlert className="h-3.5 w-3.5" />
            Account &amp; structural metadata only — no client PHI
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:max-w-md">
          <div className="rounded-lg border border-[#fed7aa] bg-white/70 p-2">
            <div className="font-display text-lg font-bold text-[#9a3412]">{counts.new}</div>
            <div className="text-[#9a3412]/80">New</div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-white/70 p-2">
            <div className="font-display text-lg font-bold text-blue-800">{counts.in_progress}</div>
            <div className="text-blue-800/80">In progress</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-white/70 p-2">
            <div className="font-display text-lg font-bold text-emerald-800">{counts.resolved}</div>
            <div className="text-emerald-800/80">Resolved</div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="h-4 w-4 text-muted-foreground" /> Queue
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Status | "all" | "open")}
              className="min-h-[44px] rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="open">Open (new + in progress)</option>
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as Category | "all")}
              className="min-h-[44px] rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="all">All categories</option>
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Ticket list */}
      <section className="space-y-2">
        {companiesQ.isLoading && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Loading platform observations…
          </div>
        )}
        {!companiesQ.isLoading && filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No observations match the current filter.
          </div>
        )}
        {filtered.map((o) => (
          <article
            key={o.id}
            className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-[#fed7aa]"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9a3412]">
                    <Hexagon className="h-3 w-3" /> NECTAR
                  </span>
                  <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
                    {CATEGORY_LABEL[o.category]}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_STYLE[o.severity]}`}>
                    <AlertTriangle className="h-3 w-3" /> {o.severity}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[o.status]}`}>
                    {o.status.replace("_", " ")}
                  </span>
                </div>
                <h3 className="mt-2 font-display text-base font-semibold text-foreground">{o.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{o.detail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Triggering company:{" "}
                    {o.triggeringOrgId ? (
                      <Link
                        to="/dashboard/hive-exec/$orgId"
                        params={{ orgId: o.triggeringOrgId }}
                        className="text-[#0f1b3d] hover:underline"
                      >
                        {o.triggeringOrgName}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{o.triggeringOrgName}</span>
                    )}
                  </span>
                  <span>Affected companies: <span className="font-medium text-foreground">{o.affectedOrgs}</span></span>
                  <span>Detected: {new Date(o.detectedAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-end">
                <select
                  value={o.status}
                  onChange={(e) => setStatus(o.id, e.target.value as Status)}
                  className="min-h-[44px] rounded-md border border-border bg-background px-2 text-sm"
                  aria-label="Update status"
                >
                  <option value="new">New</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
