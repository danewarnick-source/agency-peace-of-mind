import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, UserPlus, Copy, RefreshCcw, Ban, AlertTriangle } from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/invitations")({
  head: () => ({ meta: [{ title: "Invitations — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="invite_users">
      <InvitationsPage />
    </RequirePermission>
  ),
});

type InviteRole = "admin" | "manager" | "employee";

function InvitationsPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: invites, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["invitations", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("organization_id", org!.organization_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createInvite = useMutation({
    mutationFn: async (input: { email: string; role: InviteRole }) => {
      const email = input.email.trim().toLowerCase();
      // Check duplicates among pending
      const existing = (invites ?? []).find(
        (i) => i.status === "pending" && i.email.toLowerCase() === email,
      );
      if (existing) throw new Error("A pending invitation already exists for this email");

      const { error } = await supabase.from("invitations").insert({
        organization_id: org!.organization_id,
        email,
        role: input.role,
        invited_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation created — share the link with your employee");
      qc.invalidateQueries({ queryKey: ["invitations"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendInvite = useMutation({
    mutationFn: async (id: string) => {
      const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("invitations")
        .update({ expires_at: expires, status: "pending" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation refreshed — expires in 14 days");
      qc.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invitations")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation revoked");
      qc.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = (invites ?? []).reduce(
    (acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="text-base font-semibold">Employee invitations</h2>
          <p className="text-sm text-muted-foreground">
            Invite people to {org?.organization_name ?? "your organization"} by email. Links expire after 14 days.
          </p>
          <div className="mt-3 flex gap-2 text-xs">
            <Badge variant="secondary">{counts.pending ?? 0} pending</Badge>
            <Badge variant="secondary">{counts.accepted ?? 0} accepted</Badge>
            {counts.revoked ? <Badge variant="secondary">{counts.revoked} revoked</Badge> : null}
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[image:var(--gradient-brand)] text-primary-foreground">
              <UserPlus className="mr-2 h-4 w-4" /> Invite by email
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite an employee</DialogTitle></DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createInvite.mutate({
                  email: String(fd.get("email") ?? ""),
                  role: String(fd.get("role") ?? "employee") as InviteRole,
                });
              }}
              className="grid gap-4"
            >
              <div className="grid gap-2">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" name="email" type="email" required placeholder="alex@company.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Assigned role</Label>
                <Select name="role" defaultValue="employee">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Company Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createInvite.isPending}>
                  {createInvite.isPending ? "Creating…" : "Create invitation"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <strong>Email delivery:</strong> To automatically email invitations, set up a sender domain in Lovable Cloud → Emails.
          Until then, copy the invite link below and send it manually — the link is signed, expires in 14 days, and is locked to the invitee's email.
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-[260px]">Invite link</TableHead>
              <TableHead className="w-[160px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && (invites?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No invitations yet.</TableCell></TableRow>
            )}
            {invites?.map((inv) => {
              const expired = new Date(inv.expires_at) < new Date();
              const link = typeof window !== "undefined"
                ? `${window.location.origin}/signup?invite=${inv.token}`
                : "";
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {inv.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ROLE_LABEL[(inv.role as Role)] ?? inv.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {inv.status === "pending" && (expired ? (
                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0">Expired</Badge>
                    ) : (
                      <Badge className="bg-primary/15 text-primary border-0">Pending</Badge>
                    ))}
                    {inv.status === "accepted" && (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-0">Accepted</Badge>
                    )}
                    {inv.status === "revoked" && (
                      <Badge variant="secondary">Revoked</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {inv.status === "pending" ? (
                      <code className="block truncate rounded bg-secondary px-2 py-1 text-xs">{link}</code>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {inv.status === "pending" && (
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(link);
                            toast.success("Link copied");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => resendInvite.mutate(inv.id)}
                          disabled={resendInvite.isPending}
                          title="Extend expiration"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => {
                            if (confirm(`Revoke invitation for ${inv.email}?`)) revokeInvite.mutate(inv.id);
                          }}
                        >
                          <Ban className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
