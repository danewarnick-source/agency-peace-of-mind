import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

// ─── Types ──────────────────────────────────────────────────────────────

export interface InboxMessageRow {
  message_id: string;
  recipient_id: string;
  subject: string;
  sender_name: string;
  created_at: string;
  read_at: string | null;
  attachment_count: number;
}

export interface InboxAttachment {
  id: string;
  filename: string;
  size_bytes: number | null;
  mime_type: string | null;
  storage_path: string;
  signed_url: string | null;
}

export interface InboxMessageDetail {
  message_id: string;
  subject: string;
  body: string;
  sender_name: string;
  created_at: string;
  read_at: string | null;
  attachments: InboxAttachment[];
}

const BUCKET = "message-attachments";

// ─── Unread count ───────────────────────────────────────────────────────

const orgSchema = z.object({ organization_id: z.string().uuid() });

export const getInboxUnreadCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "manager");

    const { count, error } = await supabase
      .from("exec_message_recipients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", data.organization_id)
      .is("read_at", null);
    if (error) throw error;
    return { count: count ?? 0 };
  });

// ─── List inbox messages ────────────────────────────────────────────────

export const listInboxMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgSchema.parse(d))
  .handler(async ({ data, context }): Promise<InboxMessageRow[]> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "manager");

    const { data: recs, error } = await supabase
      .from("exec_message_recipients")
      .select(
        "id, message_id, read_at, exec_messages!inner(id, subject, sender_user_id, created_at)",
      )
      .eq("organization_id", data.organization_id);
    if (error) throw error;

    const rows = (recs ?? []) as Array<{
      id: string;
      message_id: string;
      read_at: string | null;
      exec_messages: {
        id: string;
        subject: string;
        sender_user_id: string;
        created_at: string;
      };
    }>;

    if (rows.length === 0) return [];

    const senderIds = Array.from(new Set(rows.map((r) => r.exec_messages.sender_user_id)));
    const messageIds = rows.map((r) => r.message_id);

    // Sender names (best-effort; fall back to "HIVE Executive")
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", senderIds);
    const nameById = new Map<string, string>();
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
      if (p.full_name && p.full_name.trim()) nameById.set(p.id, p.full_name.trim());
    }

    // Attachment counts — scope to this org's folder only.
    const orgPrefix = `${data.organization_id}/`;
    const { data: atts } = await supabase
      .from("exec_message_attachments")
      .select("message_id, storage_path")
      .in("message_id", messageIds)
      .like("storage_path", `${orgPrefix}%`);
    const countByMsg = new Map<string, number>();
    for (const a of (atts ?? []) as Array<{ message_id: string; storage_path: string }>) {
      countByMsg.set(a.message_id, (countByMsg.get(a.message_id) ?? 0) + 1);
    }

    const result: InboxMessageRow[] = rows.map((r) => ({
      message_id: r.message_id,
      recipient_id: r.id,
      subject: r.exec_messages.subject,
      sender_name: nameById.get(r.exec_messages.sender_user_id) ?? "HIVE Executive",
      created_at: r.exec_messages.created_at,
      read_at: r.read_at,
      attachment_count: countByMsg.get(r.message_id) ?? 0,
    }));

    result.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return result;
  });

// ─── Open a message (mark read + return body + signed urls) ─────────────

const openSchema = z.object({
  organization_id: z.string().uuid(),
  message_id: z.string().uuid(),
});

export const openInboxMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => openSchema.parse(d))
  .handler(async ({ data, context }): Promise<InboxMessageDetail> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "manager");

    // Verify a recipient row exists for THIS org. If not → reject.
    const { data: rec, error: recErr } = await supabase
      .from("exec_message_recipients")
      .select("id, read_at, read_by")
      .eq("organization_id", data.organization_id)
      .eq("message_id", data.message_id)
      .maybeSingle();
    if (recErr) throw recErr;
    if (!rec) throw new Error("Message not found for this organization.");

    // Idempotent mark-as-read: only update if not already read.
    if (rec.read_at === null) {
      const { error: updErr } = await supabase
        .from("exec_message_recipients")
        .update({ read_at: new Date().toISOString(), read_by: userId })
        .eq("id", rec.id)
        .is("read_at", null); // belt-and-suspenders
      if (updErr) throw updErr;
    }

    // Fetch the message
    const { data: msg, error: msgErr } = await supabase
      .from("exec_messages")
      .select("id, subject, body, sender_user_id, created_at")
      .eq("id", data.message_id)
      .single();
    if (msgErr) throw msgErr;

    // Sender display name
    let senderName = "HIVE Executive";
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", msg.sender_user_id)
      .maybeSingle();
    if (prof?.full_name && prof.full_name.trim()) senderName = prof.full_name.trim();

    // Attachments scoped to THIS org's folder
    const orgPrefix = `${data.organization_id}/`;
    const { data: atts, error: attErr } = await supabase
      .from("exec_message_attachments")
      .select("id, filename, size_bytes, mime_type, storage_path")
      .eq("message_id", data.message_id)
      .like("storage_path", `${orgPrefix}%`)
      .order("created_at", { ascending: true });
    if (attErr) throw attErr;

    const attachments: InboxAttachment[] = [];
    for (const a of (atts ?? []) as Array<{
      id: string;
      filename: string;
      size_bytes: number | null;
      mime_type: string | null;
      storage_path: string;
    }>) {
      // Defense in depth: ensure path is under this org
      if (!a.storage_path.startsWith(orgPrefix)) continue;
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(a.storage_path, 60 * 10); // 10-minute download window
      attachments.push({ ...a, signed_url: signed?.signedUrl ?? null });
    }

    // Reflect the freshly-set read_at for the caller
    const readAt = rec.read_at ?? new Date().toISOString();

    return {
      message_id: msg.id,
      subject: msg.subject,
      body: msg.body ?? "",
      sender_name: senderName,
      created_at: msg.created_at,
      read_at: readAt,
      attachments,
    };
  });
