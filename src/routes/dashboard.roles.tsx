import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import { ShieldCheck, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/roles")({
  head: () => ({ meta: [{ title: "Roles & permissions — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_roles">
      <RolesPage />
    </RequirePermission>
  ),
});

const ROLE_BADGE: Record<Role, string> = {
  super_admin: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  admin: "bg-primary/15 text-primary",
  manager: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  employee: "bg-secondary text-secondary-foreground",
};

function RolesPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const isSuperAdmin = org?.role === "super_admin";

  const { data: members, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["members-roles", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("id, role, job_title, user_id, created_at")
        .eq("organization_id", org!.organization_id)
        .eq("active", true);
      if (error) throw error;
      const ids = (data ?? []).map((m) => m.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((m) => ({ ...m, profile: map.get(m.user_id) }));
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: Role }) => {
      const { error } = await supabase
        .from("organization_members")
        .update({ role })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["members-roles"] });
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["current-org"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (members ?? []).filter((m) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      m.profile?.full_name?.toLowerCase().includes(s) ||
      m.profile?.email?.toLowerCase().includes(s) ||
      m.role.toLowerCase().includes(s)
    );
  });

  const counts = (members ?? []).reduce(
    (acc, m) => ({ ...acc, [m.role]: (acc[m.role as Role] ?? 0) + 1 }),
    {} as Record<Role, number>,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Roles & permissions</h2>
            <p className="text-sm text-muted-foreground">
              Manage what people in {org?.organization_name ?? "your organization"} can do.
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <div key={r} className="rounded-xl border border-border bg-background p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{ROLE_LABEL[r]}</div>
              <div className="mt-1 text-2xl font-semibold">{counts[r] ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, role…"
              className="pl-9"
            />
          </div>
          <div className="text-xs text-muted-foreground">{filtered.length} member(s)</div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Current role</TableHead>
              <TableHead className="w-[220px]">Change role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No members found.</TableCell></TableRow>
            )}
            {filtered.map((m) => {
              const isSelf = m.user_id === user?.id;
              const isTargetSuperAdmin = m.role === "super_admin";
              // Admins cannot demote a super admin or promote anyone to super admin.
              // Admins cannot change their own role (avoid orphaned org).
              const disabled =
                isSelf || (!isSuperAdmin && isTargetSuperAdmin) || updateRole.isPending;
              const role = m.role as Role;
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">{m.profile?.full_name ?? "—"}</div>
                    {m.job_title && <div className="text-xs text-muted-foreground">{m.job_title}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.profile?.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={`${ROLE_BADGE[role]} border-0`} variant="secondary">
                      {ROLE_LABEL[role]}
                    </Badge>
                    {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={role}
                      disabled={disabled}
                      onValueChange={(val) => {
                        const next = val as Role;
                        if (next === role) return;
                        if (next === "super_admin" && !isSuperAdmin) {
                          toast.error("Only Super Admins can grant Super Admin");
                          return;
                        }
                        if (confirm(`Change ${m.profile?.full_name ?? "this user"}'s role to ${ROLE_LABEL[next]}?`)) {
                          updateRole.mutate({ memberId: m.id, role: next });
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Employee</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Company Admin</SelectItem>
                        {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Role guide</h3>
        <ul className="space-y-1">
          <li><strong className="text-foreground">Super Admin</strong> — Full platform access across all organizations.</li>
          <li><strong className="text-foreground">Company Admin</strong> — Manages employees, courses, billing, and roles in this organization.</li>
          <li><strong className="text-foreground">Manager</strong> — Assigns training and views team reports.</li>
          <li><strong className="text-foreground">Employee</strong> — Completes assigned courses and earns certifications.</li>
        </ul>
      </div>
    </div>
  );
}
