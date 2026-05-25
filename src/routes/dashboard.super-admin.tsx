import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RequirePermission } from "@/components/rbac-guard";
import { Building2, Users, BookOpen, Award, Settings2, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type Tenant = {
  id: string;
  agency_name: string;
  owner_email: string;
  client_tier_limit: number;
  is_active: boolean;
  created_at: string;
};

type SystemFeature = {
  feature_key: string;
  feature_name: string;
  category: string;
  sort_order: number;
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
              {tenants.map((t) => {
                const enabled = FEATURE_KEYS.filter((f) => t[f.key]).length;
                return (
                  <tr key={t.id} className="border-t border-border">
                    <td className="p-4 font-medium">{t.agency_name}</td>
                    <td className="p-4 text-muted-foreground">{t.owner_email}</td>
                    <td className="p-4">{t.client_tier_limit} clients</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1.5">
                        {FEATURE_KEYS.map((f) => (
                          <Badge
                            key={f.key}
                            variant={t[f.key] ? "default" : "outline"}
                            className="text-[10px]"
                          >
                            {t[f.key] ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3 opacity-50" />}
                            {f.label}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{enabled}/4 enabled</p>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
      <SheetContent className="w-full sm:max-w-md">
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

            <div className="space-y-3 rounded-lg border border-border p-4">
              <p className="text-sm font-semibold">Feature flags</p>
              {FEATURE_KEYS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-3">
                  <Label htmlFor={f.key} className="text-sm font-normal">{f.label}</Label>
                  <Switch
                    id={f.key}
                    checked={tenant[f.key]}
                    disabled={busy}
                    onCheckedChange={(checked) => onPatch({ [f.key]: checked } as Partial<Tenant>)}
                  />
                </div>
              ))}
            </div>

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
