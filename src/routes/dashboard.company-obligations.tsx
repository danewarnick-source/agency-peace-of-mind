import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Upload, ClipboardList } from "lucide-react";
import { listCompanyObligations } from "@/lib/company-obligations.functions";
import { listStaffGroups } from "@/lib/staff-groups.functions";
import { ObligationCard, type ObligationWithInstance } from "@/components/company-obligations/obligation-card";
import { ObligationDrawer } from "@/components/company-obligations/obligation-drawer";
import type { CompanyObligationRow } from "@/lib/company-obligations.functions";

export const Route = createFileRoute("/dashboard/company-obligations")({
  head: () => ({ meta: [{ title: "Company Obligations — HIVE" }] }),
  component: CompanyObligationsPage,
});

function isInCurrentMonth(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

function isDueWithinDays(iso: string, days: number): boolean {
  const due = new Date(iso).getTime();
  const now = Date.now();
  return due >= now && due <= now + days * 86_400_000;
}

function StatCard({ label, count, tone }: { label: string; count: number; tone: "red" | "amber" | "green" }) {
  const toneClasses = {
    red: "border-destructive/30 bg-destructive/5 text-destructive",
    amber: "border-warning/40 bg-warning/10 text-warning-foreground",
    green: "border-success/30 bg-success/5 text-success",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${toneClasses}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

function ObligationsTab({ orgId }: { orgId: string }) {
  const listFn = useServerFn(listCompanyObligations);
  const listGroupsFn = useServerFn(listStaffGroups);

  const { data: obligations = [], isLoading } = useQuery({
    queryKey: ["company-obligations", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
    staleTime: 0,
    refetchInterval: 60_000,
  });

  const { data: groups = [] } = useQuery({
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
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingObligation, setEditingObligation] = useState<CompanyObligationRow | null>(null);

  const stats = useMemo(() => {
    let overdue = 0, dueThisWeek = 0, satisfiedThisMonth = 0;
    for (const o of obligations) {
      const inst = o.current_instance;
      if (!inst) continue;
      if (inst.status === "overdue") overdue++;
      if (inst.status === "pending" && isDueWithinDays(inst.due_at, 7)) dueThisWeek++;
      if (inst.status === "completed" && isInCurrentMonth(inst.completed_at)) satisfiedThisMonth++;
    }
    return { overdue, dueThisWeek, satisfiedThisMonth };
  }, [obligations]);

  const needsAttention = useMemo(() => {
    return obligations
      .filter((o) => o.current_instance && (o.current_instance.status === "overdue" || (o.current_instance.status === "pending" && isDueWithinDays(o.current_instance.due_at, 7))))
      .sort((a, b) => {
        const aOverdue = a.current_instance!.status === "overdue";
        const bOverdue = b.current_instance!.status === "overdue";
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return new Date(a.current_instance!.due_at).getTime() - new Date(b.current_instance!.due_at).getTime();
      });
  }, [obligations]);

  const filtered = useMemo(() => {
    let list = obligations;
    if (filter === "active") list = list.filter((o) => o.active);
    if (filter === "paused") list = list.filter((o) => !o.active);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((o) => o.title.toLowerCase().includes(q));
    return [...list].sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));
  }, [obligations, filter, search]);

  const openCreate = () => {
    setEditingObligation(null);
    setDrawerOpen(true);
  };
  const openEdit = (ob: ObligationWithInstance) => {
    setEditingObligation(ob);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> New obligation
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Overdue" count={stats.overdue} tone="red" />
        <StatCard label="Due this week" count={stats.dueThisWeek} tone="amber" />
        <StatCard label="Satisfied this period" count={stats.satisfiedThisMonth} tone="green" />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading obligations…</p>
      ) : (
        <>
          {needsAttention.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Needs attention</h3>
              <div className="grid gap-3">
                {needsAttention.map((o) => (
                  <ObligationCard
                    key={o.id}
                    orgId={orgId}
                    obligation={o}
                    groupNamesById={groupNamesById}
                    userNamesById={userNamesById}
                    publishedFormIds={publishedFormIds}
                    onEdit={openEdit}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-muted-foreground">All obligations</h3>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-border p-0.5">
                  {(["all", "active", "paused"] as const).map((f) => (
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
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search title…"
                    className="h-8 w-48 pl-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No obligations match your filters.
              </div>
            ) : (
              <div className="grid gap-3">
                {filtered.map((o) => (
                  <ObligationCard
                    key={o.id}
                    orgId={orgId}
                    obligation={o}
                    groupNamesById={groupNamesById}
                    userNamesById={userNamesById}
                    publishedFormIds={publishedFormIds}
                    onEdit={openEdit}
                  />
                ))}
              </div>
            )}
          </div>
        </>
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
          reference specific sections when defining obligations.
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
        You do not have permission to view company obligations.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-base font-semibold">Company Obligations</h2>
          <p className="text-sm text-muted-foreground">
            Recurring and per-event compliance duties, tracked to completion.
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
