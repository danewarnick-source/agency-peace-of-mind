import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentOrg } from "@/hooks/use-org";
import { ALL_PERMISSIONS, PERMISSION_LABEL, type Permission } from "@/lib/rbac";
import { requestPermission } from "@/lib/permissions.functions";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({ meta: [{ title: "Unauthorized — Provider Interface" }] }),
  validateSearch: (s: Record<string, unknown>): { perm?: Permission; page?: string } => {
    const out: { perm?: Permission; page?: string } = {};
    if (typeof s.perm === "string" && (ALL_PERMISSIONS as readonly string[]).includes(s.perm)) {
      out.perm = s.perm as Permission;
    }
    if (typeof s.page === "string") out.page = s.page;
    return out;
  },
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  const { perm, page } = Route.useSearch();
  const { data: org } = useCurrentOrg();
  const requestFn = useServerFn(requestPermission);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!org || !perm || !reason.trim()) return;
    setSending(true);
    try {
      await requestFn({
        data: { organizationId: org.organization_id, permission: perm, reason: reason.trim(), pageRequested: page },
      });
      setSent(true);
      toast.success("Access request sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send request");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-secondary/40 px-6">
      <div className="max-w-md rounded-2xl border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {perm ? (
            <>You don't have the <strong>{PERMISSION_LABEL[perm]}</strong> permission needed to view this page.</>
          ) : (
            "You don't have permission to view this page."
          )}{" "}
          If you believe this is a mistake, contact your organization admin.
        </p>

        {perm && org && !sent && (
          <div className="mt-6 text-left">
            {!showForm ? (
              <Button className="w-full" onClick={() => setShowForm(true)}>Request access</Button>
            ) : (
              <div className="space-y-3">
                <Textarea
                  placeholder="Why do you need this permission?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button className="flex-1" disabled={sending || !reason.trim()} onClick={submit}>
                    {sending ? "Sending…" : "Submit request"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {sent && (
          <p className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            Your request has been sent to your organization's owners.
          </p>
        )}

        <Button asChild variant="outline" className="mt-6"><Link to="/dashboard">Back to your dashboard</Link></Button>
      </div>
    </div>
  );
}
