/**
 * Soft + Ask staff threads persist (Compliance revamp Step 9).
 * No-ops cleanly until Core applies 20260911150000_threads_records.sql.
 * Zero PHI in notification / email / SMS copy.
 */

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import type { Database } from "@/integrations/supabase/types";
import { resolveOrgSender } from "@/lib/email.functions";
import { normalizeUSPhoneToE164 } from "@/lib/us-phone";
import {
  ASK_NOTIFICATION_TYPE,
  advisoryMoveToClientThread,
  missingThreadsTable,
  phiSafeAskNotify,
  sanitizeThreadBody,
  shiftAskSubject,
  teamThreadSubject,
  type ThreadKind,
  type ThreadMessageKind,
} from "./threads.ts";

const ORG = z.string().uuid();

export type ThreadRow = {
  id: string;
  organization_id: string;
  kind: ThreadKind;
  subject: string;
  timesheet_id: string | null;
  team_id: string | null;
  client_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ThreadMessageRow = {
  id: string;
  thread_id: string;
  author_id: string | null;
  kind: ThreadMessageKind;
  body: string;
  created_at: string;
};

export type ThreadListItem = ThreadRow & {
  unread_for_me: boolean;
  last_body: string | null;
};

function asThreadKind(value: string): ThreadKind {
  return value === "team" || value === "client" ? value : "shift";
}

function asMessageKind(value: string): ThreadMessageKind {
  return value === "question" || value === "answer" ? value : "message";
}

async function sendAskEmail(input: {
  supabase: SupabaseClient<Database> | SupabaseClient;
  organizationId: string;
  to: string;
}): Promise<{ ok: boolean }> {
  try {
    const copy = phiSafeAskNotify({ channel: "email" });
    const sender = await resolveOrgSender(input.supabase, input.organizationId);
    const { error } = await input.supabase.functions.invoke("send-email", {
      body: {
        from: sender.from,
        to: input.to,
        subject: copy.subject ?? copy.title,
        text: copy.body,
        reply_to: sender.reply_to,
      },
    });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

async function sendAskSms(phone: string | null): Promise<{ ok: boolean }> {
  const e164 = phone ? normalizeUSPhoneToE164(phone) : null;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!e164 || !sid || !token || !from) return { ok: false };
  try {
    const copy = phiSafeAskNotify({ channel: "sms" });
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: e164, From: from, Body: copy.body }),
      },
    );
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export const listMyThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: ORG }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) {
      return { rows: [] as ThreadListItem[], softReady: false };
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    const threadsRes = await supabase
      .from("threads")
      .select(
        "id, organization_id, kind, subject, timesheet_id, team_id, client_id, created_by, created_at, updated_at",
      )
      .eq("organization_id", data.organizationId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (threadsRes.error) {
      if (missingThreadsTable(threadsRes.error.message)) {
        return { rows: [] as ThreadListItem[], softReady: false };
      }
      throw new Error(threadsRes.error.message);
    }
    const ids = (threadsRes.data ?? []).map((t) => t.id);
    const messagesRes =
      ids.length === 0
        ? { data: [] as Array<{ thread_id: string; body: string; created_at: string; kind: string }>, error: null }
        : await supabase
            .from("thread_messages")
            .select("thread_id, body, created_at, kind")
            .in("thread_id", ids)
            .order("created_at", { ascending: false });
    if (messagesRes.error && missingThreadsTable(messagesRes.error.message)) {
      return { rows: [] as ThreadListItem[], softReady: false };
    }
    if (messagesRes.error) throw new Error(messagesRes.error.message);
    const lastByThread = new Map<string, { body: string; kind: string }>();
    for (const msg of messagesRes.data ?? []) {
      if (!lastByThread.has(msg.thread_id)) {
        lastByThread.set(msg.thread_id, { body: msg.body, kind: msg.kind });
      }
    }
    const rows: ThreadListItem[] = (threadsRes.data ?? []).map((t) => {
      const last = lastByThread.get(t.id);
      return {
        id: t.id,
        organization_id: t.organization_id,
        kind: asThreadKind(t.kind),
        subject: t.subject,
        timesheet_id: t.timesheet_id,
        team_id: t.team_id,
        client_id: t.client_id,
        created_by: t.created_by,
        created_at: t.created_at,
        updated_at: t.updated_at,
        last_body: last?.body ?? null,
        unread_for_me: last?.kind === "question" && t.created_by !== userId,
      };
    });
    return { rows, softReady: true };
  });

export const listThreadMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: ORG, threadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) {
      return { rows: [] as ThreadMessageRow[], softReady: false };
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    const { data: rows, error } = await supabase
      .from("thread_messages")
      .select("id, thread_id, author_id, kind, body, created_at")
      .eq("organization_id", data.organizationId)
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (error) {
      if (missingThreadsTable(error.message)) {
        return { rows: [] as ThreadMessageRow[], softReady: false };
      }
      throw new Error(error.message);
    }
    return {
      softReady: true,
      rows: (rows ?? []).map((r) => ({
        id: r.id,
        thread_id: r.thread_id,
        author_id: r.author_id,
        kind: asMessageKind(r.kind),
        body: r.body,
        created_at: r.created_at,
      })),
    };
  });

export const askStaffOnTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: ORG,
        timesheetId: z.string().uuid(),
        question: z.string().trim().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) {
      return { ok: false, softReady: false, threadId: null as string | null };
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: sheet, error: sheetErr } = await supabase
      .from("evv_timesheets")
      .select("id, staff_id, client_id, organization_id")
      .eq("id", data.timesheetId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (sheetErr) throw new Error(sheetErr.message);
    if (!sheet?.staff_id) throw new Error("Timesheet not found.");

    const question = sanitizeThreadBody(data.question);
    const threadIns = await supabase
      .from("threads")
      .insert({
        organization_id: data.organizationId,
        kind: "shift",
        subject: shiftAskSubject(),
        timesheet_id: sheet.id,
        client_id: sheet.client_id,
        created_by: userId,
      })
      .select("id")
      .single();
    if (threadIns.error) {
      if (missingThreadsTable(threadIns.error.message)) {
        return { ok: false, softReady: false, threadId: null };
      }
      throw new Error(threadIns.error.message);
    }
    const threadId = threadIns.data.id;
    const members = await supabase.from("thread_members").insert([
      {
        organization_id: data.organizationId,
        thread_id: threadId,
        user_id: userId,
        role: "asker",
      },
      {
        organization_id: data.organizationId,
        thread_id: threadId,
        user_id: sheet.staff_id,
        role: "staff",
      },
    ]);
    if (members.error && !missingThreadsTable(members.error.message)) {
      throw new Error(members.error.message);
    }
    const msg = await supabase.from("thread_messages").insert({
      organization_id: data.organizationId,
      thread_id: threadId,
      author_id: userId,
      kind: "question",
      body: question,
    });
    if (msg.error && !missingThreadsTable(msg.error.message)) {
      throw new Error(msg.error.message);
    }

    const copy = phiSafeAskNotify({ channel: "notification" });
    await supabase.from("notifications").insert({
      organization_id: data.organizationId,
      recipient_user_id: sheet.staff_id,
      recipient_role: "employee",
      title: copy.title,
      body: copy.body,
      type: ASK_NOTIFICATION_TYPE,
      urgency: "normal",
      link_to: "/dashboard/my-obligations?tab=threads",
      related_id: threadId,
      related_type: "thread",
    });

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, phone")
      .eq("id", sheet.staff_id)
      .maybeSingle();
    if (profile?.email) {
      await sendAskEmail({
        supabase,
        organizationId: data.organizationId,
        to: profile.email,
      });
    }
    await sendAskSms(profile?.phone ?? null);

    return { ok: true, softReady: true, threadId };
  });

export const replyOnThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: ORG,
        threadId: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false, softReady: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    const body = sanitizeThreadBody(data.body);
    const { data: thread, error: tErr } = await supabase
      .from("threads")
      .select("id, timesheet_id, created_by")
      .eq("id", data.threadId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (tErr) {
      if (missingThreadsTable(tErr.message)) return { ok: false, softReady: false };
      throw new Error(tErr.message);
    }
    if (!thread) throw new Error("Thread not found.");

    const ins = await supabase.from("thread_messages").insert({
      organization_id: data.organizationId,
      thread_id: data.threadId,
      author_id: userId,
      kind: "answer",
      body,
    });
    if (ins.error) {
      if (missingThreadsTable(ins.error.message)) return { ok: false, softReady: false };
      throw new Error(ins.error.message);
    }
    await supabase
      .from("threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.threadId)
      .eq("organization_id", data.organizationId);

    if (thread.timesheet_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, first_name, last_name, email")
        .eq("id", userId)
        .maybeSingle();
      const adminName =
        profile?.full_name ||
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
        profile?.email ||
        "Staff";
      const nowIso = new Date().toISOString();
      const { error: noteErr } = await supabase
        .from("evv_timesheets")
        .update({
          manager_note_text: body,
          manager_note_by: userId,
          manager_note_by_name: adminName,
          manager_note_at: nowIso,
        })
        .eq("id", thread.timesheet_id)
        .eq("organization_id", data.organizationId);
      if (noteErr) throw new Error(noteErr.message);
    }
    return { ok: true, softReady: true };
  });

export const createTeamThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: ORG,
        teamId: z.string().uuid(),
        subject: z.string().trim().max(120).optional(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) {
      return { ok: false, softReady: false, threadId: null as string | null };
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const subject = teamThreadSubject(data.subject);
    const threadIns = await supabase
      .from("threads")
      .insert({
        organization_id: data.organizationId,
        kind: "team",
        subject,
        team_id: data.teamId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (threadIns.error) {
      if (missingThreadsTable(threadIns.error.message)) {
        return { ok: false, softReady: false, threadId: null };
      }
      throw new Error(threadIns.error.message);
    }
    const threadId = threadIns.data.id;
    await supabase.from("thread_members").insert({
      organization_id: data.organizationId,
      thread_id: threadId,
      user_id: userId,
      role: "asker",
    });
    await supabase.from("thread_messages").insert({
      organization_id: data.organizationId,
      thread_id: threadId,
      author_id: userId,
      kind: "message",
      body: sanitizeThreadBody(data.body),
    });
    return { ok: true, softReady: true, threadId };
  });

export const adviseMoveToClientThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: ORG, threadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) {
      return advisoryMoveToClientThread({ kind: "shift", hasClientId: false });
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    const { data: thread, error } = await supabase
      .from("threads")
      .select("kind, client_id")
      .eq("id", data.threadId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !thread) {
      return advisoryMoveToClientThread({ kind: "shift", hasClientId: false });
    }
    return advisoryMoveToClientThread({
      kind: asThreadKind(thread.kind),
      hasClientId: !!thread.client_id,
    });
  });
