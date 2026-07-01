import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Paperclip, Inbox as InboxIcon, Download, ArrowLeft, AlertCircle, Info, ShieldCheck, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequireRole } from "@/components/rbac-guard";
import {
  listInboxMessages,
  openInboxMessage,
  type InboxMessageDetail,
  type InboxAttachment,
} from "@/lib/inbox-messages.functions";
import { listMyApprovalRequests, type ApprovalRequestRow } from "@/lib/billing-approvals.functions";
import { ApprovalDialog } from "@/components/billing/ApprovalDialog";


export const Route = createFileRoute("/dashboard/inbox")({
  head: () => ({ meta: [{ title: "Inbox — HIVE" }] }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <InboxPage />
    </RequireRole>
  ),
});

function formatBytes(n: number | null): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function AttachmentPreview({ a }: { a: InboxAttachment }) {
  const url = a.signed_url!;
  const mime = (a.mime_type || "").toLowerCase();
  const name = (a.filename || "").toLowerCase();
  const isPdf = mime === "application/pdf" || name.endsWith(".pdf");
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name);
  const isText =
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "text/csv" ||
    /\.(txt|csv|json|md|log)$/.test(name);

  const [text, setText] = useState<string | null>(null);
  const [textErr, setTextErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isText) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const size = Number(res.headers.get("content-length") || 0);
        if (size && size > 512 * 1024) {
          setTextErr("File too large to preview inline.");
          return;
        }
        const t = await res.text();
        if (!cancelled) setText(t.slice(0, 512 * 1024));
      } catch (e) {
        if (!cancelled) setTextErr(e instanceof Error ? e.message : "Preview failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, isText]);

  if (isPdf) {
    return (
      <iframe
        src={url}
        title={a.filename}
        className="mt-3 h-[600px] w-full rounded-md border border-border bg-background"
      />
    );
  }
  if (isImage) {
    return (
      <img
        src={url}
        alt={a.filename}
        className="mt-3 max-h-[600px] w-auto max-w-full rounded-md border border-border bg-background"
      />
    );
  }
  if (isText) {
    if (textErr) {
      return (
        <div className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" /> {textErr} Use Download instead.
        </div>
      );
    }
    return (
      <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs">
        {text ?? "Loading preview…"}
      </pre>
    );
  }
  return (
    <div className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5" /> Inline preview not supported. Use Download.
    </div>
  );
}

function InboxPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const queryClient = useQueryClient();
  const listFn = useServerFn(listInboxMessages);
  const openFn = useServerFn(openInboxMessage);

  const [openMsg, setOpenMsg] = useState<InboxMessageDetail | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const listQ = useQuery({
    enabled: !!orgId,
    queryKey: ["inbox-messages", orgId],
    queryFn: () => listFn({ data: { organization_id: orgId! } }),
  });

  const handleOpen = async (messageId: string) => {
    if (!orgId) return;
    setOpening(messageId);
    try {
      const detail = await openFn({ data: { organization_id: orgId, message_id: messageId } });
      setOpenMsg(detail);
      // Refetch list + unread bubble
      queryClient.invalidateQueries({ queryKey: ["inbox-messages", orgId] });
      queryClient.invalidateQueries({ queryKey: ["inbox-unread", orgId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open message");
    } finally {
      setOpening(null);
    }
  };

  if (!orgId) {
    return <div className="text-sm text-muted-foreground">Loading organization…</div>;
  }

  if (openMsg) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setOpenMsg(null)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Inbox
        </button>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="font-display text-2xl font-bold tracking-tight">{openMsg.subject}</h1>
          <div className="mt-1 text-xs text-muted-foreground">
            From <span className="font-medium text-foreground">{openMsg.sender_name}</span>
            <span className="mx-1.5">·</span>
            {formatDate(openMsg.created_at)}
          </div>
          <div className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {openMsg.body || <span className="italic text-muted-foreground">(no body)</span>}
          </div>
          {openMsg.attachments.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Attachments ({openMsg.attachments.length})
              </div>
              <ul className="space-y-4">
                {openMsg.attachments.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-md border border-border bg-background p-3"
                  >
                    <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
                      <div className="flex min-w-0 items-center gap-2 text-sm">
                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{a.filename}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatBytes(a.size_bytes)}
                          {a.mime_type ? ` · ${a.mime_type}` : ""}
                        </span>
                      </div>
                      {a.signed_url ? (
                        <a
                          href={a.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={a.filename}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3.5 w-3.5" /> Unavailable
                        </span>
                      )}
                    </div>
                    {a.signed_url && <AttachmentPreview a={a} />}
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <InboxIcon className="h-4 w-4" /> <span>Admin · Inbox</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Messages from HIVE Executives to your organization.
          </p>
        </div>
      </header>

      <BillingApprovalsInboxSection orgId={orgId} />


      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {listQ.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading messages…</div>
        ) : listQ.isError ? (
          <div className="p-6 text-sm text-destructive">
            {listQ.error instanceof Error ? listQ.error.message : "Failed to load inbox."}
          </div>
        ) : !listQ.data || listQ.data.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Mail className="mx-auto mb-2 h-6 w-6 opacity-60" />
            No messages yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-semibold">Subject</th>
                <th className="px-4 py-2 font-semibold">From</th>
                <th className="px-4 py-2 font-semibold">Received</th>
                <th className="px-4 py-2 font-semibold">Files</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {listQ.data.map((m) => {
                const unread = m.read_at === null;
                return (
                  <tr
                    key={m.recipient_id}
                    onClick={() => handleOpen(m.message_id)}
                    className="cursor-pointer border-t border-border hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {unread && (
                          <span className="inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                            New
                          </span>
                        )}
                        <span className={unread ? "font-semibold" : ""}>{m.subject}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-3 ${unread ? "font-medium" : "text-muted-foreground"}`}>
                      {m.sender_name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(m.created_at)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {m.attachment_count > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="h-3.5 w-3.5" /> {m.attachment_count}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={opening === m.message_id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpen(m.message_id);
                        }}
                        className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {opening === m.message_id ? "Opening…" : "Open"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function BillingApprovalsInboxSection({ orgId }: { orgId: string }) {
  const listFn = useServerFn(listMyApprovalRequests);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["approval-requests", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
    refetchInterval: 30000,
  });
  const rows: ApprovalRequestRow[] = q.data ?? [];
  if (!q.isLoading && rows.length === 0) return null;
  const unread = rows.reduce((n, r) => n + r.unread_for_me, 0);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold">Billing code approvals — conversations with HIVE Admin</h2>
          {unread > 0 && <Badge variant="destructive" className="text-[10px]">{unread} new reply{unread === 1 ? "" : "s"}</Badge>}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{rows.length} request{rows.length === 1 ? "" : "s"}</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{r.code}</span>
                <span className="font-medium">{r.provider_name_on_pcsp || "unspecified provider"}</span>
                {r.status === "pending" && <Badge variant="outline" className="border-amber-500/60 text-amber-700">Pending HIVE review</Badge>}
                {r.status === "approved" && <Badge variant="outline" className="border-emerald-500/60 text-emerald-700">Approved</Badge>}
                {r.status === "denied" && <Badge variant="outline" className="border-destructive/60 text-destructive">Denied</Badge>}
                {r.status === "withdrawn" && <Badge variant="outline" className="text-muted-foreground">Withdrawn</Badge>}
                {r.unread_for_me > 0 && <Badge variant="destructive" className="text-[10px]">{r.unread_for_me} new</Badge>}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Last activity {new Date(r.last_activity_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setOpenId(r.id)}>
              <MessageSquare className="mr-1 h-3 w-3" /> Open
            </Button>
          </li>
        ))}
      </ul>
      {openId && (
        <ApprovalDialog
          open={!!openId}
          onOpenChange={(o) => { if (!o) setOpenId(null); }}
          organizationId={orgId}
          requestId={openId}
        />
      )}
    </div>
  );
}


