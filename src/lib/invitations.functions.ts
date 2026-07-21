// Shared employee-invitation rail. Both invite surfaces (the "Invite by
// email" dialog on dashboard.employees.index.tsx and the dedicated
// dashboard.invitations.tsx management page) call these server fns instead
// of inserting into `invitations` directly, so invite creation, resend, and
// the actual email send live in exactly one place.
//
// Email goes out through the same Resend rail as everything else
// (resolveOrgSender + the `send-email` edge function) — see
// src/lib/email.functions.ts. We call that rail's building blocks directly
// rather than invoking the `sendEmail` server fn from inside another server
// fn's handler, since createServerFn calls aren't meant to be nested.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/require-permission";
import { resolveOrgSender } from "@/lib/email.functions";
import { ROLE_LABEL, type Role } from "@/lib/rbac";

const ORG_ID = z.string().uuid();
const INVITE_ROLE = z.enum(["admin", "manager", "employee"]);
const SITE_ORIGIN = z.string().trim().min(1).max(500);

type InvitationRow = {
  id: string;
  token: string;
  email: string;
  role: Role;
  expires_at: string;
};

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendInvitationEmail(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  organizationId: string;
  email: string;
  role: Role;
  token: string;
  siteOrigin: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, organizationId, email, role, token, siteOrigin } = args;
  try {
    const sender = await resolveOrgSender(supabase, organizationId);
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle();
    const orgName = String(org?.name || "").trim() || "your organization";
    const origin = siteOrigin.replace(/\/+$/, "");
    const link = `${origin}/signup?invite=${token}`;
    const roleLabel = ROLE_LABEL[role] ?? role;

    const subject = `You're invited to join ${orgName} on HIVE`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f1b3d">
        <p>Hello,</p>
        <p><strong>${escapeHtml(orgName)}</strong> has invited you to join their team on HIVE as a
          <strong>${escapeHtml(roleLabel)}</strong>.</p>
        <p style="margin:28px 0">
          <a href="${link}"
             style="display:inline-block;background:#0f1b3d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">
            Accept invitation
          </a>
        </p>
        <p style="color:#666;font-size:12px">If the button doesn't work, copy and paste this link into your browser:<br/>
          <span style="word-break:break-all">${link}</span>
        </p>
        <p style="color:#666;font-size:12px;margin-top:24px">This invitation link expires in 14 days.</p>
      </div>
    `;

    const { data: invokeData, error: invokeErr } = await supabase.functions.invoke("send-email", {
      body: {
        from: sender.from,
        to: email,
        subject,
        html,
        reply_to: sender.reply_to,
      },
    });
    if (invokeErr) return { ok: false, error: invokeErr.message || "Email send failed" };
    if (!invokeData || invokeData.ok !== true) {
      return { ok: false, error: (invokeData && invokeData.error) || "Email send failed" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email send failed" };
  }
}

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    email: string;
    role: "admin" | "manager" | "employee";
    site_origin: string;
  }) =>
    z
      .object({
        organization_id: ORG_ID,
        email: z.string().trim().toLowerCase().email().max(255),
        role: INVITE_ROLE,
        site_origin: SITE_ORIGIN,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(
      supabase as unknown as SupabaseClient,
      userId,
      data.organization_id,
      "invite_users",
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: existErr } = await (supabase as any)
      .from("invitations")
      .select("id")
      .eq("organization_id", data.organization_id)
      .eq("email", data.email)
      .eq("status", "pending")
      .maybeSingle();
    if (existErr) throw new Error(existErr.message);
    if (existing) throw new Error("A pending invitation already exists for this email");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invite, error } = await (supabase as any)
      .from("invitations")
      .insert({
        organization_id: data.organization_id,
        email: data.email,
        role: data.role,
        invited_by: userId,
      })
      .select("id, token, email, role, expires_at")
      .single();
    if (error) throw new Error(error.message);

    const emailResult = await sendInvitationEmail({
      supabase,
      organizationId: data.organization_id,
      email: data.email,
      role: data.role,
      token: (invite as InvitationRow).token,
      siteOrigin: data.site_origin,
    });

    return {
      invitation: invite as InvitationRow,
      email_sent: emailResult.ok,
      email_error: emailResult.ok ? null : (emailResult.error ?? "Email send failed"),
    };
  });

export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; invitation_id: string; site_origin: string }) =>
    z
      .object({
        organization_id: ORG_ID,
        invitation_id: z.string().uuid(),
        site_origin: SITE_ORIGIN,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(
      supabase as unknown as SupabaseClient,
      userId,
      data.organization_id,
      "invite_users",
    );

    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invite, error } = await (supabase as any)
      .from("invitations")
      .update({ expires_at: expires, status: "pending" })
      .eq("id", data.invitation_id)
      .eq("organization_id", data.organization_id)
      .select("id, token, email, role, expires_at")
      .single();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Invitation not found");

    const row = invite as InvitationRow;
    const emailResult = await sendInvitationEmail({
      supabase,
      organizationId: data.organization_id,
      email: row.email,
      role: row.role,
      token: row.token,
      siteOrigin: data.site_origin,
    });

    return {
      invitation: row,
      email_sent: emailResult.ok,
      email_error: emailResult.ok ? null : (emailResult.error ?? "Email send failed"),
    };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; invitation_id: string }) =>
    z
      .object({
        organization_id: ORG_ID,
        invitation_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(
      supabase as unknown as SupabaseClient,
      userId,
      data.organization_id,
      "invite_users",
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invite, error } = await (supabase as any)
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", data.invitation_id)
      .eq("organization_id", data.organization_id)
      .eq("status", "pending")
      .select("id, email")
      .single();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Invitation not found or already resolved");

    return { invitation: invite as { id: string; email: string } };
  });
