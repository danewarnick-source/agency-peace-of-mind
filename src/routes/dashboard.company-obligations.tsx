import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search,
  Plus,
  Upload,
  ClipboardList,
  CheckCircle2,
  Building2,
  FolderOpen,
  Layers,
  FileWarning,
  X,
} from "lucide-react";
import {
  listCompanyObligations,
  getOrgServiceFootprint,
  type ObligationListItem,
} from "@/lib/company-obligations.functions";
import { getAuditEvidenceSnapshot } from "@/lib/audit-evidence.functions";
import { EMPTY_AUDIT_EVIDENCE, type AuditEvidenceSnapshot } from "@/lib/audit-evidence";
import { listStaffGroups, type StaffGroupRow } from "@/lib/staff-groups.functions";
import {
  ObligationCard,
  type ObligationWithInstance,
} from "@/components/company-obligations/obligation-card";
import { ObligationDrawer } from "@/components/company-obligations/obligation-drawer";
import { catalogFor } from "@/components/company-obligations/obligation-meta";
import { AuditPartPanel, UnmappedDuties } from "@/components/company-obligations/audit-part-panel";
import { UtahPackPanel } from "@/components/company-obligations/utah-pack-panel";
import { ActionRequiredPanel } from "@/components/company-obligations/action-required-panel";
import { useActionRequiredQueue } from "@/hooks/use-action-required-queue";
import {
  AUDIT_PART_LABEL,
  DSPD_AUDIT_ITEMS,
  footprintIsKnown,
  itemApplies,
  obligationTitleMatches,
  type AuditPart,
} from "@/lib/dspd-audit-tool";
import { UTAH_DSPD_PACK } from "@/lib/utah-dspd-pack";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CompanyObligationsTab = "overview" | "action-required";

type CompanyObligationsSearch = {
  tab?: CompanyObligationsTab;
  new?: boolean;
  obligation?: string;
};

function parseCompanyObligationsSearch(s: Record<string, unknown>): CompanyObligationsSearch {
  const openNew = s.new === "1" || s.new === 1 || s.new === true || s.new === "true";
  const obligation =
    typeof s.obligation === "string" && UUID_RE.test(s.obligation) ? s.obligation : undefined;
  const tabRaw = typeof s.tab === "string" ? s.tab : undefined;
  const tab: CompanyObligationsTab | undefined =
    tabRaw === "action-required" ? "action-required" : tabRaw === "overview" ? "overview" : undefined;
  return {
    ...(tab ? { tab } : {}),
    ...(openNew ? { new: true as const } : {}),
    ...(obligation ? { obligation } : {}),
  };
}

export const Route = createFileRoute("/dashboard/company-obligations")({
  head: () => ({ meta: [{ title: "Compliance register — HIVE" }] }),
  validateSearch: parseCompanyObligationsSearch,
  component: CompanyObligationsPage,
});

function isDueWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false;
  const due = new Date(iso).getTime();
  const now = Date.now();
  return due >= now && due <= now + days * 86_400_000;
}

function StatCard({
  label,
  count,
  tone,
  hint,
}: {
  label: string;
  count: number;
  tone: "red" | "amber" | "green" | "slate";
  hint?: string;
}) {
  const toneClasses = {
    red: "border-destructive/30 bg-destructive/5 text-destructive",
    amber: "border-warning/40 bg-warning/10 text-warning-foreground",
    green: "border-success/30 bg-success/5 text-success",
    slate: "border-border bg-muted/30 text-foreground",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${toneClasses}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="mt-1 text-[11px] font-normal opacity-80">{hint}</p>}
    </div>
  );
}

function livingRegisterTab(o: ObligationListItem): "queue" | AuditPart | "external" | "other" {
  const mapped = DSPD_AUDIT_ITEMS.find((i) =>
    i.obligation_titles.some((t) => obligationTitleMatches(o.title, t)),
  );
  if (mapped) return mapped.part;
  const ch = catalogFor(o)?.fulfillment;
  if (ch === "external" || ch === "hybrid") return "external";
  return "other";
}

function ObligationList({
  orgId,
  items,
  groupNamesById,
  userNamesById,
  publishedFormIds,
  onEdit,
  empty,
  highlightObligationId = null,
}: {
  orgId: string;
  items: ObligationListItem[];
  groupNamesById: Map<string, { name: string; member_count: number }>;
  userNamesById: Map<string, string>;
  publishedFormIds: Set<string>;
  onEdit: (ob: ObligationWithInstance) => void;
  empty: ReactNode;
  highlightObligationId?: string | null;
}) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <div className="grid gap-3">
      {items.map((o) => (
        <ObligationCard
          key={o.id}
          orgId={orgId}
          obligation={o}
          groupNamesById={groupNamesById}
          userNamesById={userNamesById}
          publishedFormIds={publishedFormIds}
          onEdit={onEdit}
          highlighted={o.id === highlightObligationId}
        />
      ))}
    </div>
  );
}

function ObligationsTab({
  orgId,
  openNew,
  focusObligationId,
}: {
  orgId: string;
  openNew?: boolean;
  focusObligationId?: string;
}) {
  const listFn = useServerFn(listCompanyObligations);
  const listGroupsFn = useServerFn(listStaffGroups);
  const footprintFn = useServerFn(getOrgServiceFootprint);
  const evidenceFn = useServerFn(getAuditEvidenceSnapshot);

  const { data: obligations = [], isLoading } = useQuery<ObligationListItem[]>({
    queryKey: ["company-obligations", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
    staleTime: 0,
    refetchInterval: 60_000,
  });

  const { data: groups = [] } = useQuery<Array<StaffGroupRow & { member_count: number }>>({
    queryKey: ["staff-groups", orgId],
    queryFn: () => listGroupsFn({ data: { organizationId: orgId } }),
  });

  const { data: footprint = { codes: [] as string[], hasAbiClients: false } } = useQuery({
    queryKey: ["org-service-footprint", orgId],
    queryFn: () => footprintFn({ data: { organizationId: orgId } }),
  });

  const { data: evidence = EMPTY_AUDIT_EVIDENCE } = useQuery<AuditEvidenceSnapshot>({
    queryKey: ["audit-evidence", orgId],
    queryFn: () => evidenceFn({ data: { organizationId: orgId } }),
    staleTime: 30_000,
  });

  const assignedUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const o of obligations) for (const uid of o.assigned_to_users ?? []) s.add(uid);
    return Array.from(s);
  }, [obligations]);

  const { data: userNamesById = new Map<string, string>() } = useQuery({
    queryKey: ["obligation-assignee-names", orgId, assignedUserIds],
    enabled: assignedUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_directory")
        .select("id, full_name")
        .in("id", assignedUserIds);
      if (error) throw new Error(error.message);
      const m = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
        m.set(r.id, r.full_name ?? "Unknown");
      }
      return m;
    },
  });

  const { data: publishedFormIds = new Set<string>() } = useQuery({
    queryKey: ["published-form-ids", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forms")
        .select("id")
        .eq("organization_id", orgId)
        .eq("status", "published");
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((f: { id: string }) => f.id));
    },
  });

  const groupNamesById = useMemo(() => {
    const m = new Map<string, { name: string; member_count: number }>();
    for (const g of groups) m.set(g.id, { name: g.name, member_count: g.member_count });
    return m;
  }, [groups]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "paused">("active");
  const [scopeFilter, setScopeFilter] = useState<"all" | "org" | "staff" | "staff_per_client">(
    "all",
  );
  const [showNa, setShowNa] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingObligation, setEditingObligation] = useState<ObligationWithInstance | null>(null);
  const [registerTab, setRegisterTab] = useState<string>(focusObligationId ? "queue" : "queue");
  const navigate = useNavigate();

  const focusObligation = useMemo(
    () => (focusObligationId ? obligations.find((o) => o.id === focusObligationId) ?? null : null),
    [obligations, focusObligationId],
  );

  useEffect(() => {
    if (!openNew) return;
    setEditingObligation(null);
    setDrawerOpen(true);
  }, [openNew]);

  useEffect(() => {
    if (!focusObligation) return;
    setSearch("");
    setScopeFilter("all");
    setPersonId(null);
    setFilter(focusObligation.active ? "active" : "all");
    const mapped = DSPD_AUDIT_ITEMS.find((i) =>
      i.obligation_titles.some((t) => obligationTitleMatches(focusObligation.title, t)),
    );
    if (mapped && !itemApplies(mapped, footprint)) setShowNa(true);
    setRegisterTab(livingRegisterTab(focusObligation));
    // footprint is read once the row is known; don't re-pin when the object identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusObligation?.id]);

  useEffect(() => {
    if (!focusObligationId || isLoading) return;
    const id = `obligation-${focusObligationId}`;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusObligationId, isLoading, registerTab, showNa, filter, focusObligation?.id]);

  const stats = useMemo(() => {
    let overdueItems = 0;
    let dueThisWeek = 0;
    let externalOpen = 0;
    let inHiveOpen = 0;
    for (const o of obligations) {
      if (!o.active) continue;
      overdueItems += o.rollup.overdue_count;
      if (o.rollup.pending_count > 0 && isDueWithinDays(o.rollup.next_due_at, 7)) dueThisWeek++;
      const channel = catalogFor(o)?.fulfillment;
      if ((channel === "external" || channel === "hybrid") && o.rollup.open_count > 0)
        externalOpen++;
      if ((channel === "in_hive" || !channel) && o.rollup.open_count > 0) inHiveOpen++;
    }
    return { overdueItems, dueThisWeek, externalOpen, inHiveOpen };
  }, [obligations]);

  const workQueue = useMemo(() => {
    const q = search.trim().toLowerCase();
    return obligations
      .filter((o) => {
        if (!o.active) return false;
        if (scopeFilter !== "all" && o.scope !== scopeFilter) return false;
        if (q) {
          const catalog = catalogFor(o);
          const hit =
            o.title.toLowerCase().includes(q) ||
            (o.source_policy_section ?? "").toLowerCase().includes(q) ||
            (catalog?.citation ?? "").toLowerCase().includes(q);
          if (!hit) return false;
        }
        if (o.rollup.overdue_count > 0) return true;
        if (o.rollup.pending_count > 0 && isDueWithinDays(o.rollup.next_due_at, 14)) return true;
        return false;
      })
      .sort((a, b) => {
        if (a.rollup.overdue_count !== b.rollup.overdue_count) {
          return b.rollup.overdue_count - a.rollup.overdue_count;
        }
        const aDue = a.rollup.next_due_at ? new Date(a.rollup.next_due_at).getTime() : Infinity;
        const bDue = b.rollup.next_due_at ? new Date(b.rollup.next_due_at).getTime() : Infinity;
        return aDue - bDue;
      });
  }, [obligations, search, scopeFilter]);

  const matchesFilters = useCallback(
    (o: ObligationListItem) => {
      if (filter === "active" && !o.active) return false;
      if (filter === "paused" && o.active) return false;
      if (scopeFilter !== "all" && o.scope !== scopeFilter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const catalog = catalogFor(o);
      return (
        o.title.toLowerCase().includes(q) ||
        (o.source_policy_section ?? "").toLowerCase().includes(q) ||
        (catalog?.citation ?? "").toLowerCase().includes(q)
      );
    },
    [filter, scopeFilter, search],
  );

  const register = useMemo(() => obligations.filter(matchesFilters), [obligations, matchesFilters]);

  const applicableAuditCount = useMemo(() => {
    return DSPD_AUDIT_ITEMS.filter((i) => itemApplies(i, footprint)).length;
  }, [footprint]);

  const externalFilings = useMemo(() => {
    return obligations
      .filter((o) => {
        const ch = catalogFor(o)?.fulfillment;
        return ch === "external" || ch === "hybrid";
      })
      .filter(matchesFilters)
      .sort((a, b) => {
        if (a.rollup.overdue_count !== b.rollup.overdue_count)
          return b.rollup.overdue_count - a.rollup.overdue_count;
        const aDue = a.rollup.next_due_at ? new Date(a.rollup.next_due_at).getTime() : Infinity;
        const bDue = b.rollup.next_due_at ? new Date(b.rollup.next_due_at).getTime() : Infinity;
        return aDue - bDue;
      });
  }, [obligations, matchesFilters]);

  const openCreate = () => {
    setEditingObligation(null);
    setDrawerOpen(true);
  };
  const openEdit = (ob: ObligationWithInstance) => {
    setEditingObligation(ob);
    setDrawerOpen(true);
  };

  const listProps = {
    orgId,
    groupNamesById,
    userNamesById,
    publishedFormIds,
    onEdit: openEdit,
    highlightObligationId: focusObligationId ?? null,
  };

  const dismissFocus = () => {
    navigate({
      to: "/dashboard/company-obligations",
      search: openNew ? { new: true } : {},
    });
  };

  return (
    <div className="space-y-6">
      {focusObligationId && (
        <div
          id={`obligation-${focusObligationId}`}
          className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Opened from Deadlines</p>
            <Button type="button" variant="ghost" size="sm" onClick={dismissFocus}>
              <X className="mr-1 h-3.5 w-3.5" />
              Dismiss
            </Button>
          </div>
          {focusObligation ? (
            <ObligationCard
              orgId={orgId}
              obligation={focusObligation}
              groupNamesById={groupNamesById}
              userNamesById={userNamesById}
              publishedFormIds={publishedFormIds}
              onEdit={openEdit}
              highlighted
            />
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Finding that duty…</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              That duty is not in this register (it may have been paused, filtered as N/A, or
              removed).
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Laid out like the DSPD In-depth Review Tool (DHHS91172). Rows for services this program
          does not provide are hidden (N/A). The contractor must still meet the whole contract for
          the services it actually runs.
        </p>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> New company policy
        </Button>
      </div>

      {footprintIsKnown(footprint) ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">This program's services</span>
          {footprint.codes.map((c) => (
            <Badge key={c} variant="secondary">
              {c}
            </Badge>
          ))}
          {footprint.hasAbiClients && <Badge variant="outline">Serves ABI</Badge>}
        </div>
      ) : (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
          HIVE could not tell which service codes this program provides, so every review-tool row is
          shown. Set awarded codes on the Company Profile (or add client authorizations) to hide N/A
          items for services you do not run.
        </p>
      )}

      <div className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <p className="flex items-start gap-2">
          <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
          <span>
            <span className="font-medium text-foreground">Tracked in HIVE</span> — the artifact
            lives here (upload, form, attestation).
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
          <span>
            <span className="font-medium text-foreground">Filed outside HIVE</span> — UPI, OL, DSPD
            forms, USOR. HIVE only stores proof that it was done.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" />
          <span>
            <span className="font-medium text-foreground">HIVE + outside</span> — write or store
            here, then file in a state system.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
          <span>
            <span className="font-medium text-foreground">Standing record</span> — keep current. The
            calendar date is a verification reminder, not the legal due date.
          </span>
        </p>
      </div>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0">
        <div className="min-w-[65%] shrink-0 sm:min-w-0">
          <StatCard
            label="Overdue items"
            count={stats.overdueItems}
            tone={stats.overdueItems === 0 ? "green" : "red"}
            hint="Open instances past due"
          />
        </div>
        <div className="min-w-[65%] shrink-0 sm:min-w-0">
          <StatCard
            label="Due this week"
            count={stats.dueThisWeek}
            tone="amber"
            hint="Duties with an upcoming due date"
          />
        </div>
        <div className="min-w-[65%] shrink-0 sm:min-w-0">
          <StatCard
            label="In HIVE, still open"
            count={stats.inHiveOpen}
            tone="slate"
            hint="Artifacts HIVE can collect"
          />
        </div>
        <div className="min-w-[65%] shrink-0 sm:min-w-0">
          <StatCard
            label="Outside filings open"
            count={stats.externalOpen}
            tone="amber"
            hint="UPI / OL / DSPD / USOR"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading obligations…</p>
      ) : (
        <Tabs value={registerTab} onValueChange={setRegisterTab}>
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="queue">Work queue ({workQueue.length})</TabsTrigger>
            <TabsTrigger value="I">{AUDIT_PART_LABEL.I}</TabsTrigger>
            <TabsTrigger value="II">{AUDIT_PART_LABEL.II}</TabsTrigger>
            <TabsTrigger value="III">{AUDIT_PART_LABEL.III}</TabsTrigger>
            <TabsTrigger value="IV">{AUDIT_PART_LABEL.IV}</TabsTrigger>
            <TabsTrigger value="external">
              Filed outside HIVE ({externalFilings.length})
            </TabsTrigger>
            <TabsTrigger value="other">Other duties</TabsTrigger>
          </TabsList>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              {(["active", "all", "paused"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-md border border-border p-0.5">
              <span className="shrink-0 pl-1.5 text-[11px] font-medium text-muted-foreground">
                Scope
              </span>
              {(
                [
                  ["all", "All"],
                  ["org", "Org"],
                  ["staff", "Per staff"],
                  ["staff_per_client", "Per staff+client"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScopeFilter(key)}
                  className={`shrink-0 rounded px-2.5 py-1 text-xs font-medium ${scopeFilter === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowNa((v) => !v)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${showNa ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"}`}
            >
              {showNa
                ? "Showing N/A items"
                : `Show N/A (${Math.max(0, DSPD_AUDIT_ITEMS.length - applicableAuditCount)} hidden)`}
            </button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or citation…"
                className="h-8 w-56 pl-8 text-sm"
              />
            </div>
          </div>

          <TabsContent value="queue" className="mt-4">
            <ObligationList
              {...listProps}
              items={workQueue}
              empty={
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-success" />
                  <p className="font-medium text-foreground">
                    Nothing overdue or due in the next 14 days
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Open the register to review later deadlines and standing records.
                  </p>
                </div>
              }
            />
          </TabsContent>

          <TabsContent value="I" className="mt-4">
            <AuditPartPanel
              part={"I" as AuditPart}
              footprint={footprint}
              includeNa={showNa}
              obligations={register}
              search={search}
              evidence={evidence}
              {...listProps}
            />
          </TabsContent>
          <TabsContent value="II" className="mt-4">
            <AuditPartPanel
              part={"II" as AuditPart}
              footprint={footprint}
              includeNa={showNa}
              obligations={register}
              search={search}
              evidence={evidence}
              selectedPersonId={personId}
              onSelectPerson={setPersonId}
              {...listProps}
            />
          </TabsContent>
          <TabsContent value="III" className="mt-4">
            <AuditPartPanel
              part={"III" as AuditPart}
              footprint={footprint}
              includeNa={showNa}
              obligations={register}
              search={search}
              evidence={evidence}
              {...listProps}
            />
          </TabsContent>
          <TabsContent value="IV" className="mt-4">
            <AuditPartPanel
              part={"IV" as AuditPart}
              footprint={footprint}
              includeNa={showNa}
              obligations={register}
              search={search}
              evidence={evidence}
              {...listProps}
            />
          </TabsContent>

          <TabsContent value="external" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              These duties cannot be completed inside HIVE. The platform tracks the deadline, the
              owner, and an attestation or upload after the filing is done in UPI, the Office of
              Licensing, a DSPD Google Form, or USOR.
            </p>
            <ObligationList
              {...listProps}
              items={externalFilings}
              empty={
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No outside-HIVE filings match your filters. (Some only appear when the org runs
                  the related service code.)
                </div>
              }
            />
          </TabsContent>

          <TabsContent value="other" className="mt-4">
            <UnmappedDuties obligations={register} {...listProps} />
          </TabsContent>
        </Tabs>
      )}

      <ObligationDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open && openNew) {
            navigate({
              to: "/dashboard/company-obligations",
              search: focusObligationId ? { obligation: focusObligationId } : {},
            });
          }
        }}
        orgId={orgId}
        obligation={editingObligation}
      />
    </div>
  );
}

function PolicyLibraryTab() {
  const navigate = useNavigate();
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <p className="text-sm text-muted-foreground">
          State PDFs live in Authoritative Sources. That shelf is Nectar's reading copy — it does
          not drive this register. Company policies that satisfy a Part I row are uploaded on that
          duty, not in a third library.
        </p>
        <Button onClick={() => navigate({ to: "/dashboard/authoritative-sources" })}>
          <Upload className="mr-1.5 h-4 w-4" /> Authoritative Sources
        </Button>
      </CardContent>
    </Card>
  );
}

function OverviewPanel({
  orgId,
  openNew,
  focusObligationId,
}: {
  orgId: string;
  openNew?: boolean;
  focusObligationId?: string;
}) {
  return (
    <Tabs defaultValue="obligations">
      <TabsList>
        <TabsTrigger value="obligations">Obligations</TabsTrigger>
        <TabsTrigger value="utah-pack">Utah pack</TabsTrigger>
        <TabsTrigger value="policy-library">Authoritative Sources</TabsTrigger>
      </TabsList>
      <TabsContent value="obligations">
        <ObligationsTab
          orgId={orgId}
          openNew={openNew}
          focusObligationId={focusObligationId}
        />
      </TabsContent>
      <TabsContent value="utah-pack">
        <UtahPackPanel />
      </TabsContent>
      <TabsContent value="policy-library">
        <PolicyLibraryTab />
      </TabsContent>
    </Tabs>
  );
}

function CompanyObligationsPage() {
  const navigate = useNavigate({ from: "/dashboard/company-obligations" });
  const { data: org, isLoading } = useCurrentOrg();
  const { tab, new: openNew, obligation: focusObligationId } = Route.useSearch();
  const canAccess =
    org?.role === "admin" || org?.role === "program_manager" || org?.role === "manager";
  const { totalCount: actionCount } = useActionRequiredQueue(
    canAccess ? org?.organization_id : null,
  );
  const activeTab: CompanyObligationsTab = tab === "action-required" ? "action-required" : "overview";

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!org || !canAccess) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You do not have permission to view the compliance register.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-base font-semibold">Compliance register</h2>
          <p className="text-sm text-muted-foreground">
            {UTAH_DSPD_PACK.contract} pack {UTAH_DSPD_PACK.version} — In-depth Review Tool rows for
            the services this program provides.
          </p>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          const next = v === "action-required" ? "action-required" : "overview";
          navigate({
            search: (prev) => ({
              ...prev,
              tab: next === "overview" ? undefined : next,
            }),
          });
        }}
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="action-required" className="gap-1.5">
            {actionCount > 0 ? (
              <>
                Action Required
                <Badge
                  variant="secondary"
                  className="ml-0.5 border-transparent bg-destructive text-destructive-foreground"
                >
                  {actionCount}
                </Badge>
              </>
            ) : (
              <>
                Action Required
                <span
                  aria-label="No urgent items"
                  className="inline-block h-2 w-2 rounded-full bg-success"
                />
              </>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewPanel
            orgId={org.organization_id}
            openNew={openNew}
            focusObligationId={focusObligationId}
          />
        </TabsContent>
        <TabsContent value="action-required" className="mt-4">
          <ActionRequiredPanel orgId={org.organization_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
