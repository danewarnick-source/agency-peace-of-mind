import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { createEmployeeManually, adminResetEmployeePassword } from "@/lib/employees.functions";
import { createInvitation, revokeInvitation } from "@/lib/invitations.functions";
import { inviteJoinUrl } from "@/lib/join-invite";
import { getHrComplianceMatrix } from "@/lib/hr-staff.functions";
import { StaffCompliancePanel } from "@/components/hr/staff-compliance-panel";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Mail, UserPlus, KeyRound, Copy, UserCheck, UserX, ShieldPlus, Users as UsersIcon, Search, Loader2, Sparkles, MoreHorizontal, Ban, ExternalLink, Settings, FileSpreadsheet } from "lucide-react";
import { StaffFieldsPanel } from "@/components/hr/staff-fields-panel";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { OnboardingReturnBar } from "@/components/onboarding/onboarding-return-bar";
import { OnboardingGuidanceBanner } from "@/components/onboarding/onboarding-guidance-banner";

import { RequirePermission } from "@/components/rbac-guard";
// CSV Import and Smart Import both open the existing Smart Import wizard.
// CSV/Excel is heuristic (no Bedrock). PDFs still go through NECTAR.
import { PersonAvatar } from "@/components/person/person-avatar";
import { TrainingRequirementField } from "@/components/hr/training-requirement-field";
import type { Position } from "@/lib/employee-positions";
import {
  normalizeConfig,
  WORKER_TYPE_OPTIONS,
  type StaffIntakeFieldsConfig,
} from "@/components/hr/staff-fields-panel";

function genPassword(len = 14) {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => charset[n % charset.length]).join("");
}

export const Route = createFileRoute("/dashboard/employees/")({
  component: () => (
    <RequirePermission perm="view_staff_records">
      <EmployeesPage />
    </RequirePermission>
  ),
});

type Role = "admin" | "manager" | "employee";

export function EmployeesPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [resetUser, setResetUser] = useState<{ id: string; name: string } | null>(null);
  const [tempPassword, setTempPassword] = useState(() => genPassword());
  const [credentialsShown, setCredentialsShown] = useState<{ identifier: string; password: string; newStaffId?: string } | null>(null);
  const [caseloadFor, setCaseloadFor] = useState<{ id: string; name: string; role: string } | null>(null);
  // Manual "add employee" onboarding form: de-escalation / ABI requirement
  // defaults to Required until the admin deliberately reviews it.
  const [manualRequiresDeescalation, setManualRequiresDeescalation] = useState(true);
  const [manualRequiresAbi, setManualRequiresAbi] = useState(true);
  // Compliance panel state
  const [compliancePanelStaff, setCompliancePanelStaff] = useState<{ id: string; name: string; isNew?: boolean } | null>(null);
  const [staffFieldsOpen, setStaffFieldsOpen] = useState(false);
  // Optional intake-field values for the "Add manually" form, driven by the
  // org's staff_intake_fields config
  const [manualStaffType, setManualStaffType] = useState<string[]>([]);
  const [manualDepartment, setManualDepartment] = useState("");
  const [manualEmployeeId, setManualEmployeeId] = useState("");
  const [manualWorkerType, setManualWorkerType] = useState("");
  const [manualCustomFieldValues, setManualCustomFieldValues] = useState<Record<string, unknown>>({});

  const resetOptionalFields = () => {
    setManualStaffType([]);
    setManualDepartment("");
    setManualEmployeeId("");
    setManualWorkerType("");
    setManualCustomFieldValues({});
  };

  const { data: staffIntakeConfig } = useQuery({
    enabled: !!org,
    queryKey: ["staff-intake-fields", org?.organization_id],
    queryFn: async (): Promise<StaffIntakeFieldsConfig> => {
      const { data } = await supabase
        .from("organizations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("feature_config" as any)
        .eq("id", org!.organization_id)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fc = (data as any)?.feature_config ?? null;
      return normalizeConfig(fc?.staff_intake_fields);
    },
  });

  const fetchMatrix = useServerFn(getHrComplianceMatrix);
  const { data: complianceMatrix } = useQuery({
    enabled: !!org,
    queryKey: ["hr-matrix", org?.organization_id],
    queryFn: () => fetchMatrix({ data: { organization_id: org!.organization_id } }),
  });

  // Derive per-staff compliance summary from the org-level matrix (single fetch, not N+1)
  const complianceByStaff = useMemo(() => {
    const matrix = complianceMatrix;
    if (!matrix) return new Map<string, { overdue: number; expiring: number; pending: number }>();
    const today = Date.now();
    const in60Ms = today + 60 * 86_400_000;
    const result = new Map<string, { overdue: number; expiring: number; pending: number }>();
    for (const staff of matrix.staff) {
      let overdueCount = 0;
      let expiringCount = 0;
      let pendingCount = 0;
      for (const req of matrix.requirements) {
        const cell = staff.cells[req.requirement_id];
        if (!cell || cell.applicable === false) continue;
        const status = cell.status as string;
        const expMs = cell.expires_at ? new Date(cell.expires_at as string).getTime() : null;
        const isExpired = status === "expired" || (expMs !== null && expMs < today);
        const isSoon = expMs !== null && expMs >= today && expMs <= in60Ms;
        if (isExpired) overdueCount++;
        else if (isSoon) expiringCount++;
        else if (status !== "complete" && status !== "waived") pendingCount++;
      }
      result.set(staff.staff_id, { overdue: overdueCount, expiring: expiringCount, pending: pendingCount });
    }
    return result;
  }, [complianceMatrix]);

  const createManual = useServerFn(createEmployeeManually);
  const resetPwFn = useServerFn(adminResetEmployeePassword);
  const createInviteFn = useServerFn(createInvitation);
  const revokeInviteFn = useServerFn(revokeInvitation);

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
        .select("id, full_name, email, username, must_change_password, department, hire_date, start_date, employee_id, position, account_status, worker_type, photo_path, photo_updated_at" as any)
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

  const inviteMutation = useMutation({
    mutationFn: async (input: { email: string; role: Role }) => {
      return await createInviteFn({
        data: {
          organization_id: org!.organization_id,
          email: input.email,
          role: input.role,
          site_origin: window.location.origin,
        },
      });
    },
    onSuccess: (res) => {
      if (res.email_sent) {
        toast.success(
          `Invitation emailed to ${res.invitation.email}. They can open the join link to set a password and join this organization.`,
        );
      } else {
        toast.warning(
          `Invitation created, but the email couldn't be sent (${res.email_error ?? "unknown error"}). Share the join link from the pending list instead.`,
        );
      }
      qc.invalidateQueries({ queryKey: ["invites"] });
      setInviteOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return await revokeInviteFn({
        data: { organization_id: org!.organization_id, invitation_id: invitationId },
      });
    },
    onSuccess: (res) => {
      toast.success(`Invitation revoked for ${res?.invitation?.email ?? "user"}`);
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const manualMutation = useMutation({
    mutationFn: async (input: {
      firstName: string; lastName: string; email: string; phone: string;
      role: Role; startDate: string; endDate: string; trackIds: string[]; password: string;
      requiresDeescalation: boolean; requiresAbi: boolean;
      staffType: string[]; department: string; employeeId: string; workerType: string;
      customFieldValues: Record<string, unknown>;
    }) => {
      if (input.startDate && input.endDate && input.endDate < input.startDate) {
        throw new Error("End date must be on or after Start date.");
      }
      return await createManual({ data: {
        organizationId: org!.organization_id,
        firstName: input.firstName, lastName: input.lastName,
        email: input.email, phone: input.phone, temporaryPassword: input.password, role: input.role,
        hireDate: input.startDate,
        startDate: input.startDate, endDate: input.endDate,
        trackIds: input.trackIds,
        requiresDeescalation: input.requiresDeescalation,
        requiresAbi: input.requiresAbi,
        staffType: input.staffType,
        department: input.department,
        employeeId: input.employeeId,
        workerType: input.workerType,
        customFieldValues: input.customFieldValues,
      } });
    },

    onSuccess: (res, vars) => {
      toast.success("Employee account created");
      setCredentialsShown({ identifier: vars.email, password: vars.password, newStaffId: res?.userId || undefined });
      setManualOpen(false);
      setTempPassword(genPassword());
      resetOptionalFields();
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
          <Button asChild variant="outline">
            <Link to="/dashboard/smart-import" search={{ mode: "employee" }}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Import CSV
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard/smart-import" search={{ mode: "employee" }}>
              <Sparkles className="mr-2 h-4 w-4" /> Smart Import
            </Link>
          </Button>

          <Button variant="outline" onClick={() => { setTempPassword(genPassword()); setManualRequiresDeescalation(true); setManualRequiresAbi(true); resetOptionalFields(); setManualOpen(true); }}>
            <ShieldPlus className="mr-2 h-4 w-4" /> Add manually
          </Button>
          <Button variant="outline" onClick={() => setStaffFieldsOpen(true)}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </Button>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="mr-2 h-4 w-4" /> Invite by email</Button>
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
          <p className="text-xs text-muted-foreground">
            Pending people join <strong>this</strong> organization via the link (not new-agency signup). Add manually still works if you would rather share a temp password.
          </p>
          <ul className="mt-3 divide-y divide-border">
            {invites.map((i) => {
              const link = inviteJoinUrl(typeof window !== "undefined" ? window.location.origin : "", i.token);
              return (
                <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="flex items-center gap-2 truncate"><Mail className="h-4 w-4 shrink-0 text-muted-foreground" /> <span className="truncate">{i.email}</span> <span className="shrink-0 text-xs text-muted-foreground">· {i.role}</span></div>
                  <div className="flex shrink-0 items-center gap-1">
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

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Mobile card list — the table overflows on small screens, so below
            md we render the same roster as stacked cards instead. */}
        <div className="block divide-y divide-border md:hidden">
          {members?.map((m) => {
            const name = m.profile?.full_name ?? "—";
            const codes = serviceCodesByStaff.get(m.user_id) ?? [];
            const openProfile = () => { window.location.href = `/dashboard/employees/${m.user_id}`; };
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
                      (m.active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    {m.active ? "Active" : "Deactivated"}
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
                <div className="flex items-center justify-end pt-1" data-no-row-nav onClick={(e) => e.stopPropagation()}>
                  <a
                    href={`/dashboard/employees/${m.user_id}?tab=checklist`}
                    className="flex items-center gap-1 text-sm font-medium text-primary"
                  >
                    View <ExternalLink className="h-3.5 w-3.5" />
                  </a>
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
              {members?.map((m) => {
                const name = m.profile?.full_name ?? "—";
                const login = m.profile?.username ?? m.profile?.email ?? "—";
                const needsReset = m.profile?.must_change_password;
                const position = (m.profile?.position ?? "") as Position | "";
                const startDate = (m.profile?.start_date ?? m.profile?.hire_date ?? null) as string | null;
                // Roster avatar now uses <PersonAvatar>, which handles the
                // initials fallback itself when photo_path is null.
                const openProfile = () => {
                  window.location.href = `/dashboard/employees/${m.user_id}`;
                };
                const compliance = complianceByStaff.get(m.user_id);
                const hasOverdue = (compliance?.overdue ?? 0) > 0;
                const hasExpiring = (compliance?.expiring ?? 0) > 0;
                const hasPending = (compliance?.pending ?? 0) > 0;
                const needsAction = hasOverdue || hasExpiring || hasPending;
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
                          (m.active
                            ? "hive-status-active"
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
                    <td className="px-4 py-2 text-right whitespace-nowrap w-[280px]" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {/* Compliance badge — tappable, opens checklist panel */}
                        {compliance !== undefined && (
                          <button
                            type="button"
                            className={
                              "rounded-full px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-opacity hover:opacity-80 " +
                              (hasOverdue
                                ? "hive-status-danger"
                                : hasExpiring || hasPending
                                  ? "bg-[var(--hive-gold-soft)] text-[var(--hive-on-gold)]"
                                  : "hive-status-active")
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setCompliancePanelStaff({ id: m.user_id, name });
                            }}
                          >
                            {hasOverdue
                              ? `${compliance.overdue} overdue`
                              : needsAction
                                ? `${(compliance.expiring + compliance.pending)} needed`
                                : "Complete"}
                          </button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a href={`/dashboard/employees/${m.user_id}?tab=checklist`}>
                            View <ExternalLink className="ml-1 h-3 w-3" />
                          </a>
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
              email: String(fd.get("email") || "").trim(),
              phone: String(fd.get("phone") || "").trim(),
              role: String(fd.get("role") || "employee") as Role,
              startDate: String(fd.get("hire_date") || ""),
              endDate: String(fd.get("end_date") || ""),

              trackIds,
              password: String(fd.get("password") || tempPassword),
              requiresDeescalation: manualRequiresDeescalation,
              requiresAbi: manualRequiresAbi,
              staffType: manualStaffType,
              department: manualDepartment,
              employeeId: manualEmployeeId,
              workerType: manualWorkerType,
              customFieldValues: manualCustomFieldValues,
            });
          }} className="grid gap-4">

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="first_name">First name</Label><Input id="first_name" name="first_name" required /></div>
              <div className="grid gap-2"><Label htmlFor="last_name">Last name</Label><Input id="last_name" name="last_name" required /></div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email address · used for sign-in <span className="text-destructive">*</span></Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" name="phone" type="tel" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="hire_date">Hire date <span className="text-destructive">*</span></Label><Input id="hire_date" name="hire_date" type="date" required /><p className="text-xs text-muted-foreground">All training deadlines are calculated from this date.</p></div>
              <div className="grid gap-2"><Label htmlFor="end_date">End date (optional)</Label><Input id="end_date" name="end_date" type="date" /></div>
            </div>
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
            <div className="grid gap-2">
              <Label htmlFor="password">Temporary password</Label>
              <div className="flex gap-2">
                <Input id="password" name="password" defaultValue={tempPassword} key={tempPassword} required minLength={8} />
                <Button type="button" variant="outline" onClick={() => setTempPassword(genPassword())}>Regenerate</Button>
                <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(tempPassword); toast.success("Copied"); }}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
              <p className="text-xs text-muted-foreground">Employee will be prompted to change this on first login.</p>
            </div>

            <OptionalIntakeFields
              config={staffIntakeConfig}
              staffType={manualStaffType}
              onStaffTypeChange={setManualStaffType}
              department={manualDepartment}
              onDepartmentChange={setManualDepartment}
              employeeId={manualEmployeeId}
              onEmployeeIdChange={setManualEmployeeId}
              workerType={manualWorkerType}
              onWorkerTypeChange={setManualWorkerType}
              customFieldValues={manualCustomFieldValues}
              onCustomFieldValuesChange={setManualCustomFieldValues}
              onOpenSettings={() => setStaffFieldsOpen(true)}
            />

            <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Behavior-related training requirements
              </p>
              <TrainingRequirementField
                label="De-escalation training"
                hint="Typically required for staff assigned to a behavior-coded client (BC1/2/3) or a client with a Behavior Support Plan."
                value={manualRequiresDeescalation}
                onChange={setManualRequiresDeescalation}
                atRisk={false}
                warningText=""
              />
              <TrainingRequirementField
                label="ABI training"
                hint="Typically required for staff assigned to a client with an ABI (acquired brain injury) designation."
                value={manualRequiresAbi}
                onChange={setManualRequiresAbi}
                atRisk={false}
                warningText=""
              />
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
              <Button type="submit" disabled={manualMutation.isPending} className="bg-[var(--hive-gold)] text-[var(--hive-on-gold)]">
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
          <DialogFooter>
            <Button
              onClick={() => {
                const newStaffId = credentialsShown?.newStaffId;
                setCredentialsShown(null);
                if (newStaffId) window.location.href = `/dashboard/employees/${newStaffId}?tab=record`;
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

      {org && compliancePanelStaff && (
        <StaffCompliancePanel
          open={!!compliancePanelStaff}
          onOpenChange={(v) => !v && setCompliancePanelStaff(null)}
          organizationId={org.organization_id}
          staffId={compliancePanelStaff.id}
          staffName={compliancePanelStaff.name}
          isNewEmployee={compliancePanelStaff.isNew}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Optional intake fields (driven by org's staff_intake_fields config)       */
/* ------------------------------------------------------------------------- */

function OptionalIntakeFields({
  config,
  staffType, onStaffTypeChange,
  department, onDepartmentChange,
  employeeId, onEmployeeIdChange,
  workerType, onWorkerTypeChange,
  customFieldValues, onCustomFieldValuesChange,
  onOpenSettings,
}: {
  config: StaffIntakeFieldsConfig | undefined;
  staffType: string[];
  onStaffTypeChange: (v: string[]) => void;
  department: string;
  onDepartmentChange: (v: string) => void;
  employeeId: string;
  onEmployeeIdChange: (v: string) => void;
  workerType: string;
  onWorkerTypeChange: (v: string) => void;
  customFieldValues: Record<string, unknown>;
  onCustomFieldValuesChange: (v: Record<string, unknown>) => void;
  onOpenSettings: () => void;
}) {
  if (!config) return null;

  const atHireCustomFields = config.custom_fields.filter((f) => f.at_hire);
  const hasAnyOptionalField =
    config.staff_type.enabled ||
    config.department.enabled ||
    config.employee_id.enabled ||
    config.worker_type.enabled ||
    atHireCustomFields.length > 0;

  const setCustomFieldValue = (id: string, value: unknown) => {
    onCustomFieldValuesChange({ ...customFieldValues, [id]: value });
  };

  if (!hasAnyOptionalField) {
    return (
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">
          No optional fields configured.{" "}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onOpenSettings}>
            Configure staff fields
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Your organization's fields
      </p>

      {!config.staff_type.enabled && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          <span>
            Staff type is not enabled — training requirements won't auto-activate until set on this staff
            member's profile. Enable in staff field settings.
          </span>
          <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={onOpenSettings}>
            Open settings
          </Button>
        </div>
      )}

      {config.staff_type.enabled && (
        <div className="grid gap-2">
          <Label>Staff type · drives training requirements</Label>
          <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
            {(config.staff_type.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-2">
                <Checkbox
                  checked={staffType.includes(opt)}
                  onCheckedChange={(v) => {
                    onStaffTypeChange(
                      v === true ? [...staffType, opt] : staffType.filter((s) => s !== opt),
                    );
                  }}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      )}

      {config.department.enabled && (
        <div className="grid gap-2">
          <Label>Department</Label>
          <Select value={department} onValueChange={onDepartmentChange}>
            <SelectTrigger><SelectValue placeholder="Select a department" /></SelectTrigger>
            <SelectContent>
              {(config.department.options ?? []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {config.employee_id.enabled && (
        <div className="grid gap-2">
          <Label htmlFor="employee_id">Employee ID (optional)</Label>
          <Input
            id="employee_id"
            value={employeeId}
            onChange={(e) => onEmployeeIdChange(e.target.value)}
          />
        </div>
      )}

      {config.worker_type.enabled && (
        <div className="grid gap-2">
          <Label>Worker type</Label>
          <Select value={workerType} onValueChange={onWorkerTypeChange}>
            <SelectTrigger><SelectValue placeholder="Select worker type" /></SelectTrigger>
            <SelectContent>
              {WORKER_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {atHireCustomFields.map((field) => (
        <div key={field.id} className="grid gap-2">
          <Label htmlFor={`cf-${field.id}`} className="flex items-center gap-2">
            {field.name}
            <Badge variant="outline" className="text-[10px]">Custom</Badge>
          </Label>
          {field.type === "text" && (
            <Input
              id={`cf-${field.id}`}
              value={(customFieldValues[field.id] as string) ?? ""}
              onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
            />
          )}
          {field.type === "date" && (
            <Input
              id={`cf-${field.id}`}
              type="date"
              value={(customFieldValues[field.id] as string) ?? ""}
              onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
            />
          )}
          {field.type === "number" && (
            <Input
              id={`cf-${field.id}`}
              type="number"
              value={(customFieldValues[field.id] as string) ?? ""}
              onChange={(e) => setCustomFieldValue(field.id, e.target.value)}
            />
          )}
          {field.type === "yesno" && (
            <Select
              value={(customFieldValues[field.id] as string) ?? ""}
              onValueChange={(v) => setCustomFieldValue(field.id, v)}
            >
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          )}
          {field.type === "dropdown" && (
            <Select
              value={(customFieldValues[field.id] as string) ?? ""}
              onValueChange={(v) => setCustomFieldValue(field.id, v)}
            >
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {field.options.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}
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
