import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { createEmployeeManually, adminResetEmployeePassword } from "@/lib/employees.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Mail, UserPlus, BookOpen, KeyRound, Copy, UserCheck, UserX, ShieldPlus, Pencil, Users as UsersIcon, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { RequirePermission } from "@/components/rbac-guard";

function genPassword(len = 14) {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => charset[n % charset.length]).join("");
}

export const Route = createFileRoute("/dashboard/employees")({
  component: () => (
    <RequirePermission perm="manage_users">
      <EmployeesPage />
    </RequirePermission>
  ),
});

type Role = "admin" | "manager" | "employee";

type EditableMember = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  employeeId: string;
  role: Role;
  active: boolean;
};

function EmployeesPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [resetUser, setResetUser] = useState<{ id: string; name: string } | null>(null);
  const [tempPassword, setTempPassword] = useState(() => genPassword());
  const [credentialsShown, setCredentialsShown] = useState<{ identifier: string; password: string } | null>(null);
  const [editingMember, setEditingMember] = useState<EditableMember | null>(null);
  const [caseloadFor, setCaseloadFor] = useState<{ id: string; name: string; role: string } | null>(null);

  const createManual = useServerFn(createEmployeeManually);
  const resetPwFn = useServerFn(adminResetEmployeePassword);

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
        .select("id, full_name, email, username, must_change_password, department, hire_date, employee_id")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((m) => ({ ...m, profile: profMap.get(m.user_id) }));
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


  const assignMutation = useMutation({
    mutationFn: async (input: { userId: string; courseId: string; dueDate: string | null }) => {
      const { error } = await supabase.from("course_assignments").insert({
        course_id: input.courseId, user_id: input.userId, organization_id: org!.organization_id,
        assigned_by: user!.id, due_date: input.dueDate || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Course assigned"); setAssignOpen(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const manualMutation = useMutation({
    mutationFn: async (input: {
      firstName: string; lastName: string; username: string; email: string;
      role: Role; department: string; hireDate: string; trackIds: string[]; password: string;
    }) => {
      return await createManual({ data: {
        organizationId: org!.organization_id,
        firstName: input.firstName, lastName: input.lastName, username: input.username,
        email: input.email, temporaryPassword: input.password, role: input.role,
        department: input.department, hireDate: input.hireDate, trackIds: input.trackIds,
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
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          full_name: input.fullName,
          email: input.email || null,
          employee_id: input.employeeId || null,
        })
        .eq("id", input.userId);
      if (pErr) throw pErr;

      const { error: mErr } = await supabase
        .from("organization_members")
        .update({ role: input.role, active: input.active })
        .eq("id", input.membershipId);
      if (mErr) throw mErr;
    },
    onSuccess: () => {
      toast.success("Employee updated");
      qc.invalidateQueries({ queryKey: ["members"] });
      setEditingMember(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="text-base font-semibold">Team members</h2>
          <p className="text-sm text-muted-foreground">{members?.length ?? 0} active · billed at $25/employee/mo</p>
        </div>
        <div className="flex flex-wrap gap-2">
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

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-4 text-left">Name</th>
              <th className="p-4 text-left">Login</th>
              <th className="p-4 text-left">Role</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-left">Joined</th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody>
            {members?.map((m) => {
              const name = m.profile?.full_name ?? "—";
              const login = m.profile?.username ?? m.profile?.email ?? "—";
              const needsReset = m.profile?.must_change_password;
              return (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="p-4 font-medium">{name}{needsReset && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">Pending first login</span>}</td>
                  <td className="p-4 text-muted-foreground">{login}</td>
                  <td className="p-4"><span className="rounded-full bg-secondary px-2 py-0.5 text-xs uppercase">{m.role}</span></td>
                  <td className="p-4 text-xs">{m.active ? <span className="text-emerald-600">Active</span> : <span className="text-muted-foreground">Deactivated</span>}</td>
                  <td className="p-4 text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</td>
                  <td className="p-4 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setEditingMember({
                      membershipId: m.id,
                      userId: m.user_id,
                      fullName: m.profile?.full_name ?? "",
                      email: m.profile?.email ?? "",
                      employeeId: m.profile?.employee_id ?? "",
                      role: m.role as Role,
                      active: m.active,
                    })}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => setCaseloadFor({ id: m.user_id, name, role: m.job_title || m.role })}>
                      <UsersIcon className="mr-1 h-3.5 w-3.5" /> 👥 Manage Caseload
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setAssignOpen(m.user_id)}><BookOpen className="mr-1 h-3.5 w-3.5" /> Assign</Button>
                    <Button variant="ghost" size="sm" onClick={() => setResetUser({ id: m.user_id, name })}><KeyRound className="mr-1 h-3.5 w-3.5" /> Reset</Button>
                    {m.user_id !== user?.id && (
                      <Button variant="ghost" size="sm" onClick={() => toggleActiveMutation.mutate({ memberId: m.id, active: !m.active })}>
                        {m.active ? <UserX className="h-3.5 w-3.5 text-destructive" /> : <UserCheck className="h-3.5 w-3.5 text-emerald-600" />}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!assignOpen} onOpenChange={(o) => !o && setAssignOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign a course</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            assignMutation.mutate({ userId: assignOpen!, courseId: String(fd.get("course_id")), dueDate: String(fd.get("due_date") || "") });
          }} className="grid gap-4">
            <div className="grid gap-2">
              <Label>Course</Label>
              <Select name="course_id" required>
                <SelectTrigger><SelectValue placeholder="Select a course" /></SelectTrigger>
                <SelectContent>{courses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label htmlFor="due_date">Due date (optional)</Label><Input type="date" id="due_date" name="due_date" /></div>
            <DialogFooter><Button type="submit" disabled={assignMutation.isPending}>Assign</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              hireDate: String(fd.get("hire_date") || ""),
              trackIds,
              password: String(fd.get("password") || tempPassword),
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
            <div className="grid gap-2"><Label htmlFor="hire_date">Hire date</Label><Input id="hire_date" name="hire_date" type="date" /></div>
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
      <Dialog open={!!editingMember} onOpenChange={(o) => !o && setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit employee</DialogTitle>
            <DialogDescription>Update profile, role, and employment status. Changes save immediately.</DialogDescription>
          </DialogHeader>
          {editingMember && (
            <form
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
                });
              }}
              className="grid gap-4"
            >
              <div className="grid gap-2"><Label htmlFor="full_name">Full name</Label><Input id="full_name" name="full_name" defaultValue={editingMember.fullName} required /></div>
              <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" defaultValue={editingMember.email} /></div>
              <div className="grid gap-2"><Label htmlFor="employee_id">Employee ID</Label><Input id="employee_id" name="employee_id" defaultValue={editingMember.employeeId} placeholder="e.g. EMP-1042" /></div>
              <div className="grid grid-cols-2 gap-3">
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
              </div>
              <DialogFooter>
                <Button type="submit" disabled={editMemberMutation.isPending}>
                  {editMemberMutation.isPending ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
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
