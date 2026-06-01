import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string, orgId: string) {
  const { data } = await supabase
    .from("organization_members")
    .select("role, active")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.active || !["admin", "manager", "super_admin"].includes(data.role)) {
    throw new Error("Only admins or managers can manage auditor shares.");
  }
}

function deriveStatus(starts: string, ends: string, revokedAt: string | null) {
  if (revokedAt) return "revoked";
  const now = Date.now();
  if (new Date(ends).getTime() < now) return "expired";
  if (new Date(starts).getTime() > now) return "scheduled";
  return "active";
}

/** Create a new auditor share. */
export const createAuditorShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        packet_id: z.string().uuid(),
        recipient_emails: z.array(z.string().email()).min(1).max(10),
        starts_at: z.string().min(10),
        ends_at: z.string().min(10),
        message: z.string().max(2000).optional().nullable(),
        share_all_items: z.boolean().default(true),
        packet_item_ids: z.array(z.string().uuid()).max(500).optional(),
        audit_file_ids: z.array(z.string().uuid()).max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organization_id);

    if (new Date(data.ends_at) <= new Date(data.starts_at))
      throw new Error("Access window end must be after start.");

    const status = deriveStatus(data.starts_at, data.ends_at, null);
    const createdShares: string[] = [];

    for (const email of data.recipient_emails) {
      const { data: share, error } = await supabase
        .from("auditor_shares")
        .insert({
          organization_id: data.organization_id,
          packet_id: data.packet_id,
          recipient_email: email.toLowerCase().trim(),
          starts_at: data.starts_at,
          ends_at: data.ends_at,
          message: data.message ?? null,
          share_all_items: data.share_all_items,
          status,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      createdShares.push(share.id);

      if (!data.share_all_items) {
        const rows: any[] = [];
        for (const pid of data.packet_item_ids ?? [])
          rows.push({ share_id: share.id, packet_item_id: pid });
        for (const fid of data.audit_file_ids ?? [])
          rows.push({ share_id: share.id, audit_file_id: fid });
        if (rows.length > 0) {
          const { error: e2 } = await supabase.from("auditor_share_items").insert(rows);
          if (e2) throw new Error(e2.message);
        }
      }

      await supabase.from("auditor_share_access_log").insert({
        share_id: share.id,
        organization_id: data.organization_id,
        actor_user_id: userId,
        action: "granted",
        payload: { recipient_email: email, starts_at: data.starts_at, ends_at: data.ends_at },
      });
    }

    return { share_ids: createdShares };
  });

/** Revoke a share. */
export const revokeAuditorShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ share_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: share } = await supabase
      .from("auditor_shares")
      .select("organization_id")
      .eq("id", data.share_id)
      .single();
    if (!share) throw new Error("Share not found");
    await assertAdmin(supabase, userId, share.organization_id);

    const { error } = await supabase
      .from("auditor_shares")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: userId })
      .eq("id", data.share_id);
    if (error) throw new Error(error.message);

    await supabase.from("auditor_share_access_log").insert({
      share_id: data.share_id,
      organization_id: share.organization_id,
      actor_user_id: userId,
      action: "revoked",
    });
    return { ok: true };
  });

/** Extend (or shorten) a share's end date. */
export const extendAuditorShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ share_id: z.string().uuid(), ends_at: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: share } = await supabase
      .from("auditor_shares")
      .select("organization_id, starts_at, revoked_at")
      .eq("id", data.share_id)
      .single();
    if (!share) throw new Error("Share not found");
    await assertAdmin(supabase, userId, share.organization_id);
    if (new Date(data.ends_at) <= new Date(share.starts_at))
      throw new Error("End must be after start.");

    const status = deriveStatus(share.starts_at, data.ends_at, share.revoked_at);
    const { error } = await supabase
      .from("auditor_shares")
      .update({ ends_at: data.ends_at, status })
      .eq("id", data.share_id);
    if (error) throw new Error(error.message);

    await supabase.from("auditor_share_access_log").insert({
      share_id: data.share_id,
      organization_id: share.organization_id,
      actor_user_id: userId,
      action: "extended",
      payload: { ends_at: data.ends_at },
    });
    return { ok: true };
  });

/** Auditor view: list shares for the current user's email. */
export const listMyAuditorShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, claims } = context;
    const email = (claims?.email as string | undefined)?.toLowerCase();
    if (!email) return { shares: [] };

    const { data: shares, error } = await supabase
      .from("auditor_shares")
      .select(
        "id, organization_id, packet_id, recipient_email, starts_at, ends_at, status, message, share_all_items, revoked_at, created_at",
      )
      .eq("recipient_email", email)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const packetIds = Array.from(new Set((shares ?? []).map((s) => s.packet_id)));
    const orgIds = Array.from(new Set((shares ?? []).map((s) => s.organization_id)));
    const [{ data: packets }, { data: orgs }] = await Promise.all([
      packetIds.length
        ? supabase.from("audit_packets").select("id, name, fiscal_year, provider_name, timeline_start, timeline_end, expectations_summary").in("id", packetIds)
        : Promise.resolve({ data: [] as any[] }),
      orgIds.length
        ? supabase.from("organizations").select("id, name").in("id", orgIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    return {
      shares: (shares ?? []).map((s) => {
        const live = deriveStatus(s.starts_at, s.ends_at, s.revoked_at);
        return {
          ...s,
          live_status: live,
          packet: packets?.find((p: any) => p.id === s.packet_id) ?? null,
          organization_name: orgs?.find((o: any) => o.id === s.organization_id)?.name ?? null,
        };
      }),
    };
  });

/** Auditor view: full read of a single share, with items + completeness + sources. */
export const getAuditorShareView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ share_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = (claims?.email as string | undefined)?.toLowerCase();

    const { data: share } = await supabase
      .from("auditor_shares")
      .select("*")
      .eq("id", data.share_id)
      .maybeSingle();
    if (!share) throw new Error("Share not found");

    // Allow either: the recipient auditor, or an org admin reading their own log.
    const isRecipient = email && share.recipient_email.toLowerCase() === email;
    let isAdmin = false;
    if (!isRecipient) {
      const { data: m } = await supabase
        .from("organization_members")
        .select("role, active")
        .eq("organization_id", share.organization_id)
        .eq("user_id", userId)
        .maybeSingle();
      isAdmin = !!m?.active && ["admin", "manager", "super_admin"].includes(m.role);
    }
    if (!isRecipient && !isAdmin) {
      await supabase.from("auditor_share_access_log").insert({
        share_id: share.id,
        organization_id: share.organization_id,
        actor_email: email ?? null,
        actor_user_id: userId,
        action: "access_denied",
      });
      throw new Error("You don't have access to this share.");
    }

    const live = deriveStatus(share.starts_at, share.ends_at, share.revoked_at);
    if (isRecipient && live !== "active") {
      await supabase.from("auditor_share_access_log").insert({
        share_id: share.id,
        organization_id: share.organization_id,
        actor_email: email,
        actor_user_id: userId,
        action: "access_denied",
        payload: { reason: live },
      });
      throw new Error(
        live === "scheduled"
          ? `Access opens ${new Date(share.starts_at).toLocaleString()}`
          : live === "expired"
          ? "Access window has ended."
          : "Access has been revoked.",
      );
    }

    const [{ data: packet }, { data: org }, { data: items }, { data: shareItems }, { data: linkedFiles }] =
      await Promise.all([
        supabase.from("audit_packets").select("*").eq("id", share.packet_id).single(),
        supabase.from("organizations").select("id, name").eq("id", share.organization_id).single(),
        supabase
          .from("audit_packet_items")
          .select("id, sub_folder, title, description, status, source_hint, evidence_count, evidence_refs, position")
          .eq("packet_id", share.packet_id)
          .order("sub_folder")
          .order("position"),
        supabase
          .from("auditor_share_items")
          .select("packet_item_id, audit_file_id")
          .eq("share_id", share.id),
        supabase
          .from("audit_files")
          .select("id, period_month, status")
          .eq("audit_packet_id", share.packet_id),
      ]);

    let visibleItems = items ?? [];
    let visibleFiles = linkedFiles ?? [];
    if (!share.share_all_items) {
      const allowedItems = new Set((shareItems ?? []).map((s: any) => s.packet_item_id).filter(Boolean));
      const allowedFiles = new Set((shareItems ?? []).map((s: any) => s.audit_file_id).filter(Boolean));
      visibleItems = visibleItems.filter((i: any) => allowedItems.has(i.id));
      visibleFiles = visibleFiles.filter((f: any) => allowedFiles.has(f.id));
    }

    if (isRecipient) {
      await supabase.from("auditor_share_access_log").insert({
        share_id: share.id,
        organization_id: share.organization_id,
        actor_email: email,
        actor_user_id: userId,
        action: "viewed",
      });
    }

    // NECTAR: pull authoritative sources (SOW/contract) + HIVE training evidence
    const [{ data: sources }, { data: courses }, { data: certs }] = await Promise.all([
      supabase
        .from("nectar_documents")
        .select("id, title, authoritative_kind, created_at")
        .eq("organization_id", share.organization_id)
        .eq("is_authoritative_source", true)
        .limit(20),
      supabase
        .from("courses")
        .select("id, title, description")
        .eq("organization_id", share.organization_id)
        .limit(50),
      supabase
        .from("certifications")
        .select("id, name")
        .eq("organization_id", share.organization_id)
        .limit(100),
    ]);

    return {
      share,
      live_status: live,
      packet,
      organization: org,
      items: visibleItems,
      linked_files: visibleFiles,
      nectar: {
        authoritative_sources: sources ?? [],
        training_courses: courses ?? [],
        certifications: certs ?? [],
      },
    };
  });

/** Admin: list shares for a packet, with derived live status + view counts. */
export const listSharesForPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ packet_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: shares, error } = await supabase
      .from("auditor_shares")
      .select("*")
      .eq("packet_id", data.packet_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (shares ?? []).map((s) => s.id);
    const { data: logs } = ids.length
      ? await supabase
          .from("auditor_share_access_log")
          .select("share_id, action, actor_email, created_at")
          .in("share_id", ids)
          .order("created_at", { ascending: false })
      : { data: [] as any[] };

    return {
      shares: (shares ?? []).map((s) => ({
        ...s,
        live_status: deriveStatus(s.starts_at, s.ends_at, s.revoked_at),
        log: (logs ?? []).filter((l) => l.share_id === s.id).slice(0, 50),
        view_count: (logs ?? []).filter((l) => l.share_id === s.id && l.action === "viewed").length,
      })),
    };
  });

/** Admin: list active+upcoming shares across org (for NECTAR Task Center surface). */
export const listActiveSharesForOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organization_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const nowIso = new Date().toISOString();
    const { data: shares } = await supabase
      .from("auditor_shares")
      .select("id, recipient_email, packet_id, starts_at, ends_at, status, revoked_at")
      .eq("organization_id", data.organization_id)
      .is("revoked_at", null)
      .gte("ends_at", nowIso)
      .order("ends_at", { ascending: true });
    return { shares: shares ?? [] };
  });
