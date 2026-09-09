import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { inviteStaffMembers } from "@/lib/invitations.functions";
import { resolveAuthOrigin } from "@/lib/auth-redirect";

export type ImportInviteRow = {
  subject_id: string;
  record_id: string | null;
  display_name: string;
  email: string | null;
};

export type ImportInviteSummary = {
  ready: ImportInviteRow[];
  missing_email: ImportInviteRow[];
  already_login: ImportInviteRow[];
};

export function EmployeeInviteSummary({
  organizationId,
  summary,
}: {
  organizationId: string | null;
  summary: ImportInviteSummary;
}) {
  const qc = useQueryClient();
  const inviteFn = useServerFn(inviteStaffMembers);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const readyWithLogin = useMemo(
    () => summary.ready.filter((r) => r.record_id && r.email),
    [summary.ready],
  );

  const inviteMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      if (!organizationId) throw new Error("No organization selected.");
      if (!userIds.length) throw new Error("No inviteable employees selected.");
      return await inviteFn({
        data: {
          organization_id: organizationId,
          site_origin: resolveAuthOrigin(),
          user_ids: userIds,
          emails: [],
        },
      });
    },
    onSuccess: (res) => {
      if (res.sent > 0) {
        toast.success(`Invited ${res.sent} employee${res.sent === 1 ? "" : "s"}.`);
      }
      if (res.errors > 0) {
        toast.warning(`${res.errors} invite${res.errors === 1 ? "" : "s"} could not be emailed.`);
      }
      if (res.sent === 0 && res.errors === 0) {
        toast.info(res.results[0]?.reason ?? "Nothing to invite.");
      }
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["smart-import-done"] });
      qc.invalidateQueries({ queryKey: ["invites"] });
      qc.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedIds = readyWithLogin
    .filter((r) => r.record_id && selected.has(r.record_id))
    .map((r) => r.record_id!) ;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-primary" />
            Invite imported employees
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.ready.length} ready to invite (have email, no login yet)
            {" · "}
            {summary.missing_email.length} missing email
            {" · "}
            {summary.already_login.length} already have logins
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Import does not send email. Invite only people who have not already accepted.
          </p>
        </div>
        <Button
          className="bg-[var(--hive-gold)] text-[var(--hive-on-gold)]"
          disabled={inviteMutation.isPending || readyWithLogin.length === 0 || !organizationId}
          onClick={() => inviteMutation.mutate(readyWithLogin.map((r) => r.record_id!))}
        >
          {inviteMutation.isPending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Mail className="mr-2 h-4 w-4" />}
          Invite all with email
        </Button>
      </div>

      {readyWithLogin.length > 0 && (
        <div className="space-y-2">
          {readyWithLogin.map((row) => (
            <div
              key={row.subject_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <label className="flex min-w-0 items-center gap-2 text-sm">
                <Checkbox
                  checked={!!row.record_id && selected.has(row.record_id)}
                  onCheckedChange={() => row.record_id && toggle(row.record_id)}
                />
                <span className="truncate font-medium">{row.display_name}</span>
                <span className="truncate text-muted-foreground">{row.email}</span>
              </label>
              <Button
                size="sm"
                variant="outline"
                disabled={inviteMutation.isPending || !row.record_id || !organizationId}
                onClick={() => row.record_id && inviteMutation.mutate([row.record_id])}
              >
                Invite
              </Button>
            </div>
          ))}
          {selectedIds.length > 0 && (
            <Button
              variant="outline"
              disabled={inviteMutation.isPending || !organizationId}
              onClick={() => inviteMutation.mutate(selectedIds)}
            >
              Invite selected ({selectedIds.length})
            </Button>
          )}
        </div>
      )}

      {summary.missing_email.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Missing email — imported, not inviteable
          </div>
          <ul className="space-y-1 text-sm">
            {summary.missing_email.map((row) => (
              <li key={row.subject_id} className="flex items-center justify-between gap-2">
                <span>{row.display_name}</span>
                <Badge variant="outline">No email</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.already_login.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Already have logins
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {summary.already_login.map((row) => (
              <li key={row.subject_id}>{row.display_name}{row.email ? ` · ${row.email}` : ""}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
