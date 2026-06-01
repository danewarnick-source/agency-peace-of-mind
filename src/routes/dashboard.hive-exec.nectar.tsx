import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { listCompanies } from "@/lib/hive-exec.functions";
import {
  listPlatformTickets,
  createPlatformTicket,
  updatePlatformTicket,
} from "@/lib/hive-tickets.functions";

export const Route = createFileRoute("/dashboard/hive-exec/nectar")({
  component: HiveNectarPage,
});

type Severity = "low" | "medium" | "high" | "critical";
type Status = "new" | "in_progress" | "resolved";
type Category =
  | "structural_gap"
  | "parsing_failure"
  | "expansion_need"
  | "mapping_gap"
  | "permission_inconsistency"
  | "other";
type ResolutionType = "operational" | "architectural";
type ResolutionState =
  | "drafted"
  | "approved"
  | "rejected"
  | "applied"
  | "queued_for_impl"
  | "verified";
type Risk = "low" | "medium" | "high";

type AuditEntry = {
  ts: string;
  actor: string;
  action: string;
  note?: string;
};

type Resolution = {
  type?: ResolutionType;
  summary?: string;
  changeKind?: string;
  blastRadius?: string;
  affectedCompanies?: number;
  risk?: Risk;
  state?: ResolutionState;
  verification?: string;
};

type Observation = {
  id: string;
  title: string;
  detail: string;
  category: Category;
  severity: Severity;
  status: Status;
  source: "auto" | "manual";
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
  permission_inconsistency: "Permission inconsistency",
  other: "Other",
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

function rowToObservation(r: Record<string, unknown>): Observation {
  return {
    id: r.id as string,
    title: (r.title as string) ?? "",
    detail: (r.detail as string) ?? "",
    category: ((r.category as string) ?? "other") as Category,
    severity: ((r.severity as string) ?? "medium") as Severity,
    status: ((r.status as string) ?? "new") as Status,
    source: ((r.source as string) ?? "manual") as "auto" | "manual",
    triggeringOrgId: (r.triggering_org_id as string | null) ?? null,
    triggeringOrgName:
      (r.triggering_org_name as string | null) ?? "Platform-wide pattern",
    affectedOrgs: (r.affected_orgs as number) ?? 1,
    detectedAt:
      (r.detected_at as string | null) ??
      (r.created_at as string | null) ??
      new Date().toISOString(),
    resolution: (r.resolution as Resolution) ?? {},
    audit: Array.isArray(r.audit) ? (r.audit as AuditEntry[]) : [],
  };
}

function HiveNectarPage() {
  const qc = useQueryClient();
  const listCompFn = useServerFn(listCompanies);
  const listFn = useServerFn(listPlatformTickets);
  const createFn = useServerFn(createPlatformTicket);
  const updateFn = useServerFn(updatePlatformTicket);

  const companiesQ = useQuery({
    queryKey: ["hive-exec-companies-lite"],
    queryFn: () => listCompFn(),
  });
  const ticketsQ = useQuery({
    queryKey: ["hive-platform-tickets"],
    queryFn: () => listFn(),
  });

  const observations: Observation[] = useMemo(
    () =>
      ((ticketsQ.data?.tickets ?? []) as Array<Record<string, unknown>>).map(
        rowToObservation,
      ),
    [ticketsQ.data],
  );

  const [statusFilter, setStatusFilter] = useState<Status | "all" | "open">(
    "open",
  );
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = observations.filter((o) => {
    if (statusFilter === "open" && o.status === "resolved") return false;
    if (
      statusFilter !== "open" &&
      statusFilter !== "all" &&
      o.status !== statusFilter
    )
      return false;
    if (categoryFilter !== "all" && o.category !== categoryFilter) return false;
    return true;
  });

  const counts = {
    new: observations.filter((o) => o.status === "new").length,
    in_progress: observations.filter((o) => o.status === "in_progress").length,
    resolved: observations.filter((o) => o.status === "resolved").length,
  };

  const update = useMutation({
    mutationFn: (vars: Parameters<typeof updateFn>[0]["data"]) =>
      updateFn({ data: vars }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["hive-platform-tickets"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: (vars: Parameters<typeof createFn>[0]["data"]) =>
      createFn({ data: vars }),
    onSuccess: () => {
      toast.success("Ticket filed in HIVE Executive NECTAR queue.");
      qc.invalidateQueries({ queryKey: ["hive-platform-tickets"] });
      setCreateOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function approve(o: Observation) {
    const isOp = o.resolution.type === "operational";
    const nextState: ResolutionState = isOp ? "approved" : "queued_for_impl";
    update.mutate({
      id: o.id,
      patch: {
        status: "in_progress",
        resolution: { ...o.resolution, state: nextState },
        appendAudit: {
          actor: "HIVE Exec",
          action: isOp
            ? "Approved (operational)"
            : "Approved → queued for implementation (architectural)",
        },
      },
    });
  }
  function reject(o: Observation) {
    update.mutate({
      id: o.id,
      patch: {
        resolution: { ...o.resolution, state: "rejected" as ResolutionState },
        appendAudit: { actor: "HIVE Exec", action: "Rejected proposal" },
      },
    });
  }
  function modify(o: Observation, nextSummary: string) {
    update.mutate({
      id: o.id,
      patch: {
        resolution: {
          ...o.resolution,
          summary: nextSummary,
          state: "drafted" as ResolutionState,
        },
        appendAudit: {
          actor: "HIVE Exec",
          action: "Modified proposal",
          note: "Edited summary; awaiting re-approval",
        },
      },
    });
  }
  function applyOp(o: Observation) {
    update.mutate({
      id: o.id,
      patch: {
        status: "in_progress",
        resolution: { ...o.resolution, state: "applied" as ResolutionState },
        appendAudit: {
          actor: "HIVE Exec",
          action: "Applied operational fix; re-running affected documents",
        },
      },
    });
  }
  function verify(o: Observation) {
    update.mutate({
      id: o.id,
      patch: {
        status: "resolved",
        resolution: {
          ...o.resolution,
          state: "verified" as ResolutionState,
          verification:
            o.category === "parsing_failure"
              ? "Re-parsed previously-failed documents; requirements extracted successfully."
              : "Re-ran affected surfaces; observed signal no longer reproduces.",
        },
        appendAudit: { actor: "NECTAR", action: "Verified gap closed" },
      },
    });
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
                Tickets are filed live: NECTAR auto-creates them from detected
                platform events (parsing failures, missing extractions), and HIVE
                executives can file ones it can't detect yet.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#fed7aa] bg-white/70 px-3 py-1.5 text-xs font-medium text-[#9a3412]">
              <ShieldAlert className="h-3.5 w-3.5" />
              Account &amp; structural metadata only — no client PHI
            </div>
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-[#0f1b3d] px-3 text-xs font-semibold text-white hover:bg-[#1a2a5a]"
            >
              <Plus className="h-3.5 w-3.5" /> File ticket manually
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:max-w-md">
          <div className="rounded-lg border border-[#fed7aa] bg-white/70 p-2">
            <div className="font-display text-lg font-bold text-[#9a3412]">
              {counts.new}
            </div>
            <div className="text-[#9a3412]/80">New</div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-white/70 p-2">
            <div className="font-display text-lg font-bold text-blue-800">
              {counts.in_progress}
            </div>
            <div className="text-blue-800/80">In progress</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-white/70 p-2">
            <div className="font-display text-lg font-bold text-emerald-800">
              {counts.resolved}
            </div>
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
              onChange={(e) =>
                setStatusFilter(e.target.value as Status | "all" | "open")
              }
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
              onChange={(e) =>
                setCategoryFilter(e.target.value as Category | "all")
              }
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
        {ticketsQ.isLoading && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Loading platform observations…
          </div>
        )}
        {!ticketsQ.isLoading && observations.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No platform tickets yet. NECTAR auto-files them when it detects
            platform-level events (parsing failures, missing extractions). You
            can also file one manually with the button above.
          </div>
        )}
        {!ticketsQ.isLoading &&
          observations.length > 0 &&
          filtered.length === 0 && (
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

      {createOpen && (
        <ManualTicketDialog
          companies={(companiesQ.data ?? []).map((c) => ({
            id: c.organization_id,
            name: c.name,
          }))}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(vars) => create.mutate(vars)}
          submitting={create.isPending}
        />
      )}
    </div>
  );
}

function ManualTicketDialog({
  companies,
  onCancel,
  onSubmit,
  submitting,
}: {
  companies: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSubmit: (vars: {
    triggeringOrgId: string | null;
    triggeringOrgName: string;
    title: string;
    detail: string;
    category: Category;
    severity: Severity;
  }) => void;
  submitting: boolean;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [category, setCategory] = useState<Category>("permission_inconsistency");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [orgId, setOrgId] = useState<string>("");

  function submit() {
    if (title.trim().length < 3) {
      toast.error("Give the ticket a title (3+ characters).");
      return;
    }
    const chosen = companies.find((c) => c.id === orgId);
    onSubmit({
      triggeringOrgId: chosen?.id ?? null,
      triggeringOrgName: chosen?.name ?? "Platform-wide pattern",
      title: title.trim(),
      detail: detail.trim(),
      category,
      severity,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-background p-4 shadow-xl">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plus className="h-4 w-4" /> File a HIVE Executive NECTAR ticket
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Use this for issues NECTAR can't auto-detect yet (e.g. permission
          inconsistencies between accounts, UX gaps observed by a human).
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={240}
              placeholder='e.g. "Company Admin permission inconsistency on Authoritative Sources"'
              className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Detail</label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder="What was observed, on which surface, who was affected, reproduction steps if known…"
              className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-foreground">Triggering company</label>
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
              >
                <option value="">Platform-wide pattern</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
              >
                {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
                className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex min-h-[40px] items-center rounded-md border border-border bg-background px-3 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-md bg-[#0f1b3d] px-3 text-xs font-semibold text-white hover:bg-[#1a2a5a] disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" />
            {submitting ? "Filing…" : "File ticket"}
          </button>
        </div>
      </div>
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
  const [draft, setDraft] = useState(o.resolution.summary ?? "");
  const hasProposal = !!o.resolution.type && !!o.resolution.summary;
  const isArch = o.resolution.type === "architectural";
  const state: ResolutionState = (o.resolution.state ?? "drafted") as ResolutionState;

  const cardClass = isArch
    ? "rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/40 to-white p-4 shadow-sm transition-colors hover:border-indigo-300"
    : "rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-[#fed7aa]";

  return (
    <article className={cardClass}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9a3412]">
              <Hexagon className="h-3 w-3" /> {o.source === "auto" ? "NECTAR auto" : "Manual"}
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
          <h3 className="mt-2 font-display text-base font-semibold text-foreground">
            {o.title}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{o.detail}</p>
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
                <span className="font-medium text-foreground">
                  {o.triggeringOrgName}
                </span>
              )}
            </span>
            <span>
              Affected companies:{" "}
              <span className="font-medium text-foreground">{o.affectedOrgs}</span>
            </span>
            <span>Detected: {new Date(o.detectedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {hasProposal ? (
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
            {o.resolution.risk && (
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${RISK_STYLE[o.resolution.risk]}`}
              >
                Risk: {o.resolution.risk}
              </span>
            )}
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
                    setDraft(o.resolution.summary ?? "");
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
            {o.resolution.changeKind && (
              <div>
                <dt className="inline font-semibold text-foreground">Change kind: </dt>
                <dd className="inline">{o.resolution.changeKind}</dd>
              </div>
            )}
            {o.resolution.blastRadius && (
              <div>
                <dt className="inline font-semibold text-foreground">Blast radius: </dt>
                <dd className="inline">{o.resolution.blastRadius}</dd>
              </div>
            )}
          </dl>

          {isArch && state === "drafted" && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Affects requirements engine — all companies.</strong>{" "}
                Architectural change never auto-applies. Approval routes this to
                deliberate implementation.
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
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <span>No NECTAR proposal yet — file your own resolution path or mark in progress.</span>
          {o.status !== "resolved" && (
            <button
              onClick={onApprove}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
            >
              Mark in progress
            </button>
          )}
        </div>
      )}

      <details className="mt-3 rounded-md border border-border bg-muted/20 p-2 text-xs">
        <summary className="cursor-pointer font-medium text-foreground">
          Audit trail ({o.audit.length})
        </summary>
        <ul className="mt-2 space-y-1">
          {o.audit.map((a, i) => (
            <li key={i} className="flex flex-wrap gap-x-2 text-muted-foreground">
              <span className="font-mono text-[10px]">
                {new Date(a.ts).toLocaleString()}
              </span>
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
