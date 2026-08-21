import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Plus, Upload, ClipboardList, CheckCircle2, Building2, FolderOpen, Layers, FileWarning } from "lucide-react";
import { listCompanyObligations, type ObligationListItem } from "@/lib/company-obligations.functions";
import { listStaffGroups, type StaffGroupRow } from "@/lib/staff-groups.functions";
import { ObligationCard, type ObligationWithInstance } from "@/components/company-obligations/obligation-card";
import { ObligationDrawer } from "@/components/company-obligations/obligation-drawer";
import { catalogFor } from "@/components/company-obligations/obligation-meta";
import {
  CATEGORY_LABEL,
  type ObligationCategory,
} from "@/lib/sow-obligation-catalog";

export const Route = createFileRoute("/dashboard/company-obligations")({
  head: () => ({ meta: [{ title: "Compliance register — HIVE" }] }),
  component: CompanyObligationsPage,
});

function isDueWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false;
  const due = new Date(iso).getTime();
  const now = Date.now();
  return due >= now && due <= now + days * 86_400_000;
}

const CATEGORY_ORDER: ObligationCategory[] = [
  "training",
  "screening",
  "client_docs",
  "reporting",
  "safety",
  "licensing",
  "employment",
  "standing_records",
];

function StatCard({ label, count, tone, hint }: { label: string; count: number; tone: "red" | "amber" | "green" | "slate"; hint?: string }) {
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

function ObligationList({
  orgId,
  items,
  groupNamesById,
  userNamesById,
  publishedFormIds,
  onEdit,
  empty,
}: {
  orgId: string;
  items: ObligationListItem[];
  groupNamesById: Map<string, { name: string; member_count: number }>;
  userNamesById: Map<string, string>;
  publishedFormIds: Set<string>;
  onEdit: (ob: ObligationWithInstance) => void;
  empty: ReactNode;
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
        />
      ))}
    </div>
  );
}

function ObligationsTab({ orgId }: { orgId: string }) {
  const listFn = useServerFn(listCompanyObligations);
  const listGroupsFn = useServerFn(listStaffGroups);

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
  const [scopeFilter, setScopeFilter] = useState<"all" | "org" | "staff" | "staff_per_client">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingObligation, setEditingObligation] = useState<ObligationWithInstance | null>(null);

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
      if ((channel === "external" || channel === "hybrid") && o.rollup.open_count > 0) externalOpen++;
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
            o.title.toLowerCase().includes(q)
            || (o.source_policy_section ?? "").toLowerCase().includes(q)
            || (catalog?.citation ?? "").toLowerCase().includes(q);
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

  const matchesFilters = (o: ObligationListItem) => {
    if (filter === "active" && !o.active) return false;
    if (filter === "paused" && o.active) return false;
    if (scopeFilter !== "all" && o.scope !== scopeFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const catalog = catalogFor(o);
    return (
      o.title.toLowerCase().includes(q)
      || (o.source_policy_section ?? "").toLowerCase().includes(q)
      || (catalog?.citation ?? "").toLowerCase().includes(q)
      || (catalog?.category ? CATEGORY_LABEL[catalog.category].toLowerCase().includes(q) : false)
    );
  };

  const register = useMemo(() => obligations.filter(matchesFilters), [obligations, filter, scopeFilter, search]);

  const groupedRegister = useMemo(() => {
    const groups = new Map<string, ObligationListItem[]>();
    for (const o of register) {
      const cat = catalogFor(o)?.category ?? "uncategorized";
      const list = groups.get(cat) ?? [];
      list.push(o);
      groups.set(cat, list);
    }
    const ordered: Array<{ key: string; label: string; items: ObligationListItem[] }> = [];
    for (const cat of CATEGORY_ORDER) {
      const items = groups.get(cat);
      if (items?.length) ordered.push({ key: cat, label: CATEGORY_LABEL[cat], items });
    }
    const extra = groups.get("uncategorized");
    if (extra?.length) ordered.push({ key: "uncategorized", label: "Provider-defined", items: extra });
    return ordered;
  }, [register]);

  const externalFilings = useMemo(() => {
    return obligations
      .filter((o) => {
        const ch = catalogFor(o)?.fulfillment;
        return ch === "external" || ch === "hybrid";
      })
      .filter(matchesFilters)
      .sort((a, b) => {
        if (a.rollup.overdue_count !== b.rollup.overdue_count) return b.rollup.overdue_count - a.rollup.overdue_count;
        const aDue = a.rollup.next_due_at ? new Date(a.rollup.next_due_at).getTime() : Infinity;
        const bDue = b.rollup.next_due_at ? new Date(b.rollup.next_due_at).getTime() : Infinity;
        return aDue - bDue;
      });
  }, [obligations, filter, scopeFilter, search]);

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
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          This is a compliance register, not a to-do dump. Each SOW duty says where the work happens
          (in HIVE vs a state portal), the real due-date rule, and who it applies to.
          Duties for service codes this organization does not run are hidden.
        </p>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> New provider obligation
        </Button>
      </div>

      <div className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <p className="flex items-start gap-2">
          <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
          <span><span className="font-medium text-foreground">Tracked in HIVE</span> — the artifact lives here (upload, form, attestation).</span>
        </p>
        <p className="flex items-start gap-2">
          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
          <span><span className="font-medium text-foreground">Filed outside HIVE</span> — UPI, OL, DSPD forms, USOR. HIVE only stores proof that it was done.</span>
        </p>
        <p className="flex items-start gap-2">
          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" />
          <span><span className="font-medium text-foreground">HIVE + outside</span> — write or store here, then file in a state system.</span>
        </p>
        <p className="flex items-start gap-2">
          <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
          <span><span className="font-medium text-foreground">Standing record</span> — keep current. The calendar date is a verification reminder, not the legal due date.</span>
        </p>
      </div>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0">
        <div className="min-w-[65%] shrink-0 sm:min-w-0">
          <StatCard label="Overdue items" count={stats.overdueItems} tone={stats.overdueItems === 0 ? "green" : "red"} hint="Open instances past due" />
        </div>
        <div className="min-w-[65%] shrink-0 sm:min-w-0">
          <StatCard label="Due this week" count={stats.dueThisWeek} tone="amber" hint="Duties with an upcoming due date" />
        </div>
        <div className="min-w-[65%] shrink-0 sm:min-w-0">
          <StatCard label="In HIVE, still open" count={stats.inHiveOpen} tone="slate" hint="Artifacts HIVE can collect" />
        </div>
        <div className="min-w-[65%] shrink-0 sm:min-w-0">
          <StatCard label="Outside filings open" count={stats.externalOpen} tone="amber" hint="UPI / OL / DSPD / USOR" />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading obligations…</p>
      ) : (
        <Tabs defaultValue="queue">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="queue">Work queue ({workQueue.length})</TabsTrigger>
            <TabsTrigger value="register">Register ({register.length})</TabsTrigger>
            <TabsTrigger value="external">Filed outside HIVE ({externalFilings.length})</TabsTrigger>
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
              <span className="shrink-0 pl-1.5 text-[11px] font-medium text-muted-foreground">Scope</span>
              {([
                ["all", "All"],
                ["org", "Org"],
                ["staff", "Per staff"],
                ["staff_per_client", "Per staff+client"],
              ] as const).map(([key, label]) => (
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
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or SOW citation…"
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
                  <p className="font-medium text-foreground">Nothing overdue or due in the next 14 days</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Open the register to review later deadlines and standing records.
                  </p>
                </div>
              }
            />
          </TabsContent>

          <TabsContent value="register" className="mt-4 space-y-8">
            {groupedRegister.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No obligations match your filters.
              </div>
            ) : (
              groupedRegister.map((group) => (
                <section key={group.key} className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {group.label}
                    <span className="ml-2 font-normal">({group.items.length})</span>
                  </h3>
                  <ObligationList
                    {...listProps}
                    items={group.items}
                    empty={null}
                  />
                </section>
              ))
            )}
          </TabsContent>

          <TabsContent value="external" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              These duties cannot be completed inside HIVE. The platform tracks the deadline,
              the owner, and an attestation or upload after the filing is done in UPI, the
              Office of Licensing, a DSPD Google Form, or USOR.
            </p>
            <ObligationList
              {...listProps}
              items={externalFilings}
              empty={
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No outside-HIVE filings match your filters. (Some only appear when the org
                  runs the related service code.)
                </div>
              }
            />
          </TabsContent>
        </Tabs>
      )}

      <ObligationDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
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
          Upload your company's policies and procedures so NECTAR can index them and you can
          reference specific sections when defining provider obligations.
        </p>
        <Button onClick={() => navigate({ to: "/dashboard/authoritative-sources" })}>
          <Upload className="mr-1.5 h-4 w-4" /> Upload document
        </Button>
      </CardContent>
    </Card>
  );
}

function CompanyObligationsPage() {
  const { data: org, isLoading } = useCurrentOrg();
  const canAccess = org?.role === "admin" || org?.role === "super_admin" || org?.role === "manager";

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
            DHHS91172 duties, with accurate due-date rules and a clear split between
            what HIVE can collect and what must be filed elsewhere.
          </p>
        </div>
      </div>

      <Tabs defaultValue="obligations">
        <TabsList>
          <TabsTrigger value="obligations">Obligations</TabsTrigger>
          <TabsTrigger value="policy-library">Policy library</TabsTrigger>
        </TabsList>
        <TabsContent value="obligations">
          <ObligationsTab orgId={org.organization_id} />
        </TabsContent>
        <TabsContent value="policy-library">
          <PolicyLibraryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
