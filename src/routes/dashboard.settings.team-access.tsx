import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentOrg } from "@/hooks/use-org";
import { useIsHiveExecutive } from "@/hooks/use-hive-executive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  listTeamAccess,
  setMemberGrants,
  inviteTeamMember,
  type TeamMemberAccess,
} from "@/lib/team-access.functions";

export const Route = createFileRoute("/dashboard/settings/team-access")({
  head: () => ({ meta: [{ title: "Team access — HIVE" }] }),
  component: TeamAccessPage,
});

const ROLE_INFO: Array<{
  key: "staff" | "admin" | "company_executive" | "hive_executive";
  label: string;
  hint: string;
  restricted?: boolean;
}> = [
  { key: "staff", label: "Company Staff", hint: "Mobile staff portal" },
  { key: "admin", label: "Company Admin", hint: "Full company admin portal" },
  { key: "company_executive", label: "Company Executive", hint: "Admin + executive/billing views" },
  { key: "hive_executive", label: "HIVE Executive", hint: "Cross-company platform tools", restricted: true },
];

function TeamAccessPage() {
  const { data: org } = useCurrentOrg();
  const { isExecutive: isHiveExec } = useIsHiveExecutive();
  const qc = useQueryClient();
  const listFn = useServerFn(listTeamAccess);
  const saveFn = useServerFn(setMemberGrants);
  const inviteFn = useServerFn(inviteTeamMember);

  const canManage =
    org?.role === "admin" || org?.role === "super_admin" || isHiveExec;

  const { data: members = [], isLoading } = useQuery({
    enabled: !!org && canManage,
    queryKey: ["team-access", org?.organization_id],
    queryFn: () => listFn({ data: { organization_id: org!.organization_id } }),
  });

  const save = useMutation({
    mutationFn: (input: {
      m: TeamMemberAccess;
      grants: { admin: boolean; company_executive: boolean; hive_executive: boolean };
    }) =>
      saveFn({
        data: {
          organization_id: org!.organization_id,
          membership_id: input.m.membership_id,
          target_user_id: input.m.user_id,
          grants: input.grants,
        },
      }),
    onSuccess: () => {
      toast.success("Roles updated");
      qc.invalidateQueries({ queryKey: ["team-access"] });
      qc.invalidateQueries({ queryKey: ["hive-executive"] });
      qc.invalidateQueries({ queryKey: ["current-org"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAdmin, setInviteAdmin] = useState(false);
  const invite = useMutation({
    mutationFn: () =>
      inviteFn({
        data: {
          organization_id: org!.organization_id,
          email: inviteEmail,
          grant_admin: inviteAdmin,
        },
      }),
    onSuccess: () => {
      toast.success("Invitation sent");
      setInviteEmail("");
      setInviteAdmin(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You do not have permission to manage team access.
      </div>
    );
  }

  const toggle = (m: TeamMemberAccess, key: keyof TeamMemberAccess["grants"], next: boolean) => {
    if (key === "staff") return; // always-on baseline
    if (key === "hive_executive" && !isHiveExec) {
      toast.error("Only HIVE executives may grant this role");
      return;
    }
    const grants = {
      admin: key === "admin" ? next : m.grants.admin,
      company_executive: key === "company_executive" ? next : m.grants.company_executive,
      hive_executive: key === "hive_executive" ? next : m.grants.hive_executive,
    };
    save.mutate({ m, grants });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Team Access</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Each login can hold any combination of these roles. Roles are additive — a
          single account switches context via the Portal View switcher.
        </p>
      </div>

      {/* Invite */}
      <form
        className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate();
        }}
      >
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Invite by email</h3>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="grid gap-1">
            <Label htmlFor="invite-email" className="sr-only">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="person@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
          </div>
          <label className="inline-flex items-center gap-2 px-2 text-sm">
            <Checkbox
              checked={inviteAdmin}
              onCheckedChange={(v) => setInviteAdmin(v === true)}
            />
            Grant Admin
          </label>
          <Button type="submit" disabled={invite.isPending || !inviteEmail}>
            Send invite
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Company Executive and HIVE Executive can be granted after the invite is accepted.
        </p>
      </form>

      {/* Members */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="border-b border-border p-4">
          <h3 className="text-sm font-semibold">Members ({members.length})</h3>
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading members…</div>
        ) : !members.length ? (
          <div className="p-6 text-sm text-muted-foreground">No members yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Member</th>
                  {ROLE_INFO.map((r) => (
                    <th key={r.key} className="px-4 py-3 text-center">
                      <div className="inline-flex items-center justify-center gap-1">
                        {r.restricted && <Lock className="h-3 w-3" />}
                        <span>{r.label}</span>
                      </div>
                      <div className="text-[10px] font-normal normal-case text-muted-foreground/80">
                        {r.hint}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membership_id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-medium">{m.full_name ?? m.email}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </td>
                    {ROLE_INFO.map((r) => {
                      const checked = m.grants[r.key];
                      const disabled =
                        r.key === "staff" ||
                        (r.key === "hive_executive" && !isHiveExec) ||
                        save.isPending;
                      return (
                        <td key={r.key} className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Checkbox
                              checked={checked}
                              disabled={disabled}
                              onCheckedChange={(v) => toggle(m, r.key, v === true)}
                              aria-label={`${r.label} for ${m.email}`}
                            />
                            {r.key === "hive_executive" && !isHiveExec && checked && (
                              <Badge variant="outline" className="text-[10px]">HIVE-only</Badge>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isHiveExec && (
          <div className="border-t border-border p-3 text-xs text-muted-foreground">
            <Lock className="mr-1 inline h-3 w-3" />
            HIVE Executive can only be granted by a HIVE staff account.
          </div>
        )}
      </div>
    </div>
  );
}
