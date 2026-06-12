import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ────────────────────────────────────────────────────────────────

export interface OrgForMessaging {
  id: string;
  name: string;
  is_demo: boolean;
}

export interface CreateExecMessageResult {
  message_id: string;
  organization_ids: string[];
  sender_user_id: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function ensureHiveExecutive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("hive_executives")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Access denied — HIVE Executive permission required.");
}

// ─── List all organizations (HIVE Exec only) ──────────────────────────────

export const listAllOrganizationsForMessaging = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrgForMessaging[]> => {
    const { supabase, userId } = context;
    await ensureHiveExecutive(supabase, userId);

    // HIVE Execs can read every organization via existing RLS
    // (organizations policy allows hive_executives). If a row is filtered,
    // surface it as a missing org rather than silently dropping.
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, is_demo")
      .order("is_demo", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as OrgForMessaging[];
  });

// ─── Create message + recipients (no attachments yet) ─────────────────────

const createSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(500),
  body: z.string().max(50_000).default(""),
  scope: z.enum(["all", "selected"]),
  organization_ids: z.array(z.string().uuid()).max(10_000).default([]),
});

export const createExecMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }): Promise<CreateExecMessageResult> => {
    const { supabase, userId } = context;
    await ensureHiveExecutive(supabase, userId);

    // Resolve recipient org list SERVER-SIDE.
    let orgIds: string[];
    if (data.scope === "all") {
      const { data: orgs, error } = await supabase
        .from("organizations")
        .select("id");
      if (error) throw error;
      orgIds = (orgs ?? []).map((o: { id: string }) => o.id);
    } else {
      orgIds = Array.from(new Set(data.organization_ids));
    }
    if (orgIds.length === 0) {
      throw new Error("At least one recipient organization is required.");
    }

    // Insert the message
    const { data: msg, error: msgErr } = await supabase
      .from("exec_messages")
      .insert({
        sender_user_id: userId,
        subject: data.subject.trim(),
        body: data.body ?? "",
      })
      .select("id")
      .single();
    if (msgErr) throw msgErr;
    const messageId = msg.id as string;

    // Insert recipients in one batch
    const rows = orgIds.map((organization_id) => ({
      message_id: messageId,
      organization_id,
    }));
    const { error: recErr } = await supabase.from("exec_message_recipients").insert(rows);
    if (recErr) {
      // Rollback — delete the message; cascade clears anything attached
      await supabase.from("exec_messages").delete().eq("id", messageId);
      throw recErr;
    }

    return {
      message_id: messageId,
      organization_ids: orgIds,
      sender_user_id: userId,
    };
  });

// ─── Record an attachment row ─────────────────────────────────────────────

const attachSchema = z.object({
  message_id: z.string().uuid(),
  storage_path: z.string().min(1).max(1024),
  filename: z.string().min(1).max(512),
  mime_type: z.string().max(255).nullable().optional(),
  size_bytes: z.number().int().nonnegative().nullable().optional(),
});

export const recordExecMessageAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => attachSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureHiveExecutive(supabase, userId);

    // Verify the message exists and was sent by this exec
    const { data: msg, error: msgErr } = await supabase
      .from("exec_messages")
      .select("id, sender_user_id")
      .eq("id", data.message_id)
      .maybeSingle();
    if (msgErr) throw msgErr;
    if (!msg) throw new Error("Message not found.");
    if (msg.sender_user_id !== userId) {
      throw new Error("Only the sending executive may attach files to this message.");
    }

    const { error } = await supabase.from("exec_message_attachments").insert({
      message_id: data.message_id,
      storage_path: data.storage_path,
      filename: data.filename,
      mime_type: data.mime_type ?? null,
      size_bytes: data.size_bytes ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

// ─── Discard a message (rollback) ─────────────────────────────────────────

const discardSchema = z.object({ message_id: z.string().uuid() });

export const discardExecMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => discardSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureHiveExecutive(supabase, userId);

    const { data: msg, error: msgErr } = await supabase
      .from("exec_messages")
      .select("id, sender_user_id")
      .eq("id", data.message_id)
      .maybeSingle();
    if (msgErr) throw msgErr;
    if (!msg) return { ok: true };
    if (msg.sender_user_id !== userId) {
      throw new Error("Only the sending executive may discard this message.");
    }

    // Best-effort: enumerate storage objects under any folder containing
    // this message id and delete them via admin. (Storage policies do not
    // grant DELETE.)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // List all org folders
      const { data: orgFolders } = await supabaseAdmin.storage
        .from("message-attachments")
        .list("", { limit: 10_000 });
      for (const folder of orgFolders ?? []) {
        const prefix = `${folder.name}/${data.message_id}`;
        const { data: files } = await supabaseAdmin.storage
          .from("message-attachments")
          .list(prefix, { limit: 1000 });
        if (files && files.length > 0) {
          const paths = files.map((f) => `${prefix}/${f.name}`);
          await supabaseAdmin.storage.from("message-attachments").remove(paths);
        }
      }
    } catch (e) {
      // Don't fail the rollback on cleanup errors; row delete still happens.
      console.warn("discardExecMessage storage cleanup:", e);
    }

    // Cascade deletes recipients + attachments
    const { error: delErr } = await supabase
      .from("exec_messages")
      .delete()
      .eq("id", data.message_id);
    if (delErr) throw delErr;
    return { ok: true };
  });

// ─── Sent messages (HIVE Exec only) ───────────────────────────────────────

export interface SentMessageRecipient {
  organization_id: string;
  organization_name: string;
  is_demo: boolean;
  read_at: string | null;
}

export interface SentMessageRow {
  message_id: string;
  subject: string;
  body: string;
  created_at: string;
  recipient_count: number;
  read_count: number;
  attachment_count: number;
  recipients: SentMessageRecipient[];
}

export const listSentExecMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SentMessageRow[]> => {
    const { supabase, userId } = context;
    await ensureHiveExecutive(supabase, userId);

    // Messages this exec sent
    const { data: msgs, error: msgErr } = await supabase
      .from("exec_messages")
      .select("id, subject, body, created_at")
      .eq("sender_user_id", userId)
      .order("created_at", { ascending: false });
    if (msgErr) throw msgErr;
    const messages = (msgs ?? []) as Array<{
      id: string;
      subject: string;
      body: string | null;
      created_at: string;
    }>;
    if (messages.length === 0) return [];

    const messageIds = messages.map((m) => m.id);

    // Recipients with read state
    const { data: recs, error: recErr } = await supabase
      .from("exec_message_recipients")
      .select("message_id, organization_id, read_at")
      .in("message_id", messageIds);
    if (recErr) throw recErr;
    const recRows = (recs ?? []) as Array<{
      message_id: string;
      organization_id: string;
      read_at: string | null;
    }>;

    // Org names (HIVE execs can read every org via existing RLS)
    const orgIds = Array.from(new Set(recRows.map((r) => r.organization_id)));
    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name, is_demo")
      .in("id", orgIds);
    if (orgErr) throw orgErr;
    const orgById = new Map<string, { name: string; is_demo: boolean }>();
    for (const o of (orgs ?? []) as Array<{ id: string; name: string; is_demo: boolean }>) {
      orgById.set(o.id, { name: o.name, is_demo: o.is_demo });
    }

    // Attachment counts (one row per distinct file per message)
    const { data: atts, error: attErr } = await supabase
      .from("exec_message_attachments")
      .select("message_id")
      .in("message_id", messageIds);
    if (attErr) throw attErr;
    const attCountByMsg = new Map<string, number>();
    for (const a of (atts ?? []) as Array<{ message_id: string }>) {
      attCountByMsg.set(a.message_id, (attCountByMsg.get(a.message_id) ?? 0) + 1);
    }

    const recsByMsg = new Map<string, SentMessageRecipient[]>();
    for (const r of recRows) {
      const o = orgById.get(r.organization_id);
      const item: SentMessageRecipient = {
        organization_id: r.organization_id,
        organization_name: o?.name ?? "(unknown org)",
        is_demo: o?.is_demo ?? false,
        read_at: r.read_at,
      };
      const arr = recsByMsg.get(r.message_id) ?? [];
      arr.push(item);
      recsByMsg.set(r.message_id, arr);
    }

    return messages.map((m): SentMessageRow => {
      const rs = recsByMsg.get(m.id) ?? [];
      rs.sort((a, b) => a.organization_name.localeCompare(b.organization_name));
      const readCount = rs.reduce((n, r) => n + (r.read_at ? 1 : 0), 0);
      return {
        message_id: m.id,
        subject: m.subject,
        body: m.body ?? "",
        created_at: m.created_at,
        recipient_count: rs.length,
        read_count: readCount,
        attachment_count: attCountByMsg.get(m.id) ?? 0,
        recipients: rs,
      };
    });
  });

