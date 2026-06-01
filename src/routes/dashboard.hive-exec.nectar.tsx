import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Hexagon,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  Filter,
  Wrench,
  Layers,
  Check,
  X,
  Pencil,
  PlayCircle,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import { listCompanies } from "@/lib/hive-exec.functions";

export const Route = createFileRoute("/dashboard/hive-exec/nectar")({
  component: HiveNectarPage,
});

type Severity = "low" | "medium" | "high" | "critical";
type Status = "new" | "in_progress" | "resolved";
type Category = "structural_gap" | "parsing_failure" | "expansion_need" | "mapping_gap";
type ResolutionType = "operational" | "architectural";
type ResolutionState =
  | "drafted" // NECTAR has proposed
  | "approved" // exec approved; operational ready to apply, architectural queued for impl
  | "rejected"
  | "applied" // operational fix executed
  | "queued_for_impl" // architectural approved → routed to deliberate implementation
  | "verified"; // post-apply verification confirmed gap closed
type Risk = "low" | "medium" | "high";

type AuditEntry = {
  ts: string;
  actor: string; // "NECTAR" | exec name
  action: string;
  note?: string;
};

type Resolution = {
  type: ResolutionType;
  summary: string; // plain-language fix
  changeKind: string; // e.g. "OCR pipeline fallback", "DB schema: composite rates"
  blastRadius: string; // which surfaces/companies
  affectedCompanies: number;
  risk: Risk;
  state: ResolutionState;
  verification?: string; // post-apply NECTAR verification result
};

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
  detectedAt: string;
  resolution: Resolution;
  audit: AuditEntry[];
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

const RISK_STYLE: Record<Risk, string> = {
  low: "bg-emerald-50 text-emerald-800 border-emerald-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  high: "bg-red-100 text-red-800 border-red-300",
};

const RES_STATE_STYLE: Record<ResolutionState, string> = {
  drafted: "bg-[#fff7ed] text-[#9a3412] border-[#fed7aa]",
  approved: "bg-blue-50 text-blue-800 border-blue-200",
  rejected: "bg-slate-100 text-slate-700 border-slate-200",
  applied: "bg-emerald-50 text-emerald-800 border-emerald-200",
  queued_for_impl: "bg-indigo-50 text-indigo-800 border-indigo-200",
  verified: "bg-emerald-100 text-emerald-900 border-emerald-300",
};

const RES_STATE_LABEL: Record<ResolutionState, string> = {
  drafted: "NECTAR draft",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
  queued_for_impl: "Queued for implementation",
  verified: "Verified — gap closed",
};

type SeedTemplate = Omit<
  Observation,
  "id" | "triggeringOrgId" | "triggeringOrgName" | "detectedAt" | "affectedOrgs" | "audit"
>;

const SEED_TEMPLATES: SeedTemplate[] = [
  {
    title: "New IDD service code type not representable in code catalog",
    detail:
      "State requirement update introduces an IDD respite variant with hourly + unit dual-billing rules. Current authorized_codes schema only supports a single rate model per code — needs platform schema change to express composite rules.",
    category: "structural_gap",
    severity: "high",
    status: "new",
    resolution: {
      type: "architectural",
      summary:
        "Extend authorized_codes to support a composite rate model (hourly + unit) per code, with billing engine picking the right path per claim.",
      changeKind: "DB schema + billing engine: composite rate per code",
      blastRadius: "Requirements engine, billing engine, code catalog — affects all companies",
      affectedCompanies: 0,
      risk: "high",
      state: "drafted",
    },
  },
  {
    title: "Addendum PDFs with embedded image-only tables fail OCR pass",
    detail:
      "Recurring parsing failure: scanned addenda using image tables produce zero extracted requirements. Recommend platform-level OCR fallback (image-table reconstruction) before requirements engine ingestion.",
    category: "parsing_failure",
    severity: "medium",
    status: "in_progress",
    resolution: {
      type: "operational",
      summary:
        "Add an image-table OCR fallback (Tesseract + table-line detector) ahead of the requirements extractor; re-run previously-failed addenda.",
      changeKind: "Ingestion pipeline: OCR fallback stage",
      blastRadius: "Document ingestion only — no schema or mapping changes",
      affectedCompanies: 0,
      risk: "low",
      state: "drafted",
    },
  },
  {
    title: "Updated state requirement: 14-day staff training attestation cadence",
    detail:
      "State published a cadence change (annual → 14-day rolling) that the current requirements model expresses only as annual. Needs platform support for rolling-window recurrence patterns.",
    category: "expansion_need",
    severity: "high",
    status: "new",
    resolution: {
      type: "architectural",
      summary:
        "Add rolling-window recurrence type to the requirements model (windowDays, windowAnchor); update scheduler + attestation evaluator.",
      changeKind: "Requirements engine model: recurrence patterns",
      blastRadius: "Requirements engine, scheduler, attestation evaluator — all companies",
      affectedCompanies: 0,
      risk: "high",
      state: "drafted",
    },
  },
  {
    title: "Requirements with cross-code applicability cannot be mapped",
    detail:
      "Several state requirements apply jointly across two or more service codes (single attestation covers both). Current mapping model is one-requirement-to-one-code; needs many-to-many extension.",
    category: "mapping_gap",
    severity: "medium",
    status: "new",
    resolution: {
      type: "architectural",
      summary:
        "Introduce requirement_code_map join table; update applicability engine to evaluate over the many-to-many relation.",
      changeKind: "Mapping model: 1:N → N:M",
      blastRadius: "Requirements engine, applicability evaluator — all companies",
      affectedCompanies: 0,
      risk: "high",
      state: "drafted",
    },
  },
  {
    title: "Contract addendum implies new authorized-code source: 'pilot waiver'",
    detail:
      "Detected an addendum pattern naming a pilot waiver authorization that doesn't match any existing source type (contract / SOW / amendment / addendum). Recommend adding 'waiver' as a first-class source so coverage is auditable.",
    category: "expansion_need",
    severity: "low",
    status: "resolved",
    resolution: {
      type: "architectural",
      summary: "Add 'waiver' to authorized_code_source enum and surface it in the coverage UI.",
      changeKind: "Enum extension + UI label",
      blastRadius: "Coverage panel — all companies (low impact)",
      affectedCompanies: 0,
      risk: "low",
      state: "verified",
      verification: "Enum live; waiver-sourced codes now display under coverage. Verified against triggering company.",
    },
  },
  {
    title: "Tokenizer truncates long policy documents at ~80 pages",
    detail:
      "Platform parsing pipeline truncates company policy docs beyond ~80 pages, causing late-section requirements to be silently dropped. Needs chunking strategy update.",
    category: "parsing_failure",
    severity: "critical",
    status: "in_progress",
    resolution: {
      type: "operational",
      summary:
        "Switch ingestion to semantic chunking (8k-token chunks with 256-token overlap); re-ingest any policy doc exceeding the prior limit.",
      changeKind: "Ingestion pipeline: chunking strategy",
      blastRadius: "Document ingestion only — no schema changes",
      affectedCompanies: 0,
      risk: "medium",
      state: "drafted",
    },
  },
];

function seedObservations(companies: Array<{ id: string; name: string }>): Observation[] {
  const fallback = { id: null as string | null, name: "Platform-wide pattern" };
  return SEED_TEMPLATES.map((t, i) => {
    const org = companies.length ? companies[i % companies.length] : fallback;
    const affected = 1 + (i % Math.max(1, companies.length || 4));
    return {
      ...t,
      id: `obs-${i}`,
      triggeringOrgId: org.id,
      triggeringOrgName: org.name,
      affectedOrgs: affected,
      detectedAt: new Date(Date.now() - i * 86_400_000 * 2).toISOString(),
      resolution: { ...t.resolution, affectedCompanies: affected },
      audit: [
        {
          ts: new Date(Date.now() - i * 86_400_000 * 2).toISOString(),
          actor: "NECTAR",
          action: "Drafted proposed resolution",
        },
      ],
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

  const [items, setItems] = useState<Observation[] | null>(null);
  const observations = items ?? seeded;

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

  function mutate(id: string, fn: (o: Observation) => Observation) {
    setItems((prev) => (prev ?? seeded).map((o) => (o.id === id ? fn(o) : o)));
  }

  function logEntry(actor: string, action: string, note?: string): AuditEntry {
    return { ts: new Date().toISOString(), actor, action, note };
  }

  function approve(o: Observation) {
    mutate(o.id, (cur) => {
      const isOp = cur.resolution.type === "operational";
      const nextState: ResolutionState = isOp ? "approved" : "queued_for_impl";
      return {
        ...cur,
        status: "in_progress",
        resolution: { ...cur.resolution, state: nextState },
        audit: [
          ...cur.audit,
          logEntry(
            "HIVE Exec",
            isOp ? "Approved (operational)" : "Approved → queued for implementation (architectural)",
          ),
        ],
      };
    });
  }

  function reject(o: Observation) {
    mutate(o.id, (cur) => ({
      ...cur,
      resolution: { ...cur.resolution, state: "rejected" },
      audit: [...cur.audit, logEntry("HIVE Exec", "Rejected proposal")],
    }));
  }

  function modify(o: Observation, nextSummary: string) {
    mutate(o.id, (cur) => ({
      ...cur,
      resolution: { ...cur.resolution, summary: nextSummary, state: "drafted" },
      audit: [
        ...cur.audit,
        logEntry("HIVE Exec", "Modified proposal", "Edited summary; awaiting re-approval"),
      ],
    }));
  }

  function applyOp(o: Observation) {
    mutate(o.id, (cur) => ({
      ...cur,
      status: "in_progress",
      resolution: { ...cur.resolution, state: "applied" },
      audit: [...cur.audit, logEntry("HIVE Exec", "Applied operational fix; re-running affected documents")],
    }));
  }

  function verify(o: Observation) {
    mutate(o.id, (cur) => ({
      ...cur,
      status: "resolved",
      resolution: {
        ...cur.resolution,
        state: "verified",
        verification:
          cur.category === "parsing_failure"
            ? "Re-parsed previously-failed documents; requirements extracted successfully."
            : "Re-ran affected surfaces; observed signal no longer reproduces.",
      },
      audit: [...cur.audit, logEntry("NECTAR", "Verified gap closed")],
    }));
  }

  return (
    <div className="space-y-4">
      {/* NECTAR header */}
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
                AI-assisted resolution — propose, you confirm
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-[#7c2d12]/80">
                NECTAR drafts a proposed resolution per ticket. Nothing executes without a HIVE
                executive's approval — and engine/schema changes never auto-apply regardless of confidence.
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
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Ticket list */}
      <section className="space-y-3">
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
          <TicketCard
            key={o.id}
            o={o}
            onApprove={() => approve(o)}
            onReject={() => reject(o)}
            onModify={(s) => modify(o, s)}
            onApply={() => applyOp(o)}
            onVerify={() => verify(o)}
          />
        ))}
      </section>
    </div>
  );
}

function TicketCard({
  o,
  onApprove,
  onReject,
  onModify,
  onApply,
  onVerify,
}: {
  o: Observation;
  onApprove: () => void;
  onReject: () => void;
  onModify: (next: string) => void;
  onApply: () => void;
  onVerify: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(o.resolution.summary);
  const isArch = o.resolution.type === "architectural";
  const state = o.resolution.state;

  // Architectural changes get a visually weightier card
  const cardClass = isArch
    ? "rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/40 to-white p-4 shadow-sm transition-colors hover:border-indigo-300"
    : "rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-[#fed7aa]";

  return (
    <article className={cardClass}>
      {/* Header chips */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9a3412]">
              <Hexagon className="h-3 w-3" /> NECTAR
            </span>
            <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
              {CATEGORY_LABEL[o.category]}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_STYLE[o.severity]}`}
            >
              <AlertTriangle className="h-3 w-3" /> {o.severity}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[o.status]}`}
            >
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
            <span>
              Affected companies: <span className="font-medium text-foreground">{o.affectedOrgs}</span>
            </span>
            <span>Detected: {new Date(o.detectedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* NECTAR proposed resolution */}
      <div
        className={`mt-3 rounded-lg border p-3 ${
          isArch
            ? "border-indigo-200 bg-indigo-50/60"
            : "border-[#fed7aa] bg-[#fff7ed]/70"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-[#fed7aa] bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9a3412]">
            <Sparkles className="h-3 w-3" /> NECTAR proposal
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
              isArch
                ? "border-indigo-300 bg-white text-indigo-800"
                : "border-emerald-300 bg-white text-emerald-800"
            }`}
          >
            {isArch ? <Layers className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
            {isArch ? "Architectural / schema" : "Operational / pipeline"}
          </span>
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${RISK_STYLE[o.resolution.risk]}`}
          >
            Risk: {o.resolution.risk}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${RES_STATE_STYLE[state]}`}
          >
            {RES_STATE_LABEL[state]}
          </span>
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onModify(draft);
                  setEditing(false);
                }}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-[#0f1b3d] px-3 text-xs font-semibold text-white hover:bg-[#1a2a5a]"
              >
                <Check className="h-3.5 w-3.5" /> Save edits
              </button>
              <button
                onClick={() => {
                  setDraft(o.resolution.summary);
                  setEditing(false);
                }}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-foreground">{o.resolution.summary}</p>
        )}

        <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="inline font-semibold text-foreground">Change kind: </dt>
            <dd className="inline">{o.resolution.changeKind}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-foreground">Blast radius: </dt>
            <dd className="inline">{o.resolution.blastRadius}</dd>
          </div>
        </dl>

        {isArch && state === "drafted" && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>Affects requirements engine — all companies.</strong> Architectural change never
              auto-applies. Approval routes this to deliberate implementation.
            </span>
          </div>
        )}

        {o.resolution.verification && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>NECTAR verification:</strong> {o.resolution.verification}
            </span>
          </div>
        )}

        {/* Action row */}
        {!editing && (
          <div className="mt-3 flex flex-wrap gap-2">
            {state === "drafted" && (
              <>
                <button
                  onClick={onApprove}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" /> Modify
                </button>
                <button
                  onClick={onReject}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  <X className="h-3.5 w-3.5" /> Reject
                </button>
              </>
            )}
            {state === "approved" && !isArch && (
              <button
                onClick={onApply}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-md bg-[#0f1b3d] px-3 text-xs font-semibold text-white hover:bg-[#1a2a5a]"
              >
                <PlayCircle className="h-3.5 w-3.5" /> Apply fix &amp; re-run affected documents
              </button>
            )}
            {state === "applied" && (
              <button
                onClick={onVerify}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Run NECTAR verification
              </button>
            )}
            {state === "queued_for_impl" && (
              <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-800">
                <ClipboardList className="h-3.5 w-3.5" />
                Routed to deliberate implementation track — draft plan attached
              </span>
            )}
            {state === "rejected" && (
              <button
                onClick={onApprove}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
              >
                Reconsider
              </button>
            )}
          </div>
        )}
      </div>

      {/* Audit trail */}
      <details className="mt-3 rounded-md border border-border bg-muted/20 p-2 text-xs">
        <summary className="cursor-pointer font-medium text-foreground">
          Audit trail ({o.audit.length})
        </summary>
        <ul className="mt-2 space-y-1">
          {o.audit.map((a, i) => (
            <li key={i} className="flex flex-wrap gap-x-2 text-muted-foreground">
              <span className="font-mono text-[10px]">{new Date(a.ts).toLocaleString()}</span>
              <span className="font-semibold text-foreground">{a.actor}</span>
              <span>— {a.action}</span>
              {a.note && <span className="text-muted-foreground/80">({a.note})</span>}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
