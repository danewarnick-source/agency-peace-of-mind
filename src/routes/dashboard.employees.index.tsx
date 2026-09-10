import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { adminResetEmployeePassword } from "@/lib/employees.functions";
import { resendInvitation, revokeInvitation } from "@/lib/invitations.functions";
import { archiveEntity, deleteEntity, restoreEntity } from "@/lib/lifecycle.functions";
import { inviteJoinUrl } from "@/lib/join-invite";
import { resolveAuthOrigin } from "@/lib/auth-redirect";
import { generateTempPassword } from "@/lib/temp-password";
import { onStaffAssignmentCreated } from "@/lib/staff-assignment-hooks.functions";
import {
  countEmployeesOnRosterTab,
  filterEmployeesByRosterTab,
  isEmployeeOnActiveRoster,
  type EmployeeRosterTab,
} from "@/lib/employee-roster";
import { AddEmployeeButton, AddEmployeeWizard } from "@/components/employees/add-employee-wizard";
import { EmployeeRosterUploadButton, EmployeeRosterUploadWizard } from "@/components/employees/employee-roster-upload-wizard";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Mail, KeyRound, Copy, UserCheck, UserX, Users as UsersIcon, Search, Loader2, MoreHorizontal, Ban, ExternalLink, Settings, RefreshCcw, Trash2, AlertTriangle } from "lucide-react";
import { StaffFieldsPanel } from "@/components/hr/staff-fields-panel";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { OnboardingReturnBar } from "@/components/onboarding/onboarding-return-bar";
import { OnboardingGuidanceBanner } from "@/components/onboarding/onboarding-guidance-banner";

import { RequirePermission } from "@/components/rbac-guard";
import { PersonAvatar } from "@/components/person/person-avatar";
import type { Position } from "@/lib/employee-positions";

export const Route = createFileRoute("/dashboard/employees/")({
  validateSearch: (s: Record<string, unknown>): { upload?: boolean } => ({
    upload: s.upload === true || s.upload === 1 || s.upload === "1" || s.upload === "true",
  }),
  component: () => (
    <RequirePermission perm="view_staff_records">
      <EmployeesPage />
    </RequirePermission>
  ),
});


export function EmployeesPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const search = useSearch({ strict: false }) as { upload?: boolean };
  const [uploadOpen, setUploadOpen] = useState(() => search.upload === true);
  useEffect(() => {
    if (search.upload) setUploadOpen(true);
  }, [search.upload]);
  const [rosterTab, setRosterTab] = useState<EmployeeRosterTab>("active");
  const [deleteTarget, setDeleteTarget] = useState<{ userId: string; name: string } | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");
  const [resetUser, setResetUser] = useState<{ id: string; name: string } | null>(null);
  const [tempPassword, setTempPassword] = useState(() => generateTempPassword());
  const [credentialsShown, setCredentialsShown] = useState<{ identifier: string; password: string; newStaffId?: string } | null>(null);
  const [caseloadFor, setCaseloadFor] = useState<{ id: string; name: string; role: string } | null>(null);
  const [staffFieldsOpen, setStaffFieldsOpen] = useState(false);

  const resetPwFn = useServerFn(adminResetEmployeePassword);
  const resendInviteFn = useServerFn(resendInvitation);
  const revokeInviteFn = useServerFn(revokeInvitation);
  const archiveFn = useServerFn(archiveEntity);
  const restoreFn = useServerFn(restoreEntity);
  const deleteFn = useServerFn(deleteEntity);

  const { data: members, isLoading: membersLoading } = useQuery({
    enabled: !!org,
    queryKey: ["members", org?.organization_id],
    queryFn: async () => {
      if (!org) throw new Error("No organization selected.");
      const { data } = await supabase
        .from("organization_members")
        .select("id, role, job_title, active, user_id, created_at")
        .eq("organization_id", org.organization_id);
      const ids = (data ?? []).map((m) => m.user_id);
      const { data: profs } = await supabase.from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, full_name, email, username, must_change_password, department, hire_date, start_date, employee_id, position, account_status, is_active, worker_type, photo_path, photo_updated_at" as any)
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profMap = new Map(((profs ?? []) as any[]).map((p) => [p.id as string, p]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((m) => ({ ...m, profile: profMap.get(m.user_id) as any }));
    },
  });
  const visibleMembers = useMemo(
    () => filterEmployeesByRosterTab(members, rosterTab),
    [members, rosterTab],
  );
  const activeCount = useMemo(() => countEmployeesOnRosterTab(members, "active"), [members]);
  const inactiveCount = useMemo(() => countEmployeesOnRosterTab(members, "inactive"), [members]);
  const { data: invites } = useQuery({
    enabled: !!org,
    queryKey: ["invites", org?.organization_id],
    queryFn: async () => {
      const { data } = await supabase.from("invitations").select("*").eq("organization_id", org!.organization_id).eq("status", "pending");
      return data ?? [];
    },
  });

  // Service codes each staff member is assigned to work, aggregated across
  // all their client assignments — used on the mobile card list.
  const { data: serviceCodesByStaff = new Map<string, string[]>() } = useQuery({
    enabled: !!org,
    queryKey: ["staff-service-codes", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_assignments")
        .select("staff_id, service_codes")
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      const m = new Map<string, Set<string>>();
      for (const row of (data ?? []) as Array<{ staff_id: string; service_codes: string[] | null }>) {
        const set = m.get(row.staff_id) ?? new Set<string>();
        for (const code of row.service_codes ?? []) set.add(code);
        m.set(row.staff_id, set);
      }
      const out = new Map<string, string[]>();
      for (const [staffId, set] of m) out.set(staffId, Array.from(set).sort());
      return out;
    },
  });

  const { data: courses } = useQuery({
    queryKey: ["courses-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id, title").eq("is_published", true);
      return data ?? [];
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      if (!org) throw new Error("No organization selected.");
      return await resendInviteFn({
        data: {
          organization_id: org.organization_id,
          invitation_id: invitationId,
          site_origin: resolveAuthOrigin(),
        },
      });
    },
    onSuccess: (res) => {
      if (res.email_sent) {
        toast.success(`Invitation re-emailed to ${res.invitation.email}`);
      } else {
        toast.warning(
          `Invitation refreshed, but the email couldn't be sent (${res.email_error ?? "unknown error"}). Copy the join link instead.`,
        );
      }
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      if (!org) throw new Error("No organization selected.");
      return await revokeInviteFn({
        data: { organization_id: org.organization_id, invitation_id: invitationId },
      });
    },
    onSuccess: (res) => {
      toast.success(`Invitation revoked for ${res?.invitation?.email ?? "user"}`);
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (input: { userId: string; name: string }) => {
      if (!org) throw new Error("No organization selected.");
      await archiveFn({
        data: { kind: "employee", id: input.userId, organizationId: org.organization_id },
      });
    },
    onSuccess: (_d, vars) => {
      toast.success(`${vars.name} moved to Inactive.`);
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (input: { userId: string; name: string }) => {
      if (!org) throw new Error("No organization selected.");
      await restoreFn({
        data: { kind: "employee", id: input.userId, organizationId: org.organization_id },
      });
    },
    onSuccess: (_d, vars) => {
      toast.success(`${vars.name} is active again.`);
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (input: { userId: string; name: string; confirmName: string }) => {
      if (!org) throw new Error("No organization selected.");
      await deleteFn({
        data: {
          kind: "employee",
          id: input.userId,
          organizationId: org.organization_id,
          confirmName: input.confirmName,
        },
      });
    },
    onSuccess: (_d, vars) => {
      toast.success(`${vars.name} permanently deleted.`);
      setDeleteTarget(null);
      setConfirmDeleteName("");
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPwMutation = useMutation({
    mutationFn: async (input: { userId: string; newPassword: string }) => {
      if (!org) throw new Error("No organization selected.");
      await resetPwFn({ data: {
        organizationId: org.organization_id, userId: input.userId, newPassword: input.newPassword,
      } });
    },
    onSuccess: (_d, vars) => {
      toast.success("Password reset");
      setCredentialsShown({ identifier: resetUser?.name ?? "Employee", password: vars.newPassword });
      setResetUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <OnboardingReturnBar />
      <OnboardingGuidanceBanner step={3} />

      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="text-base font-semibold">Team members</h2>
          <p className="text-sm text-muted-foreground">
            {activeCount} active
            {inactiveCount > 0 && ` · ${inactiveCount} inactive`}
            {(invites?.length ?? 0) > 0 && ` · ${invites!.length} pending invite${invites!.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EmployeeRosterUploadButton onClick={() => setUploadOpen(true)} disabled={!org} />
          <AddEmployeeButton onClick={() => setAddOpen(true)} disabled={!org} />
          <Button variant="outline" onClick={() => setStaffFieldsOpen(true)}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </Button>
        </div>
      </div>

      {!!invites?.length && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h3 className="text-sm font-semibold">Pending invitations</h3>
          <p className="text-xs text-muted-foreground">
            Pending people join <strong>this</strong> organization via the link (not new-agency signup). Resend keeps the same join email. For a new hire, use Add employee.
          </p>
          <ul className="mt-3 divide-y divide-border">
            {invites.map((i) => {
              const link = inviteJoinUrl(resolveAuthOrigin(), i.token);
              return (
                <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="flex items-center gap-2 truncate"><Mail className="h-4 w-4 shrink-0 text-muted-foreground" /> <span className="truncate">{i.email}</span> <span className="shrink-0 text-xs text-muted-foreground">· {i.role}</span></div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={resendInviteMutation.isPending}
                      onClick={() => resendInviteMutation.mutate(i.id)}
                    >
                      <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Resend
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { navigator.clipboard.writeText(link); toast.success("Invite link copied"); }}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy link
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={revokeInviteMutation.isPending}
                      onClick={() => {
                        if (confirm(`Uninvite ${i.email}? This link will stop working.`)) {
                          revokeInviteMutation.mutate(i.id);
                        }
                      }}
                    >
                      <Ban className="mr-1 h-3.5 w-3.5" /> Uninvite
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
        {(["active", "inactive"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setRosterTab(t)}
            className={
              "rounded px-3 py-1 font-medium capitalize transition-colors " +
              (rosterTab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t === "active" ? "Active" : "Inactive"}
            {t === "inactive" && inactiveCount > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                {inactiveCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {membersLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading employees…
          </div>
        ) : !visibleMembers.length ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <p>
              {rosterTab === "inactive"
                ? "No deactivated employees."
                : "No active employees."}
            </p>
          </div>
        ) : (
        <>
        {/* Mobile card list — the table overflows on small screens, so below
            md we render the same roster as stacked cards instead. */}
        <div className="block divide-y divide-border md:hidden">
          {visibleMembers.map((m) => {
            const name = m.profile?.full_name ?? "—";
            const onActiveRoster = isEmployeeOnActiveRoster(m);
            const codes = serviceCodesByStaff.get(m.user_id) ?? [];
            const openProfile = () => {
              void navigate({ to: "/dashboard/employees/$staffId", params: { staffId: m.user_id } });
            };
            return (
              <div
                key={m.id}
                className="flex cursor-pointer flex-col gap-2 p-4 active:bg-muted/50"
                onClick={openProfile}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <PersonAvatar
                      bucket="staff-photos"
                      path={(m.profile as { photo_path?: string | null } | undefined)?.photo_path ?? null}
                      name={name === "—" ? null : name}
                      className="h-9 w-9 text-xs"
                    />
                    <p className="truncate font-bold">{name}</p>
                  </div>
                  <span
                    className={
                      "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                      (onActiveRoster
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    {onActiveRoster ? "Active" : "Deactivated"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs uppercase">{m.role}</span>
                  {codes.length ? (
                    codes.map((code) => (
                      <Badge key={code} variant="outline" className="font-mono text-[10px]">{code}</Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No service codes</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 pt-1" data-no-row-nav onClick={(e) => e.stopPropagation()}>
                  {rosterTab === "inactive" && m.user_id !== user?.id && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={reactivateMutation.isPending}
                        onClick={() => reactivateMutation.mutate({ userId: m.user_id, name })}
                      >
                        Reactivate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          setConfirmDeleteName("");
                          setDeleteTarget({ userId: m.user_id, name });
                        }}
                      >
                        <Trash2 className="mr-1 h-3 w-3" /> Delete
                      </Button>
                    </>
                  )}
                  <Link
                    to="/dashboard/employees/$staffId"
                    params={{ staffId: m.user_id }}
                    className="flex items-center gap-1 text-sm font-medium text-primary"
                  >
                    View <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden max-h-[calc(100vh-16rem)] overflow-auto md:block">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Login</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Start date</th>
                <th className="px-4 py-3 text-right font-semibold w-[220px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((m) => {
                const name = m.profile?.full_name ?? "—";
                const onActiveRoster = isEmployeeOnActiveRoster(m);
                const login = m.profile?.username ?? m.profile?.email ?? "—";
                const needsReset = m.profile?.must_change_password;
                const position = (m.profile?.position ?? "") as Position | "";
                const startDate = (m.profile?.start_date ?? m.profile?.hire_date ?? null) as string | null;
                // Roster avatar now uses <PersonAvatar>, which handles the
                // initials fallback itself when photo_path is null.
                const openProfile = () => {
                  void navigate({ to: "/dashboard/employees/$staffId", params: { staffId: m.user_id } });
                };
                return (
                  <tr
                    key={m.id}
                    className="cursor-pointer h-12 border-b border-border/50 hover:bg-muted/50 transition-colors"
                    onClick={openProfile}
                  >
                    <td className="px-4 py-2 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <PersonAvatar
                          bucket="staff-photos"
                          path={(m.profile as { photo_path?: string | null } | undefined)?.photo_path ?? null}
                          name={name === "—" ? null : name}
                          className="h-9 w-9 text-xs"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 truncate">
                            <span className="truncate">{name}</span>
                            {needsReset && (
                              <span className="hive-role-pill rounded-full px-2 py-0.5 text-[10px] uppercase whitespace-nowrap">
                                Pending first login
                              </span>
                            )}
                          </div>
                          {position && (
                            <div className="text-xs text-muted-foreground truncate">{position}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap max-w-[220px]">
                      <div className="truncate" title={login}>{login}</div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="hive-role-pill rounded-full px-2 py-0.5 text-xs uppercase">{m.role}</span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          (onActiveRoster
                            ? "hive-status-active"
                            : "bg-muted text-muted-foreground")
                        }
                      >
                        {onActiveRoster ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {startDate
                        ? new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap w-[280px]" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            to="/dashboard/employees/$staffId"
                            params={{ staffId: m.user_id }}
                            search={{ tab: "personnel" }}
                          >
                            Personnel file
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            to="/dashboard/employees/$staffId"
                            params={{ staffId: m.user_id }}
                          >
                            View <ExternalLink className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setCaseloadFor({ id: m.user_id, name, role: m.job_title || m.role }); }}
                        >
                          <UsersIcon className="mr-1 h-3.5 w-3.5" /> Caseload
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="More actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setResetUser({ id: m.user_id, name })}>
                              <KeyRound className="mr-2 h-3.5 w-3.5" /> Reset password
                            </DropdownMenuItem>
                            {m.user_id !== user?.id && rosterTab === "active" && (
                              <DropdownMenuItem
                                onSelect={() => deactivateMutation.mutate({ userId: m.user_id, name })}
                                className="text-destructive focus:text-destructive"
                              >
                                <UserX className="mr-2 h-3.5 w-3.5" /> Deactivate
                              </DropdownMenuItem>
                            )}
                            {m.user_id !== user?.id && rosterTab === "inactive" && (
                              <DropdownMenuItem
                                onSelect={() => reactivateMutation.mutate({ userId: m.user_id, name })}
                              >
                                <UserCheck className="mr-2 h-3.5 w-3.5" /> Reactivate
                              </DropdownMenuItem>
                            )}
                            {m.user_id !== user?.id && (
                              <DropdownMenuItem
                                onSelect={() => {
                                  setConfirmDeleteName("");
                                  setDeleteTarget({ userId: m.user_id, name });
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>


      <AddEmployeeWizard
        open={addOpen}
        onOpenChange={setAddOpen}
        organizationId={org?.organization_id ?? null}
        onOpenSettings={() => setStaffFieldsOpen(true)}
      />
      <EmployeeRosterUploadWizard
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        organizationId={org?.organization_id ?? null}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setConfirmDeleteName("");
          }
        }}
      >
        <DialogContent className="border-destructive/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Delete {deleteTarget?.name}?
            </DialogTitle>
            <DialogDescription>
              This permanently removes {deleteTarget?.name} from this organization. Type their full name to confirm. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="confirm-employee-delete" className="text-sm">
              Type <span className="font-mono font-semibold">{deleteTarget?.name}</span> to confirm
            </Label>
            <Input
              id="confirm-employee-delete"
              value={confirmDeleteName}
              onChange={(e) => setConfirmDeleteName(e.target.value)}
              placeholder={deleteTarget?.name}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setConfirmDeleteName("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !deleteTarget ||
                confirmDeleteName.trim().toLowerCase() !== (deleteTarget.name ?? "").trim().toLowerCase() ||
                deleteEmployeeMutation.isPending
              }
              onClick={() => {
                if (!deleteTarget) return;
                deleteEmployeeMutation.mutate({
                  userId: deleteTarget.userId,
                  name: deleteTarget.name,
                  confirmName: confirmDeleteName,
                });
              }}
            >
              {deleteEmployeeMutation.isPending
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting…</>
                : <><Trash2 className="mr-2 h-4 w-4" /> Delete permanently</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog open={!!resetUser} onOpenChange={(o) => !o && setResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password for {resetUser?.name}</DialogTitle>
            <DialogDescription>A new temporary password will be set. The employee must change it on next sign-in.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            resetPwMutation.mutate({ userId: resetUser!.id, newPassword: String(fd.get("newpw")) });
          }} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="newpw">New temporary password</Label>
              <div className="flex gap-2">
                <Input id="newpw" name="newpw" defaultValue={tempPassword} key={"r-" + tempPassword} required minLength={8} />
                <Button type="button" variant="outline" onClick={() => setTempPassword(generateTempPassword())}>Regenerate</Button>
              </div>
            </div>
            <DialogFooter><Button type="submit" disabled={resetPwMutation.isPending}>Reset password</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Credentials reveal */}
      <Dialog open={!!credentialsShown} onOpenChange={(o) => !o && setCredentialsShown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share these credentials</DialogTitle>
            <DialogDescription>This password is shown only once. Copy it and share securely.</DialogDescription>
          </DialogHeader>
          {credentialsShown && (
            <div className="grid gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Login</div><code className="block rounded bg-secondary p-2">{credentialsShown.identifier}</code></div>
              <div>
                <div className="text-xs text-muted-foreground">Temporary password</div>
                <div className="flex gap-2">
                  <code className="flex-1 rounded bg-secondary p-2">{credentialsShown.password}</code>
                  <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(credentialsShown.password); toast.success("Copied"); }}><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                const newStaffId = credentialsShown?.newStaffId;
                setCredentialsShown(null);
                if (newStaffId) {
                  void navigate({
                    to: "/dashboard/employees/$staffId",
                    params: { staffId: newStaffId },
                    search: { tab: "record" },
                  });
                }
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CaseloadDrawer
        member={caseloadFor}
        organizationId={org?.organization_id ?? null}
        onClose={() => setCaseloadFor(null)}
      />

      {org && (
        <StaffFieldsPanel
          open={staffFieldsOpen}
          onOpenChange={(v) => {
            setStaffFieldsOpen(v);
            if (!v) qc.invalidateQueries({ queryKey: ["staff-intake-fields", org.organization_id] });
          }}
          organizationId={org.organization_id}
        />
      )}

    </div>
  );
}

/* ------------------------------------------------------------------------- */

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  job_code: string[] | null;
};

function CaseloadDrawer({
  member, organizationId, onClose,
}: {
  member: { id: string; name: string; role: string } | null;
  organizationId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const assignmentHookFn = useServerFn(onStaffAssignmentCreated);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [original, setOriginal] = useState<Set<string>>(new Set());

  const { data: clients, isLoading: loadingClients } = useQuery({
    enabled: !!member && !!organizationId,
    queryKey: ["caseload-all-clients", organizationId],
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, job_code")
        .eq("organization_id", organizationId!)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const { data: existing, isLoading: loadingExisting } = useQuery({
    enabled: !!member && !!organizationId,
    queryKey: ["caseload-for-staff", organizationId, member?.id],
    queryFn: async (): Promise<{ id: string; client_id: string }[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from("staff_assignments" as any)
        .select("id, client_id")
        .eq("organization_id", organizationId!)
        .eq("staff_id", member!.id);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; client_id: string }[];
    },
  });

  // Seed selection when drawer opens / data loads
  useEffect(() => {
    if (existing) {
      const ids = new Set(existing.map((e) => e.client_id));
      setOriginal(ids);
      setSelected(new Set(ids));
    }
  }, [existing]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (clients ?? []).filter((c) =>
      !q || `${c.first_name} ${c.last_name}`.toLowerCase().includes(q)
      || (c.job_code ?? []).some((j) => j.toLowerCase().includes(q))
    );
  }, [clients, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!member || !organizationId) return;
      const toAdd = [...selected].filter((id) => !original.has(id));
      const toRemoveIds = (existing ?? [])
        .filter((e) => !selected.has(e.client_id))
        .map((e) => e.id);

      if (toRemoveIds.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from("staff_assignments" as any)
          .delete().in("id", toRemoveIds);
        if (error) throw error;
      }
      if (toAdd.length) {
        const rows = toAdd.map((client_id) => ({
          organization_id: organizationId, staff_id: member.id, client_id,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from("staff_assignments" as any).insert(rows as any);
        if (error) throw error;
        for (const clientId of toAdd) {
          try {
            await assignmentHookFn({
              data: {
                organizationId,
                staffId: member.id,
                clientId,
                serviceCodes: [],
              },
            });
          } catch (e) {
            console.warn("[obligations] assignment auto-assign failed:", e);
          }
        }
      }
    },
    onSuccess: () => {
      toast.success(`Caseload updated successfully for ${member?.name ?? "employee"}`);
      qc.invalidateQueries({ queryKey: ["caseload-for-staff"] });
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["caseload"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = useMemo(() => {
    if (selected.size !== original.size) return true;
    for (const id of selected) if (!original.has(id)) return true;
    return false;
  }, [selected, original]);

  const loading = loadingClients || loadingExisting;

  return (
    <Sheet open={!!member} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Caseload Assignment Center: {member?.name ?? ""}</SheetTitle>
          <SheetDescription>
            Check every individual this staff member may serve. Changes restrict what they see in Time Clock and Daily Logs.
          </SheetDescription>
        </SheetHeader>

        <div className="relative mt-5">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name or service code…"
            className="pl-9"
          />
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{selected.size} of {clients?.length ?? 0} selected</span>
          {dirty && <span className="font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>}
        </div>

        <div className="mt-2 divide-y divide-border rounded-xl border border-border">
          {loading ? (
            <div className="grid place-items-center p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : !filtered.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No clients found.</p>
          ) : (
            filtered.map((c: ClientRow) => {
              const on = selected.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors ${
                    on ? "bg-primary/5" : "hover:bg-muted/40"
                  }`}
                >
                  <Checkbox checked={on} onCheckedChange={() => toggle(c.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.first_name} {c.last_name}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {(c.job_code ?? []).filter(Boolean).map((code: string) => (
                      <Badge key={code} variant="secondary" className="font-mono text-[10px]">{code}</Badge>
                    ))}
                    {!(c.job_code?.length) && <span className="text-[10px] text-muted-foreground">No codes</span>}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button
            className="w-full"
            disabled={!dirty || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save Caseload Modifications"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
