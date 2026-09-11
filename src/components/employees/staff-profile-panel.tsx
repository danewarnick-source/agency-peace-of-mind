import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  usePermissions,
  useOrgPermissions,
  useEffectivePermissions,
} from "@/hooks/use-permissions";
import { setMemberGrants } from "@/lib/team-access.functions";
import { onStaffHired } from "@/lib/staff-assignment-hooks.functions";
import { saveStaffPermissionToggles, setScopeAssignments } from "@/lib/permissions.functions";
import {
  fillRoleGrantedMap,
  staffPermissionMutationErrorMessage,
} from "@/lib/staff-permission-toggles";
import { ALL_PERMISSIONS, type Permission, type ProviderRole, type Role } from "@/lib/rbac";
import {
  adminScopeIsLockedWholeOrg,
  isAdminScopeRole,
  parseAdminScope,
  type ParsedAdminScope,
} from "@/lib/admin-scope";
import { StaffProfileIdentity } from "@/components/employees/staff-profile-identity";
import {
  identityDraftFrom,
  loadStaffProfileIdentity,
  memberBelongsToRouteStaff,
  profileBelongsToRouteStaff,
  staffProfileIdentityQueryKey,
  type StaffIdentityDraft,
  type StaffIdentityMember,
  type StaffIdentityProfile,
} from "@/lib/staff-profile-identity";
import { AdminScopeFields } from "@/components/employees/admin-scope-fields";
import { StaffProfilePermissions } from "@/components/employees/staff-profile-permissions";

const EMPTY_SCOPE: ParsedAdminScope = {
  mode: "all",
  clientIds: [],
  staffIds: [],
  serviceCodes: [],
  legacyStaffGroupIds: [],
};

export function StaffProfilePanel({
  orgId,
  staffId,
  profile,
  member,
  name,
  highlightPermission,
  onSaved,
}: {
  orgId: string;
  staffId: string;
  profile: StaffIdentityProfile | null;
  member: StaffIdentityMember;
  name: string;
  highlightPermission?: Permission;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEditIdentity = can("edit_staff_records");
  const canManagePerms = can("manage_permissions");
  const canEdit = canEditIdentity || canManagePerms;

  const setGrantsFn = useServerFn(setMemberGrants);
  const hireHookFn = useServerFn(onStaffHired);
  const savePermsFn = useServerFn(saveStaffPermissionToggles);
  const setScopeFn = useServerFn(setScopeAssignments);

  const identityQ = useQuery({
    enabled: !!orgId && !!staffId,
    queryKey: staffProfileIdentityQueryKey(orgId, staffId),
    queryFn: () => loadStaffProfileIdentity(supabase, { organizationId: orgId, staffId }),
  });
  const loaded = identityQ.data;
  const routeProfile =
    loaded !== undefined
      ? profileBelongsToRouteStaff(loaded?.profile ?? null, staffId)
        ? (loaded?.profile ?? null)
        : null
      : profileBelongsToRouteStaff(profile, staffId)
        ? profile
        : null;
  const routeMember =
    loaded?.member && memberBelongsToRouteStaff(loaded.member, staffId)
      ? loaded.member
      : memberBelongsToRouteStaff(member, staffId)
        ? member
        : member;

  const { data: effective, isLoading: permsLoading } = useEffectivePermissions(staffId);
  const { data: matrix } = useOrgPermissions();

  const scopeQ = useQuery({
    enabled: !!orgId && isAdminScopeRole(routeMember.role),
    queryKey: ["staff-admin-scope", orgId, staffId],
    queryFn: async (): Promise<ParsedAdminScope> => {
      const { data } = await supabase
        .from("scope_assignments")
        .select("scope_type, scope_ref_id")
        .eq("organization_id", orgId)
        .eq("user_id", staffId);
      return parseAdminScope(data ?? []);
    },
  });

  const [editing, setEditing] = useState(false);
  const [identity, setIdentity] = useState<StaffIdentityDraft>(() =>
    identityDraftFrom(routeProfile, routeMember),
  );
  const [permDraft, setPermDraft] = useState<Record<string, boolean>>({});
  const [scopeDraft, setScopeDraft] = useState<ParsedAdminScope>(EMPTY_SCOPE);

  const roleForDefaults = (editing ? identity.role : routeMember.role) as Role;
  const roleGranted = useMemo(
    () => fillRoleGrantedMap(roleForDefaults, matrixRows(matrix, roleForDefaults)),
    [matrix, roleForDefaults],
  );

  useEffect(() => {
    if (editing) return;
    setIdentity(identityDraftFrom(routeProfile, routeMember));
  }, [editing, routeProfile, routeMember, staffId]);

  useEffect(() => {
    if (!effective || editing) return;
    const next: Record<string, boolean> = {};
    for (const perm of ALL_PERMISSIONS) {
      next[perm] = !!effective.resolved[perm]?.granted;
    }
    setPermDraft(next);
  }, [effective, editing]);

  useEffect(() => {
    if (editing) return;
    if (scopeQ.data) setScopeDraft(scopeQ.data);
    else if (adminScopeIsLockedWholeOrg(routeMember.role)) setScopeDraft(EMPTY_SCOPE);
  }, [editing, scopeQ.data, routeMember.role]);

  const startEdit = () => {
    setIdentity(identityDraftFrom(routeProfile, routeMember));
    if (effective) {
      const next: Record<string, boolean> = {};
      for (const perm of ALL_PERMISSIONS) {
        next[perm] = !!effective.resolved[perm]?.granted;
      }
      setPermDraft(next);
    }
    setScopeDraft(scopeQ.data ?? EMPTY_SCOPE);
    setEditing(true);
  };

  const cancel = () => {
    setIdentity(identityDraftFrom(routeProfile, routeMember));
    if (effective) {
      const next: Record<string, boolean> = {};
      for (const perm of ALL_PERMISSIONS) {
        next[perm] = !!effective.resolved[perm]?.granted;
      }
      setPermDraft(next);
    }
    setScopeDraft(scopeQ.data ?? EMPTY_SCOPE);
    setEditing(false);
  };

  const onIdentityChange = (next: StaffIdentityDraft) => {
    if (next.role !== identity.role) {
      const granted = fillRoleGrantedMap(next.role as Role, matrixRows(matrix, next.role as Role));
      const reset: Record<string, boolean> = {};
      for (const perm of ALL_PERMISSIONS) {
        reset[perm] = !!granted.get(perm);
      }
      setPermDraft(reset);
      if (adminScopeIsLockedWholeOrg(next.role)) {
        setScopeDraft(EMPTY_SCOPE);
      }
    }
    setIdentity(next);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (canEditIdentity) {
        const fullName = `${identity.first_name.trim()} ${identity.last_name.trim()}`.trim();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("profiles")
          .update({
            first_name: identity.first_name.trim() || null,
            last_name: identity.last_name.trim() || null,
            full_name: fullName || null,
            email: identity.email || null,
            phone: identity.phone || null,
            hire_date: identity.hire_date || null,
            start_date: identity.hire_date || null,
            employee_id: identity.employee_id.trim() || null,
          })
          .eq("id", staffId);
        if (error) throw new Error(error.message);

        const { error: jobErr } = await supabase
          .from("organization_members")
          .update({ job_title: identity.job_title.trim() || null })
          .eq("id", routeMember.id)
          .eq("user_id", staffId);
        if (jobErr) throw new Error(jobErr.message);

        if (identity.hire_date) {
          try {
            await hireHookFn({ data: { organizationId: orgId, staffId } });
          } catch (e) {
            console.warn("[obligations] hire auto-assign failed:", e);
          }
        }
        if (identity.role !== routeMember.role) {
          await setGrantsFn({
            data: {
              organization_id: orgId,
              membership_id: routeMember.id,
              target_user_id: staffId,
              explicit_role: identity.role as ProviderRole,
            },
          });
        }
      }

      if (canManagePerms) {
        const toggles = ALL_PERMISSIONS.map((permission) => ({
          permission,
          granted: !!permDraft[permission],
        }));
        await savePermsFn({
          data: { organizationId: orgId, targetUserId: staffId, toggles },
        });

        const scopeRole = identity.role;
        if (isAdminScopeRole(scopeRole) && !adminScopeIsLockedWholeOrg(scopeRole)) {
          if (
            scopeDraft.mode === "selected" &&
            !scopeDraft.clientIds.length &&
            !scopeDraft.staffIds.length
          ) {
            throw new Error("Select at least one client or staff member for Admin scope.");
          }
          if (scopeDraft.mode === "service_code" && !scopeDraft.serviceCodes.length) {
            throw new Error("Select at least one service code for Admin scope.");
          }
          await setScopeFn({
            data: {
              organizationId: orgId,
              targetUserId: staffId,
              mode: scopeDraft.mode,
              clientIds: scopeDraft.clientIds,
              staffIds: scopeDraft.staffIds,
              serviceCodes: scopeDraft.serviceCodes,
            },
          });
        } else if (adminScopeIsLockedWholeOrg(scopeRole)) {
          await setScopeFn({
            data: {
              organizationId: orgId,
              targetUserId: staffId,
              mode: "all",
              clientIds: [],
              staffIds: [],
              serviceCodes: [],
            },
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: staffProfileIdentityQueryKey(orgId, staffId) });
      qc.invalidateQueries({ queryKey: ["effective-permissions", orgId, staffId] });
      qc.invalidateQueries({ queryKey: ["staff-admin-scope", orgId, staffId] });
      qc.invalidateQueries({ queryKey: ["scope-assignments", orgId] });
      onSaved();
    },
    onError: (e) =>
      toast.error(
        (e as Error).message.includes("Unauthorized")
          ? "Only organization admins can change user roles."
          : staffPermissionMutationErrorMessage(e, (e as Error).message || "Could not save"),
      ),
  });

  const showScope = isAdminScopeRole(editing ? identity.role : routeMember.role);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Profile
          </h2>
          {canEdit && !editing ? (
            <Button size="sm" variant="outline" onClick={startEdit}>
              Edit profile
            </Button>
          ) : null}
          {editing ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving…" : "Save profile"}
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel} disabled={saveMut.isPending}>
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
        <StaffProfileIdentity
          orgId={orgId}
          staffId={staffId}
          name={name}
          profile={routeProfile}
          member={routeMember}
          editing={editing && canEditIdentity}
          draft={identity}
          onDraftChange={onIdentityChange}
        />
      </section>

      {canManagePerms ? (
        <section
          id="staff-profile-permissions"
          className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
        >
          <div>
            <h2 className="text-sm font-semibold">Permissions</h2>
            <p className="text-sm text-muted-foreground">
              Changing base role resets toggles to that role&apos;s defaults. Save stores overrides
              only.
            </p>
          </div>

          {showScope ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Admin scope</h3>
              <AdminScopeFields
                orgId={orgId}
                role={editing ? identity.role : routeMember.role}
                editing={editing}
                draft={
                  adminScopeIsLockedWholeOrg(editing ? identity.role : routeMember.role)
                    ? EMPTY_SCOPE
                    : scopeDraft
                }
                onChange={setScopeDraft}
              />
            </div>
          ) : null}

          {permsLoading ? (
            <p className="text-sm text-muted-foreground">Loading permissions…</p>
          ) : (
            <StaffProfilePermissions
              editing={editing}
              draft={permDraft}
              roleGranted={roleGranted}
              highlightPermission={highlightPermission}
              onToggle={(perm, granted) => setPermDraft((d) => ({ ...d, [perm]: granted }))}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

function matrixRows(
  matrix: Record<string, Record<string, boolean>> | undefined,
  role: string,
): Array<{ permission: string; enabled: boolean }> {
  const row = matrix?.[role];
  if (!row) return [];
  return Object.entries(row).map(([permission, enabled]) => ({ permission, enabled }));
}
