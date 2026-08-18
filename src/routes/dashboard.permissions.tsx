import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useOrgPermissions } from "@/hooks/use-permissions";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldCheck, ChevronDown, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import {
  ALL_PERMISSIONS, DEFAULT_MATRIX, PERMISSION_LABEL, PERMISSION_SECTIONS,
  PERMISSION_SECTION_MAP, ROLE_LABEL, type Permission, type Role,
} from "@/lib/rbac";
import { setRolePermission, resetRoleToDefaults } from "@/lib/permissions.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/permissions")({
  head: () => ({ meta: [{ title: "Permissions — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_permissions">
      <PermissionsPage />
    </RequirePermission>
  ),
});

const EDITABLE_ROLES: Role[] = ["admin", "manager", "employee", "committee_member"];

function groupedPermissions(): Record<string, Permission[]> {
  const groups: Record<string, Permission[]> = {};
  ALL_PERMISSIONS.forEach((perm) => {
    const section = PERMISSION_SECTION_MAP[perm] ?? "organization";
    (groups[section] ??= []).push(perm);
  });
  return groups;
}

function PermissionsPage() {
  const { data: org } = useCurrentOrg();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Permissions</h2>
            <p className="text-sm text-muted-foreground">
              Manage role defaults and review the change history for {org?.organization_name ?? "your organization"}.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="role-defaults">
        <TabsList>
          <TabsTrigger value="role-defaults">Role defaults</TabsTrigger>
          <TabsTrigger value="change-history">Change history</TabsTrigger>
        </TabsList>
        <TabsContent value="role-defaults" className="mt-6">
          <RoleDefaultsTab />
        </TabsContent>
        <TabsContent value="change-history" className="mt-6">
          <ChangeHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RoleDefaultsTab() {
  const { data: org } = useCurrentOrg();
  const { data: matrix, isLoading } = useOrgPermissions();
  const qc = useQueryClient();
  const setPermFn = useServerFn(setRolePermission);
  const resetFn = useServerFn(resetRoleToDefaults);
  const [saving, setSaving] = useState<string | null>(null);
  const [resetRole, setResetRole] = useState<Role | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(PERMISSION_SECTIONS).map((s) => [s, true])),
  );

  const groups = useMemo(groupedPermissions, []);

  const toggle = async (role: Role, perm: Permission, value: boolean) => {
    if (!org) return;
    const key = `${role}:${perm}`;
    setSaving(key);
    try {
      await setPermFn({
        data: { organizationId: org.organization_id, role, permission: perm, enabled: value },
      });
      qc.invalidateQueries({ queryKey: ["role-permissions", org.organization_id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save permission");
    } finally {
      setSaving(null);
    }
  };

  const doReset = async (role: Role) => {
    if (!org) return;
    const permissions = ALL_PERMISSIONS.map((p) => ({
      permission: p,
      enabled: DEFAULT_MATRIX[role].includes(p),
    }));
    try {
      await resetFn({ data: { organizationId: org.organization_id, role, permissions } });
      qc.invalidateQueries({ queryKey: ["role-permissions", org.organization_id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset role");
    } finally {
      setResetRole(null);
    }
  };

  if (isLoading || !matrix) {
    return <div className="text-sm text-muted-foreground">Loading permissions…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          These are the default permissions for each role in your organization. To grant or
          restrict access for a specific person, use the Permissions tab on their staff profile.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div
          className="grid items-center gap-2 border-b border-border bg-secondary/30 p-4 text-xs font-semibold uppercase text-muted-foreground"
          style={{ gridTemplateColumns: `1fr repeat(${EDITABLE_ROLES.length}, 9rem)` }}
        >
          <div>Permission</div>
          {EDITABLE_ROLES.map((r) => (
            <div key={r} className="flex flex-col items-center gap-1 text-center">
              <span>{ROLE_LABEL[r]}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[10px] font-normal normal-case text-muted-foreground"
                onClick={() => setResetRole(r)}
              >
                <RotateCcw className="h-3 w-3" /> Reset to defaults
              </Button>
            </div>
          ))}
        </div>

        {Object.entries(PERMISSION_SECTIONS).map(([sectionKey, sectionLabel]) => {
          const perms = groups[sectionKey] ?? [];
          if (!perms.length) return null;
          const isOpen = openSections[sectionKey] ?? true;
          return (
            <Collapsible
              key={sectionKey}
              open={isOpen}
              onOpenChange={(v) => setOpenSections((s) => ({ ...s, [sectionKey]: v }))}
              className="border-b border-border last:border-0"
            >
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-center gap-2 bg-secondary/10 p-3 text-left text-sm font-semibold">
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                  {sectionLabel}
                  <span className="text-xs font-normal text-muted-foreground">({perms.length})</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {perms.map((perm) => (
                  <div
                    key={perm}
                    className="grid items-center gap-2 border-t border-border p-4"
                    style={{ gridTemplateColumns: `1fr repeat(${EDITABLE_ROLES.length}, 9rem)` }}
                  >
                    <div>
                      <div className="font-medium">{PERMISSION_LABEL[perm]}</div>
                      <div className="text-xs text-muted-foreground">{perm}</div>
                    </div>
                    {EDITABLE_ROLES.map((role) => {
                      const key = `${role}:${perm}`;
                      return (
                        <div key={role} className="flex justify-center">
                          {saving === key ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Switch
                              checked={!!matrix[role][perm]}
                              onCheckedChange={(v) => toggle(role, perm, v)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      <AlertDialog open={!!resetRole} onOpenChange={(v) => !v && setResetRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {resetRole ? ROLE_LABEL[resetRole] : ""} to defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all {resetRole ? ROLE_LABEL[resetRole] : ""} permissions to the standard
              defaults. Any customizations for this role will be lost. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetRole && doReset(resetRole)}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface AuditRow {
  id: string;
  created_at: string | null;
  changed_by_name: string;
  change_type: string;
  role: string | null;
  target_user_name: string | null;
  permission: string;
  previous_value: boolean | null;
  new_value: boolean | null;
}

const CHANGE_TYPE_LABEL: Record<string, string> = {
  role_permission_updated: "Role config",
  individual_override_granted: "Individual grant",
  individual_override_denied: "Individual deny",
  individual_override_removed: "Override removed",
  individual_override_expired: "Override expired",
};

const PAGE_SIZE = 50;

function ChangeHistoryTab() {
  const { data: org } = useCurrentOrg();
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["permission-audit-log", org?.organization_id, page],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase
        .from("permission_audit_log")
        .select("id, created_at, changed_by_name, change_type, role, target_user_name, permission, previous_value, new_value")
        .eq("organization_id", org!.organization_id)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      return data as AuditRow[];
    },
  });

  const fmtVal = (v: boolean | null) => (v === null ? "—" : v ? "Enabled" : "Disabled");

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-secondary/30 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-3 text-left">Date/time</th>
            <th className="p-3 text-left">Changed by</th>
            <th className="p-3 text-left">Change type</th>
            <th className="p-3 text-left">Target</th>
            <th className="p-3 text-left">Permission</th>
            <th className="p-3 text-left">From</th>
            <th className="p-3 text-left">To</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
          ) : !data?.length ? (
            <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No permission changes yet.</td></tr>
          ) : (
            data.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                  {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                </td>
                <td className="p-3">{row.changed_by_name}</td>
                <td className="p-3">{CHANGE_TYPE_LABEL[row.change_type] ?? row.change_type}</td>
                <td className="p-3">
                  {row.target_user_name ? `${row.target_user_name} — individual` : row.role ? ROLE_LABEL[row.role as Role] ?? row.role : "—"}
                </td>
                <td className="p-3 text-xs">{PERMISSION_LABEL[row.permission as Permission] ?? row.permission}</td>
                <td className="p-3 text-xs">{fmtVal(row.previous_value)}</td>
                <td className="p-3 text-xs">{fmtVal(row.new_value)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-border p-3 text-xs text-muted-foreground">
        <span>Page {page + 1}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={(data?.length ?? 0) < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
