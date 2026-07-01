// =============================================================
// Provider ↔ HIVE Admin approval requests for external
// billing codes discovered in Smart-Import PCSPs.
//
// Provider self-attestation is GONE. To bill an outside-provider
// code the provider must open a threaded conversation with HIVE
// Admin, provide justification, and receive an explicit approval
// by a HIVE Admin. This module owns the entire lifecycle.
// =============================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { z } from "zod";

// ---------- Shared types ---------------------------------------

export type ApprovalStatus = "pending" | "approved" | "denied" | "withdrawn";
export type SenderRole = "provider" | "hive_admin";
export type ResolutionAction = "approve" | "deny";

export interface ApprovalRequestRow {
  id: string;
  organization_id: string;
  organization_name: string | null;
  requesting_user_id: string;
  requesting_user_name: string | null;
  import_job_id: string | null;
  subject_id: string | null;
  extracted_field_id: string | null;
  code: string;
  provider_name_on_pcsp: string | null;
  justification: string;
  status: ApprovalStatus;
  resolved_by_user_id: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  unread_for_me: number;
}

export interface ApprovalMessageRow {
  id: string;
  request_id: string;
  sender_user_id: string;
  sender_name: string | null;
  sender_role: SenderRole;
  body: string;
  action: ResolutionAction | null;
  created_at: string;
  read_by_provider_at: string | null;
  read_by_hive_at: string | null;
}

export interface ApprovalThread {
  request: ApprovalRequestRow;
  messages: ApprovalMessageRow[];
  viewer_side: SenderRole;
}

// Small util so we can look up display names for a bag of user ids
// without hard-coupling to any existing helper.
type ProfileLite = { id: string; full_name: string | null; email: string | null };

async function loadProfilesFor(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return out;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", unique);
  for (const p of ((data ?? []) as ProfileLite[])) {
    out.set(p.id, p.full_name || p.email || "Unknown");
  }
  return out;
}

async function loadOrgNames(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return out;
  const { data } = await supabase.from("organizations").select("id, name").in("id", unique);
  for (const o of ((data ?? []) as { id: string; name: string | null }[])) {
    out.set(o.id, o.name ?? "Organization");
  }
  return out;
}

async function isHiveExec(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("hive_executives")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  return !!data;
}

// ---------- open request ---------------------------------------

const OpenInput = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(1).max(40),
  providerNameOnPcsp: z.string().max(300).nullable().optional(),
  justification: z.string().min(20).max(4000),
  importJobId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  extractedFieldId: z.string().uuid().nullable().optional(),
});

export const openApprovalRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => OpenInput.parse(d))
  .handler(async ({ data, context }): Promise<{ requestId: string }> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    // If a pending / approved request already exists for this exact
    // extracted-field row, return it instead of creating a duplicate.
    if (data.extractedFieldId) {
      const { data: existing } = await supabase
        .from("billing_code_approval_requests")
        .select("id, status")
        .eq("organization_id", data.organizationId)
        .eq("extracted_field_id", data.extractedFieldId)
        .in("status", ["pending", "approved"])
        .maybeSingle();
      if (existing?.id) return { requestId: existing.id as string };
    }

    const { data: req, error: reqErr } = await supabase
      .from("billing_code_approval_requests")
      .insert({
        organization_id: data.organizationId,
        requesting_user_id: userId,
        import_job_id: data.importJobId ?? null,
        subject_id: data.subjectId ?? null,
        extracted_field_id: data.extractedFieldId ?? null,
        code: data.code.trim().toUpperCase(),
        provider_name_on_pcsp: data.providerNameOnPcsp?.trim() || null,
        justification: data.justification.trim(),
        status: "pending",
      })
      .select("id")
      .single();
    if (reqErr || !req) throw new Error(reqErr?.message || "Failed to open request");

    // Seed the thread with the provider's opening message = the justification.
    const { error: msgErr } = await supabase.from("billing_code_approval_messages").insert({
      request_id: req.id,
      sender_user_id: userId,
      sender_role: "provider",
      body: data.justification.trim(),
    });
    if (msgErr) throw new Error(msgErr.message);

    return { requestId: req.id as string };
  });

// ---------- post message ---------------------------------------

const PostInput = z.object({
  requestId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  action: z.enum(["approve", "deny"]).nullable().optional(),
});

export const postApprovalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PostInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;

    const { data: req, error } = await supabase
      .from("billing_code_approval_requests")
      .select("id, organization_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error || !req) throw new Error(error?.message || "Request not found");

    const hive = await isHiveExec(supabase, userId);
    let side: SenderRole;
    if (hive) side = "hive_admin";
    else {
      await requireOrgMembership(supabase, userId, req.organization_id as string, "manager");
      side = "provider";
    }

    // A resolution action is only valid from a HIVE Admin, on a pending request.
    if (data.action) {
      if (side !== "hive_admin") throw new Error("Only HIVE Admin can approve or deny");
      if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);
    }

    const now = new Date().toISOString();

    const { error: mErr } = await supabase.from("billing_code_approval_messages").insert({
      request_id: req.id,
      sender_user_id: userId,
      sender_role: side,
      body: data.body.trim(),
      action: data.action ?? null,
      // Author's own side is read at insert time.
      read_by_provider_at: side === "provider" ? now : null,
      read_by_hive_at: side === "hive_admin" ? now : null,
    });
    if (mErr) throw new Error(mErr.message);

    if (data.action) {
      const { error: uErr } = await supabase
        .from("billing_code_approval_requests")
        .update({
          status: data.action === "approve" ? "approved" : "denied",
          resolved_by_user_id: userId,
          resolved_at: now,
          resolution_note: data.body.trim().slice(0, 2000),
        })
        .eq("id", req.id);
      if (uErr) throw new Error(uErr.message);
    }

    return { ok: true };
  });

// ---------- withdraw -------------------------------------------

const WithdrawInput = z.object({ requestId: z.string().uuid() });

export const withdrawApprovalRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => WithdrawInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { data: req } = await supabase
      .from("billing_code_approval_requests")
      .select("id, organization_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);
    await requireOrgMembership(supabase, userId, req.organization_id as string, "manager");

    await supabase
      .from("billing_code_approval_requests")
      .update({ status: "withdrawn", resolved_at: new Date().toISOString(), resolved_by_user_id: userId })
      .eq("id", req.id);

    await supabase.from("billing_code_approval_messages").insert({
      request_id: req.id,
      sender_user_id: userId,
      sender_role: "provider",
      body: "Request withdrawn by the provider.",
    });

    return { ok: true };
  });

// ---------- list (provider) ------------------------------------

const ListMineInput = z.object({ organizationId: z.string().uuid() });

export const listMyApprovalRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ListMineInput.parse(d))
  .handler(async ({ data, context }): Promise<ApprovalRequestRow[]> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    return listRequestsInternal(supabase, { organizationId: data.organizationId, viewerSide: "provider", viewerUserId: userId });
  });

// ---------- list (HIVE Admin queue) ----------------------------

const ListHiveInput = z.object({ status: z.enum(["pending", "resolved", "all"]).default("pending") });

export const listPendingHiveApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ListHiveInput.parse(d))
  .handler(async ({ data, context }): Promise<ApprovalRequestRow[]> => {
    const { supabase, userId } = context;
    if (!(await isHiveExec(supabase, userId))) throw new Error("HIVE Admin only");
    return listRequestsInternal(supabase, { viewerSide: "hive_admin", viewerUserId: userId, statusFilter: data.status });
  });

async function listRequestsInternal(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  opts: {
    organizationId?: string;
    viewerSide: SenderRole;
    viewerUserId: string;
    statusFilter?: "pending" | "resolved" | "all";
  },
): Promise<ApprovalRequestRow[]> {
  let q = supabase
    .from("billing_code_approval_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  if (opts.statusFilter === "pending") q = q.eq("status", "pending");
  else if (opts.statusFilter === "resolved") q = q.in("status", ["approved", "denied", "withdrawn"]);
  const { data: reqs, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (reqs ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const reqIds = rows.map((r) => r.id as string);
  const [msgsResp, profiles, orgs] = await Promise.all([
    supabase
      .from("billing_code_approval_messages")
      .select("request_id, created_at, sender_role, read_by_provider_at, read_by_hive_at")
      .in("request_id", reqIds),
    loadProfilesFor(
      supabase,
      rows.flatMap((r) => [r.requesting_user_id as string, r.resolved_by_user_id as string]).filter(Boolean),
    ),
    loadOrgNames(supabase, rows.map((r) => r.organization_id as string)),
  ]);

  const msgs = (msgsResp.data ?? []) as Array<{
    request_id: string;
    created_at: string;
    sender_role: SenderRole;
    read_by_provider_at: string | null;
    read_by_hive_at: string | null;
  }>;

  const lastByReq = new Map<string, string>();
  const unreadByReq = new Map<string, number>();
  for (const m of msgs) {
    const prev = lastByReq.get(m.request_id);
    if (!prev || m.created_at > prev) lastByReq.set(m.request_id, m.created_at);
    const otherWroteIt = m.sender_role !== opts.viewerSide;
    const meRead = opts.viewerSide === "provider" ? m.read_by_provider_at : m.read_by_hive_at;
    if (otherWroteIt && !meRead) unreadByReq.set(m.request_id, (unreadByReq.get(m.request_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id as string,
    organization_id: r.organization_id as string,
    organization_name: orgs.get(r.organization_id as string) ?? null,
    requesting_user_id: r.requesting_user_id as string,
    requesting_user_name: profiles.get(r.requesting_user_id as string) ?? null,
    import_job_id: (r.import_job_id as string | null) ?? null,
    subject_id: (r.subject_id as string | null) ?? null,
    extracted_field_id: (r.extracted_field_id as string | null) ?? null,
    code: r.code as string,
    provider_name_on_pcsp: (r.provider_name_on_pcsp as string | null) ?? null,
    justification: r.justification as string,
    status: r.status as ApprovalStatus,
    resolved_by_user_id: (r.resolved_by_user_id as string | null) ?? null,
    resolved_by_name: r.resolved_by_user_id ? (profiles.get(r.resolved_by_user_id as string) ?? null) : null,
    resolved_at: (r.resolved_at as string | null) ?? null,
    resolution_note: (r.resolution_note as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    last_activity_at: lastByReq.get(r.id as string) ?? (r.updated_at as string) ?? (r.created_at as string),
    unread_for_me: unreadByReq.get(r.id as string) ?? 0,
  }));
}

// ---------- get thread -----------------------------------------

const ThreadInput = z.object({ requestId: z.string().uuid() });

export const getApprovalThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ThreadInput.parse(d))
  .handler(async ({ data, context }): Promise<ApprovalThread> => {
    const { supabase, userId } = context;

    const { data: req, error } = await supabase
      .from("billing_code_approval_requests")
      .select("*")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error || !req) throw new Error(error?.message || "Request not found");

    const hive = await isHiveExec(supabase, userId);
    let viewer: SenderRole;
    if (hive) viewer = "hive_admin";
    else {
      await requireOrgMembership(supabase, userId, req.organization_id as string, "manager");
      viewer = "provider";
    }

    const { data: msgsRaw } = await supabase
      .from("billing_code_approval_messages")
      .select("*")
      .eq("request_id", req.id)
      .order("created_at", { ascending: true });
    const msgs = (msgsRaw ?? []) as Array<Record<string, unknown>>;

    const [profiles, orgs] = await Promise.all([
      loadProfilesFor(
        supabase,
        [
          req.requesting_user_id as string,
          req.resolved_by_user_id as string | null,
          ...msgs.map((m) => m.sender_user_id as string),
        ].filter(Boolean) as string[],
      ),
      loadOrgNames(supabase, [req.organization_id as string]),
    ]);

    const request: ApprovalRequestRow = {
      id: req.id as string,
      organization_id: req.organization_id as string,
      organization_name: orgs.get(req.organization_id as string) ?? null,
      requesting_user_id: req.requesting_user_id as string,
      requesting_user_name: profiles.get(req.requesting_user_id as string) ?? null,
      import_job_id: (req.import_job_id as string | null) ?? null,
      subject_id: (req.subject_id as string | null) ?? null,
      extracted_field_id: (req.extracted_field_id as string | null) ?? null,
      code: req.code as string,
      provider_name_on_pcsp: (req.provider_name_on_pcsp as string | null) ?? null,
      justification: req.justification as string,
      status: req.status as ApprovalStatus,
      resolved_by_user_id: (req.resolved_by_user_id as string | null) ?? null,
      resolved_by_name: req.resolved_by_user_id ? (profiles.get(req.resolved_by_user_id as string) ?? null) : null,
      resolved_at: (req.resolved_at as string | null) ?? null,
      resolution_note: (req.resolution_note as string | null) ?? null,
      created_at: req.created_at as string,
      updated_at: req.updated_at as string,
      last_activity_at:
        msgs.length > 0 ? (msgs[msgs.length - 1].created_at as string) : (req.updated_at as string),
      unread_for_me: 0,
    };

    const messages: ApprovalMessageRow[] = msgs.map((m) => ({
      id: m.id as string,
      request_id: m.request_id as string,
      sender_user_id: m.sender_user_id as string,
      sender_name: profiles.get(m.sender_user_id as string) ?? null,
      sender_role: m.sender_role as SenderRole,
      body: m.body as string,
      action: (m.action as ResolutionAction | null) ?? null,
      created_at: m.created_at as string,
      read_by_provider_at: (m.read_by_provider_at as string | null) ?? null,
      read_by_hive_at: (m.read_by_hive_at as string | null) ?? null,
    }));

    return { request, messages, viewer_side: viewer };
  });

// ---------- mark read ------------------------------------------

const MarkReadInput = z.object({ requestId: z.string().uuid() });

export const markApprovalThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MarkReadInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { data: req } = await supabase
      .from("billing_code_approval_requests")
      .select("id, organization_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Request not found");

    const hive = await isHiveExec(supabase, userId);
    let column: "read_by_provider_at" | "read_by_hive_at";
    let otherSide: SenderRole;
    if (hive) { column = "read_by_hive_at"; otherSide = "provider"; }
    else {
      await requireOrgMembership(supabase, userId, req.organization_id as string, "manager");
      column = "read_by_provider_at"; otherSide = "hive_admin";
    }

    const now = new Date().toISOString();
    const patch =
      column === "read_by_hive_at" ? { read_by_hive_at: now } : { read_by_provider_at: now };
    await supabase
      .from("billing_code_approval_messages")
      .update(patch)
      .eq("request_id", req.id)
      .eq("sender_role", otherSide)
      .is(column, null);

    return { ok: true };
  });

// ---------- unread count (for provider Inbox pill) --------------

const UnreadInput = z.object({ organizationId: z.string().uuid() });

export const getApprovalUnreadCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UnreadInput.parse(d))
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: reqs } = await supabase
      .from("billing_code_approval_requests")
      .select("id")
      .eq("organization_id", data.organizationId);
    const ids = ((reqs ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return { count: 0 };

    const { count } = await supabase
      .from("billing_code_approval_messages")
      .select("id", { count: "exact", head: true })
      .in("request_id", ids)
      .eq("sender_role", "hive_admin")
      .is("read_by_provider_at", null);
    return { count: count ?? 0 };
  });

// Same shape for the HIVE Admin nav pill.
export const getHiveApprovalUnreadCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ count: number; pending: number }> => {
    const { supabase, userId } = context;
    if (!(await isHiveExec(supabase, userId))) return { count: 0, pending: 0 };

    const [{ count: pending }, { data: allReqs }] = await Promise.all([
      supabase
        .from("billing_code_approval_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase.from("billing_code_approval_requests").select("id"),
    ]);
    const ids = ((allReqs ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return { count: 0, pending: pending ?? 0 };

    const { count } = await supabase
      .from("billing_code_approval_messages")
      .select("id", { count: "exact", head: true })
      .in("request_id", ids)
      .eq("sender_role", "provider")
      .is("read_by_hive_at", null);
    return { count: count ?? 0, pending: pending ?? 0 };
  });

// ---------- lookup helper: which requests exist for a set of ----
// extracted-field ids in this org. Used by the review UI to
// render "Pending / Approved / Denied" state per billing row.

const LookupInput = z.object({
  organizationId: z.string().uuid(),
  extractedFieldIds: z.array(z.string().uuid()).max(500),
});

export const lookupApprovalRequestsForFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => LookupInput.parse(d))
  .handler(async ({ data, context }): Promise<Record<string, ApprovalRequestRow | null>> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    if (data.extractedFieldIds.length === 0) return {};

    const all = await listRequestsInternal(supabase, {
      organizationId: data.organizationId,
      viewerSide: "provider",
      viewerUserId: userId,
    });
    const byField: Record<string, ApprovalRequestRow | null> = {};
    for (const fieldId of data.extractedFieldIds) byField[fieldId] = null;
    // Prefer most recent non-withdrawn per field.
    for (const r of all) {
      if (!r.extracted_field_id) continue;
      if (!data.extractedFieldIds.includes(r.extracted_field_id)) continue;
      if (r.status === "withdrawn" && byField[r.extracted_field_id]) continue;
      if (!byField[r.extracted_field_id]) byField[r.extracted_field_id] = r;
    }
    return byField;
  });
