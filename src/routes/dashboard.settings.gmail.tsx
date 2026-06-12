import { useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Plug, Plus, Trash2, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { z } from "zod";

import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RequirePermission } from "@/components/rbac-guard";

import {
  getGmailConnection,
  getGmailOAuthStartUrl,
  disconnectGmail,
  listGmailRules,
  upsertGmailRule,
  deleteGmailRule,
  listGmailAudit,
} from "@/lib/gmail.functions";

const searchSchema = z.object({ connected: z.coerce.number().optional() });

export const Route = createFileRoute("/dashboard/settings/gmail")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Gmail referral ingestion — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_referrals">
      <GmailSettingsPage />
    </RequirePermission>
  ),
});

function GmailSettingsPage() {
  const { data: org } = useCurrentOrg();
  const search = useSearch({ from: "/dashboard/settings/gmail" });

  if (!org) return <div className="p-6 text-sm text-muted-foreground">Loading organization…</div>;
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-1">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Mail className="h-5 w-5 text-accent" /> Gmail referral ingestion
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect a provider Gmail inbox (read-only). New emails that match your rules become draft referrals for review —
          NECTAR auto-parses the body and any PDF attachments. Nothing is auto-published.
        </p>
      </header>
      {search.connected === 1 && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Gmail connected. Ingestion runs on a 5-minute schedule.
        </div>
      )}
      <ConnectionCard organizationId={org.organization_id} />
      <RulesCard organizationId={org.organization_id} />
      <AuditCard organizationId={org.organization_id} />
    </div>
  );
}

function ConnectionCard({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const fetchConn = useServerFn(getGmailConnection);
  const startUrlFn = useServerFn(getGmailOAuthStartUrl);
  const disconnectFn = useServerFn(disconnectGmail);

  const { data, isLoading } = useQuery({
    queryKey: ["gmail-connection", organizationId],
    queryFn: () => fetchConn({ data: { organization_id: organizationId } }),
  });

  const connect = useMutation({
    mutationFn: () => startUrlFn({ data: { organization_id: organizationId } }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectFn({ data: { organization_id: organizationId } }),
    onSuccess: () => {
      toast.success("Gmail disconnected");
      qc.invalidateQueries({ queryKey: ["gmail-connection", organizationId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const conn = data?.connection;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-accent/10 p-2 text-accent">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <div className="font-medium">Provider Gmail account</div>
            {isLoading ? (
              <div className="text-xs text-muted-foreground">Loading…</div>
            ) : conn?.status === "active" ? (
              <div className="text-xs text-muted-foreground">
                Connected as <span className="font-medium">{conn.google_email}</span> · last polled{" "}
                {conn.last_polled_at ? new Date(conn.last_polled_at).toLocaleString() : "never"}
              </div>
            ) : conn?.status === "error" ? (
              <div className="text-xs text-amber-700">Error — {conn.last_error ?? "reconnect required"}</div>
            ) : (
              <div className="text-xs text-muted-foreground">Not connected</div>
            )}
          </div>
        </div>
        {conn?.status === "active" ? (
          <Button variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
            {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
          </Button>
        ) : (
          <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
            {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect Gmail"}
          </Button>
        )}
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-emerald-700" />
        <div>
          Read-only access (Gmail readonly scope). Tokens are stored server-side only. Every fetched message is logged in
          the audit trail below. Disconnect at any time — revokes the refresh token at Google.
        </div>
      </div>
    </Card>
  );
}

function RulesCard({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const fetchRules = useServerFn(listGmailRules);
  const upsertFn = useServerFn(upsertGmailRule);
  const deleteFn = useServerFn(deleteGmailRule);

  const { data } = useQuery({
    queryKey: ["gmail-rules", organizationId],
    queryFn: () => fetchRules({ data: { organization_id: organizationId } }),
  });

  const [draft, setDraft] = useState({
    rule_name: "",
    sender_domains: "",
    sender_emails: "",
    subject_contains: "",
  });

  const upsert = useMutation({
    mutationFn: (payload: Parameters<typeof upsertFn>[0]["data"]) => upsertFn({ data: payload }),
    onSuccess: () => {
      toast.success("Rule saved");
      qc.invalidateQueries({ queryKey: ["gmail-rules", organizationId] });
      setDraft({ rule_name: "", sender_domains: "", sender_emails: "", subject_contains: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { organization_id: organizationId, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gmail-rules", organizationId] }),
  });

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h2 className="font-medium">Ingestion rules</h2>
        <p className="text-xs text-muted-foreground">
          A message is ingested when it matches <em>any</em> enabled rule. Within a rule, sender + subject filters are OR'd
          together. Sender domains exclude the leading "@".
        </p>
      </div>

      <div className="space-y-3">
        {(data?.rules ?? []).length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No rules yet — add one below to start ingestion.
          </div>
        )}
        {(data?.rules ?? []).map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
            <div className="min-w-0 space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.rule_name}</span>
                {r.enabled ? <Badge variant="secondary">enabled</Badge> : <Badge variant="outline">disabled</Badge>}
              </div>
              {(r.sender_emails?.length ?? 0) > 0 && (
                <div className="text-xs text-muted-foreground">From: {r.sender_emails.join(", ")}</div>
              )}
              {(r.sender_domains?.length ?? 0) > 0 && (
                <div className="text-xs text-muted-foreground">Domains: {r.sender_domains.join(", ")}</div>
              )}
              {(r.subject_contains?.length ?? 0) > 0 && (
                <div className="text-xs text-muted-foreground">Subject contains: {r.subject_contains.join(", ")}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={r.enabled}
                onCheckedChange={(v) =>
                  upsert.mutate({
                    organization_id: organizationId,
                    id: r.id,
                    rule_name: r.rule_name,
                    sender_domains: r.sender_domains ?? [],
                    sender_emails: r.sender_emails ?? [],
                    subject_contains: r.subject_contains ?? [],
                    enabled: v,
                  })
                }
              />
              <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)} aria-label="Delete rule">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3 rounded-md border border-border bg-muted/30 p-3">
        <div className="text-sm font-medium">New rule</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Rule name</Label>
            <Input value={draft.rule_name} onChange={(e) => setDraft({ ...draft, rule_name: e.target.value })} placeholder="DSPD intake team" />
          </div>
          <div>
            <Label className="text-xs">Sender domains (comma-separated, no @)</Label>
            <Input value={draft.sender_domains} onChange={(e) => setDraft({ ...draft, sender_domains: e.target.value })} placeholder="utah.gov, dspd.utah.gov" />
          </div>
          <div>
            <Label className="text-xs">Sender emails (comma-separated)</Label>
            <Input value={draft.sender_emails} onChange={(e) => setDraft({ ...draft, sender_emails: e.target.value })} placeholder="intake@example.org" />
          </div>
          <div>
            <Label className="text-xs">Subject contains (comma-separated)</Label>
            <Input value={draft.subject_contains} onChange={(e) => setDraft({ ...draft, subject_contains: e.target.value })} placeholder="referral, ISO" />
          </div>
        </div>
        <Button
          size="sm"
          disabled={upsert.isPending || !draft.rule_name.trim()}
          onClick={() =>
            upsert.mutate({
              organization_id: organizationId,
              rule_name: draft.rule_name.trim(),
              sender_domains: draft.sender_domains.split(",").map((s) => s.trim()).filter(Boolean),
              sender_emails: draft.sender_emails.split(",").map((s) => s.trim()).filter(Boolean),
              subject_contains: draft.subject_contains.split(",").map((s) => s.trim()).filter(Boolean),
              enabled: true,
            })
          }
        >
          <Plus className="mr-1 h-4 w-4" /> Add rule
        </Button>
      </div>
    </Card>
  );
}

function AuditCard({ organizationId }: { organizationId: string }) {
  const fetchAudit = useServerFn(listGmailAudit);
  const { data } = useQuery({
    queryKey: ["gmail-audit", organizationId],
    queryFn: () => fetchAudit({ data: { organization_id: organizationId, limit: 50 } }),
  });
  const rows = data?.audit ?? [];
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-medium">Audit log (last 50)</h2>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">No activity yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 text-left">When</th>
                <th className="py-1 pr-3 text-left">Actor</th>
                <th className="py-1 pr-3 text-left">Action</th>
                <th className="py-1 pr-3 text-left">Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="py-1 pr-3">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-1 pr-3">{r.actor_kind}</td>
                  <td className="py-1 pr-3">{r.action}</td>
                  <td className="py-1 pr-3 font-mono text-[10px] text-muted-foreground">{r.gmail_message_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
