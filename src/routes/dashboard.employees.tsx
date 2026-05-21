import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { Mail, UserPlus, Trash2, BookOpen, KeyRound, Copy, UserCheck, UserX, ShieldPlus } from "lucide-react";
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
        .select("id, full_name, email, username, must_change_password, department, hire_date")
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

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("organization_members").update({ active: false }).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Employee removed"); qc.invalidateQueries({ queryKey: ["members"] }); },
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="text-base font-semibold">Team members</h2>
          <p className="text-sm text-muted-foreground">{members?.length ?? 0} active · billed at $25/employee/mo</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[image:var(--gradient-brand)] text-primary-foreground"><UserPlus className="mr-2 h-4 w-4" /> Invite employee</Button>
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

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr><th className="p-4 text-left">Name</th><th className="p-4 text-left">Email</th><th className="p-4 text-left">Role</th><th className="p-4 text-left">Joined</th><th className="p-4" /></tr>
          </thead>
          <tbody>
            {members?.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="p-4 font-medium">{m.profile?.full_name ?? "—"}</td>
                <td className="p-4 text-muted-foreground">{m.profile?.email ?? "—"}</td>
                <td className="p-4"><span className="rounded-full bg-secondary px-2 py-0.5 text-xs uppercase">{m.role}</span></td>
                <td className="p-4 text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</td>
                <td className="p-4 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setAssignOpen(m.user_id)}><BookOpen className="mr-1 h-3.5 w-3.5" /> Assign</Button>
                  {m.user_id !== user?.id && (
                    <Button variant="ghost" size="sm" onClick={() => removeMutation.mutate(m.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  )}
                </td>
              </tr>
            ))}
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
    </div>
  );
}
