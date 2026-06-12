import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Paperclip, Search, Send, X, AlertTriangle, CheckCircle2, Inbox, Eye, EyeOff } from "lucide-react";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import {
  NectarCard,
  NectarHeader,
  NectarButton,
  NectarBadge,
} from "@/components/nectar/nectar-brand";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  listAllOrganizationsForMessaging,
  createExecMessage,
  recordExecMessageAttachment,
  discardExecMessage,
  listSentExecMessages,
  type OrgForMessaging,
  type SentMessageRow,
} from "@/lib/exec-messages.functions";


const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file
const BUCKET = "message-attachments";

export const Route = createFileRoute("/dashboard/hive-exec/messages")({
  head: () => ({ meta: [{ title: "Message Center — HIVE Executive" }] }),
  component: () => (
    <RequireHiveExecutive>
      <MessageCenterPage />
    </RequireHiveExecutive>
  ),
});

type Tab = "compose" | "sent";

function MessageCenterPage() {
  const [tab, setTab] = useState<Tab>("compose");
  return (
    <div className="space-y-4">
      <NectarHeader
        surface="navy"
        eyebrow="HIVE Platform Operations"
        title="Message Center"
        description="Compose and send announcements or directives, and review what you've sent."
        right={<NectarBadge size="sm" label="EXEC ONLY" />}
      />
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1 shadow-sm w-fit">
        {([
          { id: "compose", label: "Compose", icon: Send },
          { id: "sent", label: "Sent", icon: Inbox },
        ] as Array<{ id: Tab; label: string; icon: typeof Send }>).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-[#0f1b3d] text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "compose" ? <MessageCenter /> : <SentMessagesView />}
    </div>
  );
}


type Scope = "all" | "selected";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFilename(name: string): string {
  // Storage keys: keep alnum, dot, dash, underscore. Replace others with _.
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  return cleaned || "file";
}

function MessageCenter() {
  const listOrgs = useServerFn(listAllOrganizationsForMessaging);
  const createMsg = useServerFn(createExecMessage);
  const recordAttachment = useServerFn(recordExecMessageAttachment);
  const discardMsg = useServerFn(discardExecMessage);

  const orgsQ = useQuery({
    queryKey: ["exec-messaging-orgs"],
    queryFn: () => listOrgs(),
    staleTime: 30_000,
  });

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<Scope>("selected");
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<{
    message_id: string;
    org_count: number;
    file_count: number;
  } | null>(null);

  const orgs: OrgForMessaging[] = orgsQ.data ?? [];
  const totalOrgCount = orgs.length;

  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) => o.name.toLowerCase().includes(q));
  }, [orgs, search]);

  const effectiveRecipientCount =
    scope === "all" ? totalOrgCount : selectedOrgIds.size;

  const canSend =
    !sending &&
    subject.trim().length > 0 &&
    effectiveRecipientCount > 0;

  function toggleOrg(id: string) {
    setSelectedOrgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? []);
    const accepted: File[] = [];
    for (const f of incoming) {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`"${f.name}" exceeds the 25 MB per-file limit.`);
        continue;
      }
      accepted.push(f);
    }
    setFiles((prev) => [...prev, ...accepted]);
    e.target.value = ""; // allow re-selecting the same file
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function resetForm() {
    setSubject("");
    setBody("");
    setSelectedOrgIds(new Set());
    setFiles([]);
    setScope("selected");
  }

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setLastSent(null);

    let createdMessageId: string | null = null;
    let resolvedOrgIds: string[] = [];

    try {
      // 1) Create message + recipients (server resolves "all")
      const res = await createMsg({
        data: {
          subject: subject.trim(),
          body,
          scope,
          organization_ids: scope === "selected" ? Array.from(selectedOrgIds) : [],
        },
      });
      createdMessageId = res.message_id;
      resolvedOrgIds = res.organization_ids;

      // 2) Upload one copy of each file to EACH recipient org's folder
      //    Path: <orgId>/<messageId>/<timestamp>_<safeName>
      const uploads: Array<{
        file: File;
        safeName: string;
        timestamp: number;
      }> = files.map((f) => ({
        file: f,
        safeName: sanitizeFilename(f.name),
        timestamp: Date.now(),
      }));

      for (const u of uploads) {
        const filename = `${u.timestamp}_${u.safeName}`;
        // Upload to every recipient org folder
        const results = await Promise.all(
          resolvedOrgIds.map((orgId) =>
            supabase.storage
              .from(BUCKET)
              .upload(`${orgId}/${createdMessageId}/${filename}`, u.file, {
                upsert: false,
                contentType: u.file.type || undefined,
              }),
          ),
        );
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.error) {
            throw new Error(
              `Upload failed for "${u.file.name}" to org ${resolvedOrgIds[i]}: ${r.error.message}`,
            );
          }
        }
        // Storage path on the row points at the first authorized copy;
        // every recipient org has its own copy under its own folder.
        await recordAttachment({
          data: {
            message_id: createdMessageId!,
            storage_path: `${resolvedOrgIds[0]}/${createdMessageId}/${filename}`,
            filename: u.file.name,
            mime_type: u.file.type || null,
            size_bytes: u.file.size,
          },
        });
      }

      setLastSent({
        message_id: createdMessageId!,
        org_count: resolvedOrgIds.length,
        file_count: files.length,
      });
      toast.success(
        `Sent to ${resolvedOrgIds.length} organization${
          resolvedOrgIds.length === 1 ? "" : "s"
        }.`,
      );
      resetForm();
    } catch (err) {
      // Rollback the message + storage if anything went wrong post-create
      if (createdMessageId) {
        try {
          await discardMsg({ data: { message_id: createdMessageId } });
        } catch (cleanupErr) {
          console.warn("Discard failed:", cleanupErr);
        }
      }
      const msg = err instanceof Error ? err.message : "Failed to send message.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">


      {lastSent && (
        <NectarCard className="p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div className="text-sm">
              <div className="font-semibold text-[#0f1b3d]">
                Message delivered
              </div>
              <div className="text-muted-foreground">
                Sent to {lastSent.org_count} organization
                {lastSent.org_count === 1 ? "" : "s"}
                {lastSent.file_count > 0
                  ? ` with ${lastSent.file_count} attachment${
                      lastSent.file_count === 1 ? "" : "s"
                    }`
                  : ""}
                . Message id:{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {lastSent.message_id}
                </code>
              </div>
            </div>
          </div>
        </NectarCard>
      )}

      <NectarCard className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#7a4a0a]" />
          <h3 className="font-display text-base font-semibold text-[#0f1b3d]">
            Compose
          </h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="msg-subject">Subject *</Label>
            <Input
              id="msg-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short, specific subject line"
              maxLength={500}
              disabled={sending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="msg-body">Message</Label>
            <Textarea
              id="msg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Optional message body. Plain text."
              rows={8}
              disabled={sending}
            />
          </div>
        </div>
      </NectarCard>

      <NectarCard className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-[#0f1b3d]">
            Recipients
          </h3>
          <div className="text-xs font-medium text-muted-foreground">
            {orgsQ.isLoading
              ? "Loading organizations…"
              : `${effectiveRecipientCount} of ${totalOrgCount} selected`}
          </div>
        </div>

        <div className="mb-3 flex flex-col gap-2 md:flex-row">
          <button
            type="button"
            onClick={() => setScope("selected")}
            disabled={sending}
            className={`min-h-[44px] flex-1 rounded-md border px-3 py-2 text-left text-sm transition ${
              scope === "selected"
                ? "border-[#0f1b3d] bg-[#0f1b3d] text-white"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            <div className="font-semibold">Select organizations</div>
            <div
              className={`text-xs ${
                scope === "selected" ? "text-white/75" : "text-muted-foreground"
              }`}
            >
              Pick specific recipients
            </div>
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            disabled={sending}
            className={`min-h-[44px] flex-1 rounded-md border px-3 py-2 text-left text-sm transition ${
              scope === "all"
                ? "border-[#0f1b3d] bg-[#0f1b3d] text-white"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            <div className="font-semibold">All organizations</div>
            <div
              className={`text-xs ${
                scope === "all" ? "text-white/75" : "text-muted-foreground"
              }`}
            >
              Will send to {totalOrgCount} organization
              {totalOrgCount === 1 ? "" : "s"} (including demo)
            </div>
          </button>
        </div>

        {scope === "all" ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                This message will be delivered to every organization on the
                platform ({totalOrgCount} total), including demo workspaces.
                The recipient list is re-derived on the server at send time.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search organizations…"
                className="pl-8"
                disabled={sending}
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">
              {filteredOrgs.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  {orgsQ.isLoading
                    ? "Loading…"
                    : "No organizations match this search."}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredOrgs.map((o) => {
                    const checked = selectedOrgIds.has(o.id);
                    return (
                      <li key={o.id}>
                        <label
                          className={`flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 text-sm transition hover:bg-muted ${
                            checked ? "bg-[#0f1b3d]/5" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOrg(o.id)}
                            disabled={sending}
                            className="h-4 w-4"
                          />
                          <span className="flex-1 truncate font-medium text-[#0f1b3d]">
                            {o.name}
                          </span>
                          {o.is_demo && (
                            <span className="inline-flex items-center rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                              Demo
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </NectarCard>

      <NectarCard className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-[#7a4a0a]" />
          <h3 className="font-display text-base font-semibold text-[#0f1b3d]">
            Attachments
          </h3>
        </div>
        <div className="space-y-2">
          <input
            id="msg-files"
            type="file"
            multiple
            onChange={onPickFiles}
            disabled={sending}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#0f1b3d] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#1a2a5a]"
          />
          <div className="text-xs text-muted-foreground">
            Up to 25 MB per file. Most file types accepted.
          </div>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((f, idx) => (
                <li
                  key={`${f.name}-${idx}`}
                  className="flex min-h-[44px] items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[#0f1b3d]">
                      {f.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(f.size)}
                      {f.type ? ` · ${f.type}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    disabled={sending}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </NectarCard>

      <div className="flex flex-col items-stretch justify-end gap-2 md:flex-row md:items-center">
        <div className="text-sm text-muted-foreground">
          {effectiveRecipientCount} recipient
          {effectiveRecipientCount === 1 ? "" : "s"} ·{" "}
          {files.length} attachment{files.length === 1 ? "" : "s"}
        </div>
        <NectarButton
          variant="amber"
          icon={<Send className="h-4 w-4" />}
          onClick={handleSend}
          disabled={!canSend}
          loading={sending}
        >
          {sending ? "Sending…" : "Send message"}
        </NectarButton>
      </div>
    </div>
  );
}

// ─── Sent messages view ──────────────────────────────────────────────────

function formatSentDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SentMessagesView() {
  const listSent = useServerFn(listSentExecMessages);
  const q = useQuery({
    queryKey: ["exec-sent-messages"],
    queryFn: () => listSent(),
  });
  const [openId, setOpenId] = useState<string | null>(null);

  const rows: SentMessageRow[] = q.data ?? [];
  const open = useMemo(
    () => rows.find((r) => r.message_id === openId) ?? null,
    [rows, openId],
  );

  if (q.isLoading) {
    return (
      <NectarCard className="p-6 text-sm text-muted-foreground">
        Loading sent messages…
      </NectarCard>
    );
  }
  if (q.isError) {
    return (
      <NectarCard className="p-6 text-sm text-destructive">
        {q.error instanceof Error ? q.error.message : "Failed to load sent messages."}
      </NectarCard>
    );
  }
  if (rows.length === 0) {
    return (
      <NectarCard className="p-10 text-center text-sm text-muted-foreground">
        <Mail className="mx-auto mb-2 h-6 w-6 opacity-60" />
        You haven't sent any messages yet.
      </NectarCard>
    );
  }

  if (open) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setOpenId(null)}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Sent
        </button>
        <NectarCard className="p-6">
          <h2 className="font-display text-xl font-bold text-[#0f1b3d]">{open.subject}</h2>
          <div className="mt-1 text-xs text-muted-foreground">
            Sent {formatSentDate(open.created_at)}
            <span className="mx-1.5">·</span>
            {open.recipient_count} recipient{open.recipient_count === 1 ? "" : "s"}
            <span className="mx-1.5">·</span>
            Read by {open.read_count} of {open.recipient_count} org{open.recipient_count === 1 ? "" : "s"}
            <span className="mx-1.5">·</span>
            {open.attachment_count} attachment{open.attachment_count === 1 ? "" : "s"}
          </div>
          <div className="mt-5 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
            {open.body || <span className="italic text-muted-foreground">(no body)</span>}
          </div>
          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recipient organizations ({open.recipient_count})
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Organization</th>
                    <th className="px-3 py-2 font-semibold">Read</th>
                    <th className="px-3 py-2 font-semibold">Read at</th>
                  </tr>
                </thead>
                <tbody>
                  {open.recipients.map((r) => (
                    <tr key={r.organization_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className="font-medium text-[#0f1b3d]">{r.organization_name}</span>
                        {r.is_demo && (
                          <span className="ml-2 inline-flex items-center rounded-full border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                            Demo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.read_at ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Eye className="h-3.5 w-3.5" /> Read
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <EyeOff className="h-3.5 w-3.5" /> Unread
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.read_at ? formatSentDate(r.read_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </NectarCard>
      </div>
    );
  }

  return (
    <NectarCard className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">Subject</th>
              <th className="px-4 py-2 font-semibold">Sent</th>
              <th className="px-4 py-2 font-semibold">Recipients</th>
              <th className="px-4 py-2 font-semibold">Read status</th>
              <th className="px-4 py-2 font-semibold">Files</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr
                key={m.message_id}
                onClick={() => setOpenId(m.message_id)}
                className="cursor-pointer border-t border-border hover:bg-muted/40"
              >
                <td className="px-4 py-3 font-medium text-[#0f1b3d]">{m.subject}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatSentDate(m.created_at)}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.recipient_count}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  Read by {m.read_count} of {m.recipient_count} org{m.recipient_count === 1 ? "" : "s"}
                </td>
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenId(m.message_id);
                    }}
                    className="inline-flex min-h-[36px] items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </NectarCard>
  );
}
