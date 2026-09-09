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
import { resolveAuthOrigin } from "@/lib/auth-redirect";
import { inviteJoinUrl } from "@/lib/join-invite";
import { stripFakeDisplayLabel } from "@/lib/managed-from";
import { canSendImportInvite } from "@/lib/import-invite";

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

type InviteTargetResult = {
  email: string;
  user_id: string | null;
  status: "sent" | "created_unsent" | "skipped" | "error";
  reason: string | null;
};

/** Unified payload so hire-wizard (`res.sent`) and resend (`res.email_sent`) share one shape. */
function inviteSendPayload(args: {
  invitation?: InvitationRow | { id: string; email: string } | null;
  email?: string | null;
  userId?: string | null;
  email_sent: boolean;
  email_error?: string | null;
  sent?: number;
  skipped?: number;
  errors?: number;
  results?: InviteTargetResult[];
  status?: InviteTargetResult["status"];
}) {
  const email =
    (args.email && args.email.trim()) ||
    (args.invitation && "email" in args.invitation ? String(args.invitation.email ?? "") : "");
  const status =
    args.status ?? (args.email_sent ? "sent" : args.email_error ? "created_unsent" : "error");
  const results =
    args.results ??
    (email || args.email_error
      ? [
          {
            email,
            user_id: args.userId ?? null,
            status,
            reason: args.email_sent ? null : (args.email_error ?? null),
          },
        ]
      : []);
  return {
    invitation: args.invitation ?? null,
    email_sent: args.email_sent,
    email_error: args.email_error ?? null,
    sent: args.sent ?? (args.email_sent ? 1 : 0),
    skipped: args.skipped ?? 0,
    errors: args.errors ?? (args.email_sent ? 0 : results.length ? 1 : 0),
    results,
  };
}

function inviteRoleFromMember(role: string | undefined): Role {
  if (role === "admin") return "admin";
  if (role === "manager" || role === "program_manager") return "manager";
  return "employee";
}

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
    const orgName =
      stripFakeDisplayLabel(String(org?.name || "").trim()) || "your organization";
    const origin = resolveAuthOrigin(siteOrigin);
    const link = inviteJoinUrl(origin, token);
    const roleLabel = ROLE_LABEL[role] ?? role;

    const subject = `You're invited to join ${orgName} on Provider Interface`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#243040">
        <p>Hello,</p>
        <p><strong>${escapeHtml(orgName)}</strong> has invited you to join their team on Provider Interface as a
          <strong>${escapeHtml(roleLabel)}</strong>.</p>
        <p style="margin:28px 0">
          <a href="${link}"
             style="display:inline-block;background:#c9a227;color:#243040;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">
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
    if (!supabase || !userId)
      return { invitation: null, email_sent: false, email_error: null };
    await requirePermission(
      supabase as unknown as SupabaseClient,
      userId,
      data.organization_id,
      "invite_staff",
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
    if (!supabase || !userId)
      return { invitation: null, email_sent: false, email_error: null };
    await requirePermission(
      supabase as unknown as SupabaseClient,
      userId,
      data.organization_id,
      "invite_staff",
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
    if (!supabase || !userId) return { invitation: null };
    await requirePermission(
      supabase as unknown as SupabaseClient,
      userId,
      data.organization_id,
      "invite_staff",
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

async function upsertPendingInviteAndSend(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  organizationId: string;
  userId: string;
  email: string;
  role: Role;
  siteOrigin: string;
}): Promise<{ invitation: InvitationRow; email_sent: boolean; email_error: string | null }> {
  const { supabase, organizationId, userId, email, role, siteOrigin } = args;
  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: pending, error: pendingErr } = await supabase
    .from("invitations")
    .select("id, token, email, role, expires_at")
    .eq("organization_id", organizationId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingErr) throw new Error(pendingErr.message);

  let invite = pending as InvitationRow | null;
  if (invite) {
    const { data: refreshed, error: refreshErr } = await supabase
      .from("invitations")
      .update({ expires_at: expires, role })
      .eq("id", invite.id)
      .eq("organization_id", organizationId)
      .select("id, token, email, role, expires_at")
      .single();
    if (refreshErr) throw new Error(refreshErr.message);
    invite = refreshed as InvitationRow;
  } else {
    const { data: created, error: createErr } = await supabase
      .from("invitations")
      .insert({
        organization_id: organizationId,
        email,
        role,
        invited_by: userId,
      })
      .select("id, token, email, role, expires_at")
      .single();
    if (createErr) throw new Error(createErr.message);
    invite = created as InvitationRow;
  }

  const emailResult = await sendInvitationEmail({
    supabase,
    organizationId,
    email,
    role,
    token: invite.token,
    siteOrigin,
  });
  return {
    invitation: invite,
    email_sent: emailResult.ok,
    email_error: emailResult.ok ? null : (emailResult.error ?? "Email send failed"),
  };
}

/**
 * Invite already-created roster members (Add employee access step + Smart Import
 * bulk/per-row). Never emails during CSV parse. Never re-invites an accepted
 * join unless resend_accepted is explicit.
 */
export const inviteStaffMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organization_id: ORG_ID,
        site_origin: SITE_ORIGIN,
        user_ids: z.array(z.string().uuid()).max(200).default([]),
        emails: z.array(z.string().trim().toLowerCase().email().max(255)).max(200).default([]),
        role: INVITE_ROLE.optional(),
        resend_accepted: z.boolean().optional().default(false),
        force: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const empty = inviteSendPayload({
      email_sent: false,
      sent: 0,
      skipped: 0,
      errors: 0,
      results: [],
    });
    if (!supabase || !userId) return { ...empty, email_error: "Unauthorized" };
    try {
    await requirePermission(
      supabase as unknown as SupabaseClient,
      userId,
      data.organization_id,
      "invite_staff",
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const targets = new Map<string, { userId: string | null; email: string; role: Role; mustChange: boolean | null }>();

    if (data.user_ids.length) {
      const { data: members, error: memErr } = await sb
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", data.organization_id)
        .in("user_id", data.user_ids);
      if (memErr) throw new Error(memErr.message);
      const ids = (members ?? []).map((m: { user_id: string }) => m.user_id);
      const roleByUser = new Map(
        (members ?? []).map((m: { user_id: string; role: string }) => [m.user_id, m.role as Role]),
      );
      if (ids.length) {
        const { data: profs, error: pErr } = await sb
          .from("profiles")
          .select("id, email, must_change_password")
          .in("id", ids);
        if (pErr) throw new Error(pErr.message);
        for (const p of profs ?? []) {
          const email = String(p.email ?? "").trim().toLowerCase();
          if (!email) continue;
          targets.set(email, {
            userId: p.id,
            email,
            role: (data.role ?? inviteRoleFromMember(roleByUser.get(p.id))) as Role,
            mustChange: p.must_change_password ?? null,
          });
        }
      }
    }

    for (const raw of data.emails) {
      const email = raw.trim().toLowerCase();
      if (targets.has(email)) continue;
      targets.set(email, {
        userId: null,
        email,
        role: data.role ?? "employee",
        mustChange: true,
      });
    }

    const emails = [...targets.keys()];
    const inviteByEmail = new Map<string, string>();
    if (emails.length) {
      const { data: invites, error: invErr } = await sb
        .from("invitations")
        .select("email, status")
        .eq("organization_id", data.organization_id)
        .in("email", emails);
      if (invErr) throw new Error(invErr.message);
      for (const row of invites ?? []) {
        const key = String(row.email ?? "").toLowerCase();
        const prev = inviteByEmail.get(key);
        if (row.status === "accepted" || prev !== "accepted") {
          inviteByEmail.set(key, String(row.status ?? ""));
        }
      }
    }

    const results: InviteTargetResult[] = [];
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const t of targets.values()) {
      const invitationStatus = inviteByEmail.get(t.email) ?? null;
      if (
        !canSendImportInvite(
          {
            email: t.email,
            mustChangePassword: t.mustChange,
            invitationStatus,
          },
          { resendAccepted: data.resend_accepted, force: data.force },
        )
      ) {
        skipped += 1;
        results.push({
          email: t.email,
          user_id: t.userId,
          status: "skipped",
          reason:
            invitationStatus === "accepted"
              ? "Already accepted — use Resend to send again"
              : t.mustChange === false
                ? "Already has a login"
                : "Not inviteable",
        });
        continue;
      }

      try {
        const out = await upsertPendingInviteAndSend({
          supabase: sb,
          organizationId: data.organization_id,
          userId,
          email: t.email,
          role: t.role,
          siteOrigin: data.site_origin,
        });
        if (out.email_sent) {
          sent += 1;
          results.push({ email: t.email, user_id: t.userId, status: "sent", reason: null });
        } else {
          errors += 1;
          results.push({
            email: t.email,
            user_id: t.userId,
            status: "created_unsent",
            reason: out.email_error,
          });
        }
      } catch (e) {
        errors += 1;
        results.push({
          email: t.email,
          user_id: t.userId,
          status: "error",
          reason: e instanceof Error ? e.message : "Invite failed",
        });
      }
    }

    const emailError = results.find((r) => r.status === "created_unsent" || r.status === "error")?.reason ?? null;
    return inviteSendPayload({
      email_sent: sent > 0,
      email_error: emailError,
      sent,
      skipped,
      errors,
      results,
    });
    } catch (e) {
      return inviteSendPayload({
        email_sent: false,
        email_error: e instanceof Error ? e.message : "Invite failed",
        sent: 0,
        skipped: 0,
        errors: 1,
        status: "error",
      });
    }
  });
