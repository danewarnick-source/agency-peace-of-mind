import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useOrgPermissions } from "@/hooks/use-permissions";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, Save, RotateCcw } from "lucide-react";
import {
  ALL_PERMISSIONS, DEFAULT_MATRIX, PERMISSION_LABEL, ROLE_LABEL, type Permission, type Role,
} from "@/lib/rbac";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/permissions")({
  head: () => ({ meta: [{ title: "Permissions — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_roles">
      <PermissionsPage />
    </RequirePermission>
  ),
});

const EDITABLE_ROLES: Role[] = ["admin", "manager", "employee"];

function PermissionsPage() {
  const { data: org } = useCurrentOrg();
  const { data: matrix, isLoading } = useOrgPermissions();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<Role, Record<Permission, boolean>> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (matrix && !draft) setDraft(JSON.parse(JSON.stringify(matrix)));
  }, [matrix, draft]);

  const dirty = useMemo(() => {
    if (!matrix || !draft) return false;
    return JSON.stringify(matrix) !== JSON.stringify(draft);
  }, [matrix, draft]);

  const toggle = (role: Role, perm: Permission, value: boolean) => {
    if (!draft) return;
    setDraft({ ...draft, [role]: { ...draft[role], [perm]: value } });
  };

  const resetDefaults = () => {
    const fresh: Record<Role, Record<Permission, boolean>> = {} as never;
    (["super_admin", ...EDITABLE_ROLES] as Role[]).forEach((r) => {
      fresh[r] = Object.fromEntries(
        ALL_PERMISSIONS.map((p) => [p, DEFAULT_MATRIX[r].includes(p)]),
      ) as Record<Permission, boolean>;
    });
    setDraft(fresh);
  };

  const save = async () => {
    if (!org || !draft) return;
    setSaving(true);
    const rows = EDITABLE_ROLES.flatMap((role) =>
      ALL_PERMISSIONS.map((perm) => ({
        organization_id: org.organization_id,
        role,
        permission: perm,
        enabled: draft[role][perm],
        updated_at: new Date().toISOString(),
      })),
    );
    const { error } = await supabase
      .from("role_permissions")
      .upsert(rows, { onConflict: "organization_id,role,permission" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Permissions saved");
    qc.invalidateQueries({ queryKey: ["role-permissions"] });
  };

  if (isLoading || !draft) {
    return <div className="text-sm text-muted-foreground">Loading permissions…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Role permissions</h2>
            <p className="text-sm text-muted-foreground">
              Customize what each role can do in {org?.organization_name ?? "your organization"}.
              Super Admin always has full access.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetDefaults}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset to defaults
          </Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save} className="bg-[image:var(--gradient-brand)] text-primary-foreground">
            <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-4 text-left">Permission</th>
              {EDITABLE_ROLES.map((r) => (
                <th key={r} className="p-4 text-center">{ROLE_LABEL[r]}</th>
              ))}
              <th className="p-4 text-center text-muted-foreground/60">Super Admin</th>
            </tr>
          </thead>
          <tbody>
            {ALL_PERMISSIONS.map((perm) => (
              <tr key={perm} className="border-b border-border last:border-0">
                <td className="p-4">
                  <div className="font-medium">{PERMISSION_LABEL[perm]}</div>
                  <div className="text-xs text-muted-foreground">{perm}</div>
                </td>
                {EDITABLE_ROLES.map((role) => (
                  <td key={role} className="p-4 text-center">
                    <Switch
                      checked={draft[role][perm]}
                      onCheckedChange={(v) => toggle(role, perm, v)}
                    />
                  </td>
                ))}
                <td className="p-4 text-center text-muted-foreground">✓</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
