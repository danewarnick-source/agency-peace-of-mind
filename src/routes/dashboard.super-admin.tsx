import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RequirePermission } from "@/components/rbac-guard";
import { Building2, Users, BookOpen, Award, Settings2, Plus, Eye, Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { startImpersonation } from "@/hooks/use-impersonation";
import { toast } from "sonner";

type Tenant = {
  id: string;
  agency_name: string;
  owner_email: string;
  client_tier_limit: number;
  is_active: boolean;
  created_at: string;
};


export const Route = createFileRoute("/dashboard/super-admin")({
  component: () => (
    <RequirePermission perm="view_platform_metrics">
      <SuperAdminConsole />
    </RequirePermission>
  ),
});

function SuperAdminConsole() {
  const qc = useQueryClient();
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: overview } = useQuery({
    queryKey: ["super-admin-overview"],
    queryFn: async () => {
      const [orgs, members, assigns, certs] = await Promise.all([
        supabase.from("organizations").select("id, name, created_at").order("created_at", { ascending: false }),
        supabase.from("organization_members").select("organization_id, role", { count: "exact" }),
        supabase.from("course_assignments").select("status"),
        supabase.from("certifications").select("id", { count: "exact", head: true }),
      ]);
      return {
        orgs: orgs.data ?? [],
        memberCount: members.count ?? 0,
        assignmentTotal: assigns.data?.length ?? 0,
        completedTotal: (assigns.data ?? []).filter((a) => a.status === "completed").length,
        certCount: certs.count ?? 0,
      };
    },
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ["provider-tenants"],
    queryFn: async (): Promise<Tenant[]> => {
      const { data, error } = await supabase
        .from("provider_tenants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tenant[];
    },
  });

  const updateTenant = useMutation({
    mutationFn: async (patch: Partial<Tenant> & { id: string }) => {
      const { id, ...rest } = patch;
      const { data, error } = await supabase
        .from("provider_tenants")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Tenant;
    },
    onSuccess: (row) => {
      qc.setQueryData<Tenant[]>(["provider-tenants"], (prev) =>
        (prev ?? []).map((t) => (t.id === row.id ? row : t)),
      );
      setActiveTenant(row);
      toast.success("Tenant updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tiles = [
    { label: "Provider tenants", value: tenants.length, icon: Building2 },
    { label: "Total members", value: overview?.memberCount ?? "—", icon: Users },
    { label: "Course assignments", value: overview?.assignmentTotal ?? "—", icon: BookOpen },
    { label: "Certifications issued", value: overview?.certCount ?? "—", icon: Award },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.label} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{t.label}</p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent"><Icon className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{String(t.value)}</p>
            </div>
          );
        })}
      </div>

      <Tabs defaultValue="tenants" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tenants">🛰️ Tenant Console</TabsTrigger>
          <TabsTrigger value="personnel">👥 Cross-Tenant Personnel Registry</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="space-y-4">
          <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-base font-semibold">🛰️ Multi-Tenant Command Console</h2>
                <p className="text-sm text-muted-foreground">All registered provider agencies, their subscription tier, and live feature status.</p>
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Register tenant
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-4 text-left">Agency</th>
                    <th className="p-4 text-left">Owner</th>
                    <th className="p-4 text-left">Tier</th>
                    <th className="p-4 text-left">Features</th>
                    <th className="p-4 text-left">Status</th>
                    <th className="p-4 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantsLoading && (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading tenants…</td></tr>
                  )}
                  {!tenantsLoading && !tenants.length && (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No provider tenants yet. Click “Register tenant” to add one.</td></tr>
                  )}
                  {tenants.map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="p-4 font-medium">{t.agency_name}</td>
                      <td className="p-4 text-muted-foreground">{t.owner_email}</td>
                      <td className="p-4">{t.client_tier_limit} clients</td>
                      <td className="p-4 text-xs text-muted-foreground">
                        Dynamic registry — open Manage to view
                      </td>
                      <td className="p-4">
                        <Badge variant={t.is_active ? "default" : "outline"}>
                          {t.is_active ? "Active" : "Suspended"}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setActiveTenant(t)}>
                          <Settings2 className="mr-1.5 h-4 w-4" /> Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="personnel">
          <PersonnelRegistry />
        </TabsContent>
      </Tabs>

      <ManageTenantSheet
        tenant={activeTenant}
        onClose={() => setActiveTenant(null)}
        onPatch={(patch) => activeTenant && updateTenant.mutate({ id: activeTenant.id, ...patch })}
        busy={updateTenant.isPending}
      />

      <CreateTenantDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["provider-tenants"] })}
      />
    </div>
  );
}

type DirectoryRow = {
  kind: "staff" | "client";
  user_id: string;
  full_name: string;
  email: string | null;
  role: string;
  organization_id: string | null;
  organization_name: string;
  account_status: string;
};

function PersonnelRegistry() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["cross-tenant-personnel"],
    queryFn: async (): Promise<DirectoryRow[]> => {
      const [orgsRes, membersRes, profilesRes, clientsRes] = await Promise.all([
        supabase.from("organizations").select("id, name"),
        supabase.from("organization_members").select("user_id, organization_id, role, active"),
        supabase.from("profiles").select("id, email, full_name, first_name, last_name, account_status"),
        supabase.from("clients").select("id, organization_id, first_name, last_name, account_status"),
      ]);
      const orgMap = new Map<string, string>(
        (orgsRes.data ?? []).map((o) => [o.id, o.name]),
      );
      const profileMap = new Map<string, NonNullable<typeof profilesRes.data>[number]>(
        (profilesRes.data ?? []).map((p) => [p.id, p]),
      );

      const staff: DirectoryRow[] = (membersRes.data ?? []).map((m) => {
        const p = profileMap.get(m.user_id);
        const name =
          p?.full_name ||
          [p?.first_name, p?.last_name].filter(Boolean).join(" ") ||
          p?.email ||
          "(unnamed)";
        return {
          kind: "staff",
          user_id: m.user_id,
          full_name: name,
          email: p?.email ?? null,
          role: m.role,
          organization_id: m.organization_id,
          organization_name: orgMap.get(m.organization_id) ?? "—",
          account_status: (p?.account_status ?? (m.active ? "active" : "archived")) as string,
        };
      });

      const clients: DirectoryRow[] = (clientsRes.data ?? []).map((c) => ({
        kind: "client",
        user_id: c.id,
        full_name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(unnamed)",
        email: null,
        role: "client",
        organization_id: c.organization_id,
        organization_name: orgMap.get(c.organization_id) ?? "—",
        account_status: (c.account_status ?? "active") as string,
      }));

      return [...staff, ...clients].sort((a, b) =>
        a.organization_name.localeCompare(b.organization_name) ||
        a.full_name.localeCompare(b.full_name),
      );
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        r.organization_name.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q),
    );
  }, [data, search]);

  const actAs = (row: DirectoryRow) => {
    if (!user) {
      toast.error("No active Super-Admin session detected");
      return;
    }
    startImpersonation({
      original_admin_id: user.id,
      original_admin_name: (user.user_metadata?.full_name as string) ?? user.email ?? "Super-Admin",
      original_admin_email: user.email ?? "",
      current_user_id: row.user_id,
      current_user_name: row.full_name,
      current_user_email: row.email ?? "",
      tenant_id: row.organization_id,
      tenant_name: row.organization_name,
      role: row.role,
      started_at: new Date().toISOString(),
    });
    toast.success(`Now acting as ${row.full_name}`);
    navigate({ to: "/dashboard" });
  };

  const roleBadge = (role: string) => {
    const isAdmin = role === "admin" || role === "manager" || role === "super_admin";
    return (
      <Badge variant={isAdmin ? "default" : "outline"} className="text-[10px] uppercase">
        {isAdmin ? "Admin" : role === "client" ? "Client" : "Staff"}
      </Badge>
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">👥 Cross-Tenant Personnel Registry</h2>
          <p className="text-sm text-muted-foreground">
            Every user profile across every provider tenant — staff and clients.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, agency, role…"
            className="pl-9"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Full Name</th>
              <th className="p-3 text-left">Agency</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-right">System Operations</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading personnel…</td></tr>
            )}
            {!isLoading && !filtered.length && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No personnel match this search.</td></tr>
            )}
            {filtered.map((row) => (
              <tr key={`${row.kind}-${row.user_id}`} className="border-t border-border hover:bg-muted/20">
                <td className="p-3 font-medium">{row.full_name}</td>
                <td className="p-3 text-muted-foreground">{row.organization_name}</td>
                <td className="p-3">{roleBadge(row.role)}</td>
                <td className="p-3 text-muted-foreground">{row.email ?? "—"}</td>
                <td className="p-3">
                  <Badge variant={row.account_status === "active" ? "default" : "outline"} className="text-[10px] uppercase">
                    {row.account_status}
                  </Badge>
                </td>
                <td className="p-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={row.kind === "client"}
                    title={row.kind === "client" ? "Clients do not have a login session" : "Act as this user"}
                    onClick={() => actAs(row)}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> 👁️ Act As User
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ManageTenantSheet({
  tenant, onClose, onPatch, busy,
}: {
  tenant: Tenant | null;
  onClose: () => void;
  onPatch: (patch: Partial<Tenant>) => void;
  busy: boolean;
}) {
  return (
    <Sheet open={!!tenant} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>⚙️ Manage Subscriptions & Permissions</SheetTitle>
          <SheetDescription>
            {tenant ? `${tenant.agency_name} · ${tenant.owner_email}` : ""}
          </SheetDescription>
        </SheetHeader>

        {tenant && (
          <div className="mt-6 space-y-6 px-4">
            <div className="space-y-2">
              <Label htmlFor="tier">Client tier limit</Label>
              <Input
                id="tier"
                type="number"
                min={1}
                defaultValue={tenant.client_tier_limit}
                disabled={busy}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isFinite(v) || v === tenant.client_tier_limit) return;
                  onPatch({ client_tier_limit: v });
                }}
              />
              <p className="text-xs text-muted-foreground">Max concurrent clients this agency may serve.</p>
            </div>

            <TenantFeatureRegistry tenantId={tenant.id} />


            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-semibold">Account active</p>
                <p className="text-xs text-muted-foreground">Suspend to instantly revoke access.</p>
              </div>
              <Switch
                checked={tenant.is_active}
                disabled={busy}
                onCheckedChange={(checked) => onPatch({ is_active: checked })}
              />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CreateTenantDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [agencyName, setAgencyName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [limit, setLimit] = useState(15);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("provider_tenants").insert({
      agency_name: agencyName,
      owner_email: ownerEmail,
      client_tier_limit: limit,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Tenant registered");
    setAgencyName(""); setOwnerEmail(""); setLimit(15);
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register provider tenant</DialogTitle>
          <DialogDescription>Create a new agency workspace with default feature flags off.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agency">Agency name</Label>
            <Input id="agency" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner">Owner email</Label>
            <Input id="owner" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="limit">Client tier limit</Label>
            <Input id="limit" type="number" min={1} value={limit} onChange={(e) => setLimit(parseInt(e.target.value, 10) || 1)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create tenant"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const PLATFORM_FEATURES: { key: string; label: string; category: string }[] = [
  { key: "time_clock", label: "⏱️ Time Clock", category: "Operations" },
  { key: "daily_notes", label: "📋 Daily Logs", category: "Operations" },
  { key: "scheduler", label: "📅 Scheduler", category: "Operations" },
  { key: "audit_portal", label: "🛡️ Audit Portal", category: "Compliance" },
  { key: "emar_pass", label: "🩺 eMAR Pass System", category: "Clinical" },
  { key: "emar_audit", label: "📊 eMAR Audit Ledger", category: "Clinical" },
  { key: "pba_trust_ledger", label: "🧮 PBA Trust Ledger", category: "Financial" },
  { key: "employees", label: "👥 Employees Registry", category: "Registry" },
  { key: "clients", label: "👥 Clients Registry", category: "Registry" },
  { key: "teams_homes", label: "🏠 Teams & Homes", category: "Registry" },
  { key: "ai_assistance", label: "🤖 AI Importer & Assistance", category: "Intelligence" },
];

function TenantFeatureRegistry({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();

  const { data: flags = {} } = useQuery({
    queryKey: ["tenant-features", tenantId],
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase
        .from("tenant_features")
        .select("feature_key, is_enabled")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      const out: Record<string, boolean> = {};
      for (const row of data ?? []) out[row.feature_key] = row.is_enabled;
      return out;
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("tenant_features")
        .upsert(
          { tenant_id: tenantId, feature_key: key, is_enabled: enabled, updated_at: new Date().toISOString() },
          { onConflict: "tenant_id,feature_key" },
        );
      if (error) throw error;
    },
    onMutate: async ({ key, enabled }) => {
      await qc.cancelQueries({ queryKey: ["tenant-features", tenantId] });
      const prev = qc.getQueryData<Record<string, boolean>>(["tenant-features", tenantId]);
      qc.setQueryData<Record<string, boolean>>(["tenant-features", tenantId], { ...(prev ?? {}), [key]: enabled });
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tenant-features", tenantId], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => toast.success("Feature updated"),
  });

  const grouped = PLATFORM_FEATURES.reduce<Record<string, typeof PLATFORM_FEATURES>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border p-4">
        <p className="text-sm font-semibold">🎛️ Platform Feature Toggles</p>
        <Badge variant="outline" className="text-[10px]">{PLATFORM_FEATURES.length} modules</Badge>
      </div>
      <ScrollArea className="h-[420px]">
        <div className="space-y-5 p-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{category}</p>
              <div className="space-y-1 rounded-md border border-border/60 bg-card">
                {items.map((f) => {
                  const enabled = flags[f.key] ?? true;
                  return (
                    <div key={f.key} className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0">
                      <div className="min-w-0">
                        <Label htmlFor={`feat-${f.key}`} className="text-sm font-medium">{f.label}</Label>
                        <p className="truncate text-[11px] text-muted-foreground">{f.key}</p>
                      </div>
                      <Switch
                        id={`feat-${f.key}`}
                        checked={enabled}
                        disabled={toggle.isPending}
                        onCheckedChange={(checked) => toggle.mutate({ key: f.key, enabled: checked })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}


