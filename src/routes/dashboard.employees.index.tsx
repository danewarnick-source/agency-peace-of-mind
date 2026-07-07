import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { createEmployeeManually, adminResetEmployeePassword } from "@/lib/employees.functions";
import { listStaffPii, updateStaffPii, type StaffPii } from "@/lib/hr-staff.functions";
// StaffHrChecklistCard now lives on the staff profile route.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Mail, UserPlus, KeyRound, Copy, UserCheck, UserX, ShieldPlus, Pencil, Users as UsersIcon, Search, Loader2, Sparkles, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { OnboardingReturnBar } from "@/components/onboarding/onboarding-return-bar";
import { OnboardingGuidanceBanner } from "@/components/onboarding/onboarding-guidance-banner";

import { RequirePermission } from "@/components/rbac-guard";
// Smart Import replaces the legacy NECTAR Bulk Importer dialog.
import { CustomAttributesSection } from "@/components/custom-attributes-section";
import { LifecyclePanel } from "@/components/lifecycle-panel";
import { SuggestedTopicsInput } from "@/components/ce/suggested-topics-input";
import { getRosterTrainingStatus } from "@/lib/hive-training-roster.functions";
import { PersonAvatar } from "@/components/person/person-avatar";
import { useEntitlements } from "@/hooks/use-entitlements";
import { StaffTrainingStrip, type StaffTrainingStatus } from "@/components/training/staff-training-strip";

function genPassword(len = 14) {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => charset[n % charset.length]).join("");
}

export const Route = createFileRoute("/dashboard/employees/")({
  component: () => (
    <RequirePermission perm="manage_users">
      <EmployeesPage />
    </RequirePermission>
  ),
});

type Role = "admin" | "manager" | "employee";

type Position = "Direct Care" | "Host Staff" | "Office Staff" | "Admin";
const POSITIONS: Position[] = ["Direct Care", "Host Staff", "Office Staff", "Admin"];

type WorkerType = "w2" | "1099";

type EditableMember = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  employeeId: string;
  role: Role;
  active: boolean;
  position: Position | "";
  positions: Position[];
  workerType: WorkerType;
  hourlyRate: string;
  dailyRate: string;
  startDate: string;
  endDate: string;
  ceSuggestedTopics: string[];
};

export function EmployeesPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [resetUser, setResetUser] = useState<{ id: string; name: string } | null>(null);
  const [tempPassword, setTempPassword] = useState(() => genPassword());
  const [credentialsShown, setCredentialsShown] = useState<{ identifier: string; password: string } | null>(null);
  const [editingMember, setEditingMember] = useState<EditableMember | null>(null);
  const [editTopics, setEditTopics] = useState<string[]>([]);
  const [editPositions, setEditPositions] = useState<Position[]>([]);
  const [editDirty, setEditDirty] = useState(false);
  const [caseloadFor, setCaseloadFor] = useState<{ id: string; name: string; role: string } | null>(null);

  const createManual = useServerFn(createEmployeeManually);
  const resetPwFn = useServerFn(adminResetEmployeePassword);
  const fetchStaffPii = useServerFn(listStaffPii);
  const updatePiiFn = useServerFn(updateStaffPii);

  const { data: tracks } = useQuery({
    enabled: !!org,
    queryKey: ["tracks-mini", org?.organization_id],
    queryFn: async () => {
      const { data } = await supabase.from("training_tracks").select("id, name").eq("is_published", true);
      return data ?? [];
    },
  });

  const { data: members } = useQuery({
    enabled: !!org,
    queryKey: ["members", org?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_members")
        .select("id, role, job_title, active, user_id, created_at")
        .eq("organization_id", org!.organization_id);
      const ids = (data ?? []).map((m) => m.user_id);
      const { data: profs } = await supabase.from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, full_name, email, username, must_change_password, department, hire_date, start_date, end_date, employee_id, position, positions, account_status, worker_type, ce_suggested_topics, photo_path, photo_updated_at" as any)
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profMap = new Map(((profs ?? []) as any[]).map((p) => [p.id as string, p]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? [])
        .map((m) => ({ ...m, profile: profMap.get(m.user_id) as any }))
        // Hide archived accounts from the active operational roster.
        .filter((m) => (m.profile?.account_status ?? "active") !== "archived");
    },
  });
  // Gated rate lookup: server-side `list_staff_pii` returns only staff the
  // caller may view (admin / team-manager-of-staff / self). Direct selects
  // of hourly_rate / daily_rate against `profiles` are REVOKEd.
  const { data: staffPii } = useQuery({
    enabled: !!org,
    queryKey: ["staff-pii", org?.organization_id],
    queryFn: async (): Promise<StaffPii[]> =>
      await fetchStaffPii({ data: { organization_id: org!.organization_id } }),
  });
  const piiByStaff = useMemo(() => {
    const m = new Map<string, StaffPii>();
    for (const row of staffPii ?? []) m.set(row.staff_id, row);
    return m;
  }, [staffPii]);

  const fetchTrainingStatus = useServerFn(getRosterTrainingStatus);
  const { hasAddon } = useEntitlements();
  const hiveTrainingEnabled = hasAddon("hive_training");
  const { data: trainingStatus } = useQuery({
    enabled: !!org && hiveTrainingEnabled,
    queryKey: ["roster-training-status", org?.organization_id],
    queryFn: async () => await fetchTrainingStatus({ data: { organizationId: org!.organization_id } }),
  });
  const trainingByStaff = useMemo(() => {
    const m = new Map<string, StaffTrainingStatus[]>();
    for (const row of trainingStatus ?? []) m.set(row.userId, row.trainings);
    return m;
  }, [trainingStatus]);



  const { data: invites } = useQuery({
    enabled: !!org,
    queryKey: ["invites", org?.organization_id],
    queryFn: async () => {
      const { data } = await supabase.from("invitations").select("*").eq("organization_id", org!.organization_id).eq("status", "pending");
      return data ?? [];
    },
  });

  const { data: courses } = useQuery({
    queryKey: ["courses-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id, title").eq("is_published", true);
      return data ?? [];
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (input: { email: string; role: Role }) => {
      const { error } = await supabase.from("invitations").insert({
        organization_id: org!.organization_id, email: input.email, role: input.role, invited_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation created — share the join link from the pending list");
      qc.invalidateQueries({ queryKey: ["invites"] });
      setInviteOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const manualMutation = useMutation({
    mutationFn: async (input: {
      firstName: string; lastName: string; username: string; email: string;
      role: Role; department: string; startDate: string; endDate: string; trackIds: string[]; password: string;
      requiresDeescalation: boolean; requiresAbi: boolean;
    }) => {
      if (input.startDate && input.endDate && input.endDate < input.startDate) {
        throw new Error("End date must be on or after Start date.");
      }
      return await createManual({ data: {
        organizationId: org!.organization_id,
        firstName: input.firstName, lastName: input.lastName, username: input.username,
        email: input.email, temporaryPassword: input.password, role: input.role,
        department: input.department, hireDate: input.startDate,
        startDate: input.startDate, endDate: input.endDate,
        trackIds: input.trackIds,
        requiresDeescalation: input.requiresDeescalation,
        requiresAbi: input.requiresAbi,
      } });
    },

    onSuccess: (res, vars) => {
      toast.success("Employee account created");
      setCredentialsShown({ identifier: vars.email || vars.username, password: vars.password });
      setManualOpen(false);
      setTempPassword(genPassword());
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (input: { memberId: string; active: boolean }) => {
      const { error } = await supabase.from("organization_members")
        .update({ active: input.active }).eq("id", input.memberId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["members"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPwMutation = useMutation({
    mutationFn: async (input: { userId: string; newPassword: string }) => {
      await resetPwFn({ data: {
        organizationId: org!.organization_id, userId: input.userId, newPassword: input.newPassword,
      } });
    },
    onSuccess: (_d, vars) => {
      toast.success("Password reset");
      setCredentialsShown({ identifier: resetUser?.name ?? "Employee", password: vars.newPassword });
      setResetUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMemberMutation = useMutation({
    mutationFn: async (input: EditableMember) => {
      if (input.startDate && input.endDate && input.endDate < input.startDate) {
        throw new Error("End date must be on or after Start date.");
      }
      const { data: pRows, error: pErr } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          full_name: input.fullName,
          email: input.email || null,
          employee_id: input.employeeId || null,
          position: input.positions[0] ?? input.position ?? null,
          positions: input.positions ?? [],
          worker_type: input.workerType,
          start_date: input.startDate || null,
          end_date: input.endDate || null,
          hire_date: input.startDate || null,
          ce_suggested_topics: input.ceSuggestedTopics ?? [],
        } as any)
        .eq("id", input.userId)
        // Return the exact columns we wrote so a silent partial-write
        // (RLS column restriction, wrong id) is visible instead of a false "Saved" toast.
        .select("id, full_name, email, employee_id, position, positions, worker_type, start_date, end_date, hire_date");
      if (pErr) throw pErr;
      if (!pRows || pRows.length === 0) {
        throw new Error("Profile not updated — record not found or you don't have permission to edit it.");
      }
      const saved = pRows[0] as { full_name: string | null; email: string | null };
      if ((input.fullName ?? "") && saved.full_name !== input.fullName) {
        throw new Error("Name did not persist. Your role may not allow editing this profile column.");
      }

      // Rates are PII-gated: route through the server fn so the
      // can_view_staff_pii() check applies on writes too.
      await updatePiiFn({
        data: {
          organization_id: org!.organization_id,
          staff_id: input.userId,
          hourly_rate: input.hourlyRate === "" ? null : Number(input.hourlyRate),
          daily_rate: input.dailyRate === "" ? null : Number(input.dailyRate),
        },
      });

      const { data: mRows, error: mErr } = await supabase
        .from("organization_members")
        .update({ role: input.role, active: input.active })
        .eq("id", input.membershipId)
        .select("id");
      if (mErr) throw mErr;
      if (!mRows || mRows.length === 0) {
        throw new Error("Membership not updated — record not found or you don't have permission to change role/status.");
      }
      return { staffId: input.userId };
    },
    onSuccess: (res) => {
      toast.success("Employee updated");
      // Refresh both list and the profile-page query so navigating to the
      // staff profile shows the newly-saved values without a hard reload.
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["staff-pii"] });
      qc.invalidateQueries({ queryKey: ["staff-profile"] });
      if (res?.staffId) {
        qc.invalidateQueries({ queryKey: ["staff-profile", org?.organization_id, res.staffId] });
      }
      setEditingMember(null);
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
            {members?.filter((m) => m.active).length ?? 0} active
            {(invites?.length ?? 0) > 0 && ` · ${invites!.length} pending invite${invites!.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="border-primary/40 text-primary hover:bg-primary/5">
            <Link to="/dashboard/smart-import" search={{ mode: "employee" }}>
              <Sparkles className="mr-2 h-4 w-4" /> Smart Import
            </Link>
          </Button>

          <Button variant="outline" onClick={() => { setTempPassword(genPassword()); setManualOpen(true); }}>
            <ShieldPlus className="mr-2 h-4 w-4" /> Add manually
          </Button>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[image:var(--gradient-brand)] text-primary-foreground"><UserPlus className="mr-2 h-4 w-4" /> Invite by email</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Invite an employee</DialogTitle></DialogHeader>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                inviteMutation.mutate({ email: String(fd.get("email")), role: String(fd.get("role")) as Role });
              }} className="grid gap-4">
                <div className="grid gap-2"><Label htmlFor="email">Email address</Label><Input id="email" name="email" type="email" required /></div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Role</Label>
                  <Select name="role" defaultValue="employee">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter><Button type="submit" disabled={inviteMutation.isPending}>Create invitation</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!!invites?.length && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h3 className="text-sm font-semibold">Pending invitations</h3>
          <ul className="mt-3 divide-y divide-border">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-3 text-sm">
                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {i.email} <span className="text-xs text-muted-foreground">· {i.role}</span></div>
                <code className="rounded bg-secondary px-2 py-0.5 text-xs">{`${typeof window !== "undefined" ? window.location.origin : ""}/signup?invite=${i.token}`}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="max-h-[calc(100vh-16rem)] overflow-auto">
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
              {members?.map((m) => {
                const name = m.profile?.full_name ?? "—";
                const login = m.profile?.username ?? m.profile?.email ?? "—";
                const needsReset = m.profile?.must_change_password;
                const position = (m.profile?.position ?? "") as Position | "";
                const startDate = (m.profile?.start_date ?? m.profile?.hire_date ?? null) as string | null;
                const initials = (name || "—")
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p: string) => p[0]?.toUpperCase() ?? "")
                  .join("") || "—";
                const openProfile = () => {
                  window.location.href = `/dashboard/employees/${m.user_id}`;
                };
                const openEdit = () => {
                  const topics = ((m.profile as { ce_suggested_topics?: string[] | null } | undefined)?.ce_suggested_topics ?? []) as string[];
                  setEditTopics(topics);
                  const positionsArr = ((m.profile as { positions?: string[] | null } | undefined)?.positions ?? []) as string[];
                  const initialPositions = positionsArr.filter((x): x is Position => POSITIONS.includes(x as Position));
                  setEditPositions(initialPositions.length ? initialPositions : (position ? [position as Position] : []));
                  setEditingMember({
                    membershipId: m.id,
                    userId: m.user_id,
                    fullName: m.profile?.full_name ?? "",
                    email: m.profile?.email ?? "",
                    employeeId: m.profile?.employee_id ?? "",
                    role: m.role as Role,
                    active: m.active,
                    position,
                    positions: (() => {
                      const arr = ((m.profile as { positions?: string[] | null } | undefined)?.positions ?? []) as string[];
                      const list = arr.filter((x): x is Position => POSITIONS.includes(x as Position));
                      if (list.length) return list;
                      return position ? [position as Position] : [];
                    })(),
                    workerType: (m.profile?.worker_type === "1099" ? "1099" : "w2") as WorkerType,
                    hourlyRate: piiByStaff.get(m.user_id)?.hourly_rate != null ? String(piiByStaff.get(m.user_id)!.hourly_rate) : "",
                    dailyRate: piiByStaff.get(m.user_id)?.daily_rate != null ? String(piiByStaff.get(m.user_id)!.daily_rate) : "",
                    startDate: (m.profile?.start_date ?? m.profile?.hire_date ?? "") as string,
                    endDate: (m.profile?.end_date ?? "") as string,
                    ceSuggestedTopics: topics,
                  });
                };
                const trainings = trainingByStaff.get(m.user_id) ?? [];
                return (
                  <React.Fragment key={m.id}>
                  <tr
                    className="cursor-pointer h-12 border-b border-border/50 hover:bg-muted/50 transition-colors"
                    onClick={openProfile}
                  >
                    <td className="px-4 py-2 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                          {initials}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 truncate">
                            <span className="truncate">{name}</span>
                            {needsReset && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 whitespace-nowrap">
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
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs uppercase">{m.role}</span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          (m.active
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground")
                        }
                      >
                        {m.active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {startDate
                        ? new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap w-[220px]" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCaseloadFor({ id: m.user_id, name, role: m.job_title || m.role })}
                        >
                          <UsersIcon className="mr-1 h-3.5 w-3.5" /> Manage Caseload
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="More actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={openEdit}>
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setResetUser({ id: m.user_id, name })}>
                              <KeyRound className="mr-2 h-3.5 w-3.5" /> Reset password
                            </DropdownMenuItem>
                            {m.user_id !== user?.id && (
                              <DropdownMenuItem
                                onSelect={() => toggleActiveMutation.mutate({ memberId: m.id, active: !m.active })}
                                className={m.active ? "text-destructive focus:text-destructive" : ""}
                              >
                                {m.active ? (
                                  <><UserX className="mr-2 h-3.5 w-3.5" /> Deactivate</>
                                ) : (
                                  <><UserCheck className="mr-2 h-3.5 w-3.5" /> Reactivate</>
                                )}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                  {trainings.length > 0 && (
                    <tr className="border-b border-border last:border-0 bg-muted/20">
                      <td colSpan={6} className="px-4 pb-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">DSPD required trainings</div>
                        <StaffTrainingStrip trainings={trainings} hiveTrainingEnabled={hiveTrainingEnabled} />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>


      {/* Add manually */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add employee manually</DialogTitle>
            <DialogDescription>Creates the account immediately. No email invitation is sent.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const trackIds = (fd.getAll("track_ids") as string[]).filter(Boolean);
            manualMutation.mutate({
              firstName: String(fd.get("first_name") || "").trim(),
              lastName: String(fd.get("last_name") || "").trim(),
              username: String(fd.get("username") || "").trim(),
              email: String(fd.get("email") || "").trim(),
              role: String(fd.get("role") || "employee") as Role,
              department: String(fd.get("department") || "").trim(),
              startDate: String(fd.get("start_date") || ""),
              endDate: String(fd.get("end_date") || ""),

              trackIds,
              password: String(fd.get("password") || tempPassword),
              requiresDeescalation: fd.get("requires_deescalation") === "on",
              requiresAbi: fd.get("requires_abi") === "on",
            });
          }} className="grid gap-4">

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="first_name">First name</Label><Input id="first_name" name="first_name" required /></div>
              <div className="grid gap-2"><Label htmlFor="last_name">Last name</Label><Input id="last_name" name="last_name" required /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="username">Username</Label><Input id="username" name="username" required pattern="[a-zA-Z0-9._-]+" /></div>
              <div className="grid gap-2"><Label htmlFor="email">Email (optional)</Label><Input id="email" name="email" type="email" /></div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Temporary password</Label>
              <div className="flex gap-2">
                <Input id="password" name="password" defaultValue={tempPassword} key={tempPassword} required minLength={8} />
                <Button type="button" variant="outline" onClick={() => setTempPassword(genPassword())}>Regenerate</Button>
                <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(tempPassword); toast.success("Copied"); }}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
              <p className="text-xs text-muted-foreground">Employee will be prompted to change this on first login.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Select name="role" defaultValue="employee">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label htmlFor="department">Department / team</Label><Input id="department" name="department" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="start_date">Start date <span className="text-destructive">*</span></Label><Input id="start_date" name="start_date" type="date" required /><p className="text-xs text-muted-foreground">All training deadlines are calculated from this date.</p></div>
              <div className="grid gap-2"><Label htmlFor="end_date">End date (optional)</Label><Input id="end_date" name="end_date" type="date" /></div>
            </div>

            <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="requires_deescalation" className="mt-1 rounded" />
                <span>
                  <span className="font-medium">Works with behavior clients?</span>
                  <span className="block text-xs text-muted-foreground">
                    Check if this employee works with clients who have behavior codes (BC1, BC2, BC3) or a Behavior Support Plan.
                    De-escalation Certification will be required.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="requires_abi" className="mt-1 rounded" />
                <span>
                  <span className="font-medium">Works with ABI clients?</span>
                  <span className="block text-xs text-muted-foreground">
                    Check if this employee works with ABI (acquired brain injury) clients. ABI Training will be required.
                  </span>
                </span>
              </label>
            </div>



            {!!tracks?.length && (
              <div className="grid gap-2">
                <Label>Assigned training tracks</Label>
                <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
                  {tracks.map((t) => (
                    <label key={t.id} className="flex items-center gap-2">
                      <input type="checkbox" name="track_ids" value={t.id} className="rounded" />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={manualMutation.isPending} className="bg-[image:var(--gradient-brand)] text-primary-foreground">
                {manualMutation.isPending ? "Creating…" : "Create employee"}
              </Button>
            </DialogFooter>
          </form>
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
                <Button type="button" variant="outline" onClick={() => setTempPassword(genPassword())}>Regenerate</Button>
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
          <DialogFooter><Button onClick={() => setCredentialsShown(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit employee */}
      <Dialog
        open={!!editingMember}
        onOpenChange={(o) => {
          if (o) return;
          if (editDirty && !window.confirm("Discard unsaved changes?")) return;
          setEditingMember(null);
          setEditDirty(false);
        }}
      >
        <DialogContent className="flex max-h-[100dvh] w-[calc(100%-1rem)] max-w-lg flex-col gap-0 p-0 sm:max-h-[90vh] sm:w-full">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
            <DialogTitle className="pr-8">Edit employee</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Update profile, role, and employment status. Changes save when you tap Save.
            </DialogDescription>
          </DialogHeader>
          {editingMember && (
            <form
              id="edit-employee-form"
              onChange={() => { if (!editDirty) setEditDirty(true); }}
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                editMemberMutation.mutate({
                  membershipId: editingMember.membershipId,
                  userId: editingMember.userId,
                  fullName: String(fd.get("full_name") || "").trim(),
                  email: String(fd.get("email") || "").trim(),
                  employeeId: String(fd.get("employee_id") || "").trim(),
                  role: String(fd.get("role") || "employee") as Role,
                  active: String(fd.get("active") || "true") === "true",
                  position: (editPositions[0] ?? "") as Position | "",
                  positions: editPositions,
                  workerType: (String(fd.get("worker_type") || "w2") as WorkerType),
                  hourlyRate: String(fd.get("hourly_rate") || "").trim(),
                  dailyRate: String(fd.get("daily_rate") || "").trim(),
                  startDate: String(fd.get("start_date") || "").trim(),
                  endDate: String(fd.get("end_date") || "").trim(),
                  ceSuggestedTopics: editTopics,
                });
                setEditDirty(false);
              }}
              className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6"
            >
              <div className="grid gap-2"><Label htmlFor="full_name">Full name</Label><Input id="full_name" name="full_name" defaultValue={editingMember.fullName} required /></div>
              <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" defaultValue={editingMember.email} /></div>
              <div className="grid gap-2"><Label htmlFor="employee_id">Employee ID</Label><Input id="employee_id" name="employee_id" defaultValue={editingMember.employeeId} placeholder="e.g. EMP-1042" /></div>
              <div className="grid gap-2">
                <Label>Agency Position</Label>
                <p className="text-[11px] text-muted-foreground">Select one or more.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {POSITIONS.map((p) => {
                    const checked = editPositions.includes(p);
                    const id = `edit-position-${p.replace(/\s+/g, "-").toLowerCase()}`;
                    return (
                      <label
                        key={p}
                        htmlFor={id}
                        className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 hover:bg-muted/40"
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(v) => {
                            setEditDirty(true);
                            setEditPositions((prev) =>
                              v ? Array.from(new Set([...prev, p])) : prev.filter((x) => x !== p),
                            );
                          }}
                        />
                        <span className="text-sm">{p}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="edit-role">System role</Label>
                  <Select name="role" defaultValue={editingMember.role}>
                    <SelectTrigger id="edit-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Staff</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-active">Employment status</Label>
                  <Select name="active" defaultValue={editingMember.active ? "true" : "false"}>
                    <SelectTrigger id="edit-active"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Deactivated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="start_date">Start date</Label>
                  <Input id="start_date" name="start_date" type="date" defaultValue={editingMember.startDate || ""} />
                  <p className="text-[10px] text-muted-foreground">Drives Continuing Education eligibility & year window.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end_date">End date (optional)</Label>
                  <Input id="end_date" name="end_date" type="date" defaultValue={editingMember.endDate || ""} />
                  <p className="text-[10px] text-muted-foreground">Blank for active employees. Pauses new CE; history retained.</p>
                </div>
              </div>


              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pay & classification
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Used by NECTAR to estimate gross pay each pay period (pre-tax).
                </p>
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-worker-type">Worker type</Label>
                    <Select name="worker_type" defaultValue={editingMember.workerType}>
                      <SelectTrigger id="edit-worker-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="w2">W-2 employee</SelectItem>
                        <SelectItem value="1099">1099 contractor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="hourly_rate">Hourly rate ($)</Label>
                      <Input
                        id="hourly_rate"
                        name="hourly_rate"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        defaultValue={editingMember.hourlyRate}
                        placeholder="e.g. 18.50"
                      />
                      <p className="text-[10px] text-muted-foreground">Applies to hourly service codes (EVV punches).</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="daily_rate">Daily rate ($)</Label>
                      <Input
                        id="daily_rate"
                        name="daily_rate"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        defaultValue={editingMember.dailyRate}
                        placeholder="e.g. 120.00"
                      />
                      <p className="text-[10px] text-muted-foreground">Applies to daily codes (HHS, RHS, DSG, RL6, RP3–RP5).</p>
                    </div>
                  </div>
                </div>
              </div>

              <SuggestedTopicsInput
                value={editTopics}
                onChange={(next) => { setEditTopics(next); if (!editDirty) setEditDirty(true); }}
              />
              <CustomAttributesSection
                organizationId={org?.organization_id}
                entityKind="employee"
                entityId={editingMember.userId}
              />
              {/* HR checklist + PII live on the staff profile page (HR tab). */}
              <LifecyclePanel
                kind="employee"
                id={editingMember.userId}
                fullName={editingMember.fullName}
                organizationId={org?.organization_id}
                onDone={() => { setEditingMember(null); setEditDirty(false); }}
              />
            </form>
          )}
          <div className="shrink-0 border-t border-border bg-background px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (editDirty && !window.confirm("Discard unsaved changes?")) return;
                  setEditingMember(null);
                  setEditDirty(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="edit-employee-form"
                disabled={editMemberMutation.isPending}
                className="bg-amber-500 text-amber-950 hover:bg-amber-400"
              >
                {editMemberMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CaseloadDrawer
        member={caseloadFor}
        organizationId={org?.organization_id ?? null}
        onClose={() => setCaseloadFor(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Caseload Assignment Drawer                                                 */
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
