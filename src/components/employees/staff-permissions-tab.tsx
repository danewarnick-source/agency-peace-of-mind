import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  ALL_PERMISSIONS,
  PERMISSION_LABEL,
  PERMISSION_SECTIONS,
  PERMISSION_SECTION_MAP,
  ROLE_LABEL,
  type Permission,
} from "@/lib/rbac";
import { useEffectivePermissions } from "@/hooks/use-permissions";
import {
  resetStaffPermissionOverrides,
  saveStaffPermissionToggles,
} from "@/lib/permissions.functions";

export function StaffPermissionsTab({
  organizationId,
  staffId,
}: {
  organizationId: string;
  staffId: string;
  initialOverridePermission?: Permission;
}) {
  const qc = useQueryClient();
  const { data: effective, isLoading } = useEffectivePermissions(staffId);
  const saveFn = useServerFn(saveStaffPermissionToggles);
  const resetFn = useServerFn(resetStaffPermissionOverrides);
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!effective) return;
    const next: Record<string, boolean> = {};
    for (const perm of ALL_PERMISSIONS) {
      next[perm] = !!effective.resolved[perm]?.granted;
    }
    setDraft(next);
  }, [effective]);

  const dirty = useMemo(() => {
    if (!effective) return false;
    return ALL_PERMISSIONS.some((perm) => draft[perm] !== !!effective.resolved[perm]?.granted);
  }, [draft, effective]);

  const grouped = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    for (const perm of ALL_PERMISSIONS) {
      const section = PERMISSION_SECTION_MAP[perm];
      (groups[section] ??= []).push(perm);
    }
    return groups;
  }, []);

  const saveMut = useMutation({
    mutationFn: async () => {
      await saveFn({
        data: {
          organizationId,
          targetUserId: staffId,
          toggles: ALL_PERMISSIONS.map((permission) => ({
            permission,
            granted: !!draft[permission],
          })),
        },
      });
    },
    onSuccess: () => {
      toast.success("Permissions saved");
      qc.invalidateQueries({ queryKey: ["effective-permissions", organizationId, staffId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save permissions"),
  });

  const resetMut = useMutation({
    mutationFn: async () => {
      await resetFn({ data: { organizationId, targetUserId: staffId } });
    },
    onSuccess: () => {
      toast.success("Reset to role defaults");
      qc.invalidateQueries({ queryKey: ["effective-permissions", organizationId, staffId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reset permissions"),
  });

  if (isLoading || !effective) {
    return <div className="text-sm text-muted-foreground">Loading permissions…</div>;
  }

  const roleLabel = effective.role ? ROLE_LABEL[effective.role] : "this role";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Permissions</h3>
          <p className="text-sm text-muted-foreground">
            Defaults come from the {roleLabel} role. Toggle any permission for this person, then save.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={resetMut.isPending || saveMut.isPending}
            onClick={() => resetMut.mutate()}
          >
            Reset to role defaults
          </Button>
          <Button size="sm" disabled={!dirty || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        {Object.entries(PERMISSION_SECTIONS).map(([sectionKey, sectionLabel]) => {
          const perms = grouped[sectionKey];
          if (!perms?.length) return null;
          return (
            <div key={sectionKey}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {sectionLabel}
              </h4>
              <div className="space-y-1.5">
                {perms.map((perm) => {
                  const entry = effective.resolved[perm];
                  const roleOn = !!entry?.roleGranted;
                  const granted = !!draft[perm];
                  const overridden = granted !== roleOn;
                  return (
                    <label
                      key={perm}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{PERMISSION_LABEL[perm]}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Role default: {roleOn ? "On" : "Off"}</span>
                          {overridden && <Badge variant="outline">This person</Badge>}
                        </div>
                      </div>
                      <Switch
                        checked={granted}
                        onCheckedChange={(v) => setDraft((d) => ({ ...d, [perm]: v }))}
                        aria-label={PERMISSION_LABEL[perm]}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
