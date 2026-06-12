/**
 * Gmail integration — UI-facing server functions.
 *
 * Public surface (org admins only):
 *  - getGmailConnection       → status + scopes + last_polled_at (NO tokens)
 *  - getGmailOAuthStartUrl    → returns Google authorize URL with signed state
 *  - disconnectGmail          → revokes refresh token + marks disconnected
 *  - listGmailRules / upsertGmailRule / deleteGmailRule
 *  - listGmailAudit
 *
 * Referral review (manage_referrals):
 *  - discardReferral          → soft-discard with 7d purge
 *  - archiveAutoIngestedReferral → 30d purge (shorter than the 90d default)
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { requirePermission } from "@/lib/require-permission";

const orgOnly = z.object({ organization_id: z.string().uuid() });

function callbackUrlFromRequest(): string {
  const req = getRequest();
  const origin = req?.headers?.get("x-forwarded-host")
    ? `https://${req.headers.get("x-forwarded-host")}`
    : new URL(req?.url ?? "https://example.com").origin;
  return `${origin}/api/public/oauth/gmail/callback`;
}

// ─── Connection status (safe columns only) ──────────────────────────────────

export const getGmailConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { data: row } = await supabase
      .from("gmail_connections")
      .select(
        "id, organization_id, google_email, scopes, last_polled_at, last_error, connected_by, connected_at, disconnected_at, status",
      )
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    return { connection: row ?? null };
  });

// ─── OAuth start ────────────────────────────────────────────────────────────

export const getGmailOAuthStartUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { signOAuthState, buildAuthorizeUrl } = await import("@/lib/gmail-oauth.server");
    const state = signOAuthState({ org: data.organization_id, uid: userId });
    const redirectUri = callbackUrlFromRequest();
    return { url: buildAuthorizeUrl(state, redirectUri) };
  });

// ─── Disconnect ─────────────────────────────────────────────────────────────

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conn } = await supabaseAdmin
      .from("gmail_connections")
      .select("refresh_token")
      .eq("organization_id", data.organization_id)
      .maybeSingle();

    if (conn?.refresh_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refresh_token)}`, {
          method: "POST",
        });
      } catch {
        /* best-effort */
      }
    }

    await supabaseAdmin
      .from("gmail_connections")
      .update({
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        status: "disconnected",
        disconnected_at: new Date().toISOString(),
      })
      .eq("organization_id", data.organization_id);

    await supabaseAdmin.from("gmail_ingestion_audit").insert({
      organization_id: data.organization_id,
      actor_kind: "user",
      actor_user_id: userId,
      action: "disconnect",
      detail: {},
    });
    return { ok: true };
  });

// ─── Rules CRUD ─────────────────────────────────────────────────────────────

export const listGmailRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { data: rows } = await supabase
      .from("gmail_ingestion_rules")
      .select("*")
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false });
    return { rules: rows ?? [] };
  });

const ruleInput = orgOnly.extend({
  id: z.string().uuid().optional(),
  rule_name: z.string().min(1).max(120),
  sender_domains: z.array(z.string().max(120)).max(50).default([]),
  sender_emails: z.array(z.string().email().max(200)).max(50).default([]),
  subject_contains: z.array(z.string().max(120)).max(20).default([]),
  enabled: z.boolean().default(true),
});

export const upsertGmailRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ruleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const payload = {
      organization_id: data.organization_id,
      rule_name: data.rule_name,
      sender_domains: data.sender_domains.map((d) => d.toLowerCase().trim()),
      sender_emails: data.sender_emails.map((e) => e.toLowerCase().trim()),
      subject_contains: data.subject_contains.map((s) => s.trim()),
      enabled: data.enabled,
      created_by: userId,
    };
    if (data.id) {
      const { error } = await supabase
        .from("gmail_ingestion_rules")
        .update(payload)
        .eq("id", data.id)
        .eq("organization_id", data.organization_id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase
      .from("gmail_ingestion_rules")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row!.id };
  });

export const deleteGmailRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { error } = await supabase
      .from("gmail_ingestion_rules")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Audit log ──────────────────────────────────────────────────────────────

export const listGmailAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.extend({ limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { data: rows } = await supabase
      .from("gmail_ingestion_audit")
      .select("id, action, actor_kind, gmail_message_id, referral_id, detail, created_at")
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return { audit: rows ?? [] };
  });

// ─── Discard (7d) / Archive (30d) for auto-ingested referrals ───────────────

export const discardReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgOnly.extend({ referral_id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");
    const purgeAfter = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("referrals")
      .update({
        discarded_at: new Date().toISOString(),
        discarded_by: userId,
        discard_reason: data.reason ?? null,
        status: "archived",
        purge_after: purgeAfter,
      })
      .eq("id", data.referral_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveAutoIngestedReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgOnly.extend({ referral_id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");
    const purgeAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("referrals")
      .update({
        archived_at: new Date().toISOString(),
        archived_by: userId,
        archive_reason: data.reason ?? "auto-ingested — archived after review",
        status: "archived",
        purge_after: purgeAfter,
      })
      .eq("id", data.referral_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
