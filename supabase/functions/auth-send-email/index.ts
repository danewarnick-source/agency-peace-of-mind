// Supabase Auth "Send Email" hook. Supabase Auth calls this instead of its
// own built-in mailer for every auth email (signup OTP, password recovery,
// magic link, email change, native admin invite) — routing delivery through
// the same Resend rail every other HIVE email uses, instead of Supabase's
// shared mailer (which per Supabase's current policy only reliably delivers
// to accounts inside our own Supabase org, not real end users).
//
// This function is called BY Supabase Auth, not by our app, so it is
// authenticated with a Standard Webhooks signature (verify_jwt = false in
// config.toml) rather than a user JWT. Wiring it up requires a one-time
// manual step in the Supabase dashboard — see the comment at the bottom of
// this file.

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Same bootstrap sender used by src/lib/email.functions.ts::HIVE_MANAGED_FROM_ADDRESS.
 *  Keep these two in sync — both move to notifications@<verified HIVE subdomain>
 *  together once that domain is verified in Resend. */
const HIVE_MANAGED_FROM_ADDRESS = "onboarding@resend.dev";
const FROM = `HIVE Notifications <${HIVE_MANAGED_FROM_ADDRESS}>`;

type EmailActionType = "signup" | "recovery" | "invite" | "magiclink" | "email_change" | "reauthentication";

type HookPayload = {
  user: { email: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: EmailActionType;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
};

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrap(inner: string): string {
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f1b3d">
      <div style="border-bottom:2px solid #e2e8f0;padding-bottom:12px;margin-bottom:20px">
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#64748b">HIVE</div>
      </div>
      ${inner}
    </div>
  `;
}

function buttonHtml(href: string, label: string): string {
  return `
    <p style="margin:28px 0">
      <a href="${href}"
         style="display:inline-block;background:#0f1b3d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">
        ${escapeHtml(label)}
      </a>
    </p>
    <p style="color:#666;font-size:12px">If the button doesn't work, copy and paste this link into your browser:<br/>
      <span style="word-break:break-all">${href}</span>
    </p>
  `;
}

function verifyLink(supabaseUrl: string, data: HookPayload["email_data"]): string {
  const params = new URLSearchParams({
    token: data.token_hash,
    type: data.email_action_type,
    redirect_to: data.redirect_to,
  });
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/verify?${params.toString()}`;
}

function buildEmail(supabaseUrl: string, data: HookPayload["email_data"]): { subject: string; html: string } {
  switch (data.email_action_type) {
    case "signup": {
      return {
        subject: "Verify your email for HIVE",
        html: wrap(`
          <p>Welcome to HIVE. Enter this code to verify your email and finish creating your account:</p>
          <p style="margin:28px 0;text-align:center">
            <span style="display:inline-block;font-size:32px;font-weight:800;letter-spacing:.2em;background:#f1f5f9;padding:16px 24px;border-radius:8px">
              ${escapeHtml(data.token)}
            </span>
          </p>
          <p style="color:#666;font-size:12px">This code expires shortly. If you didn't try to sign up, you can ignore this email.</p>
        `),
      };
    }
    case "recovery": {
      const link = verifyLink(supabaseUrl, data);
      return {
        subject: "Reset your HIVE password",
        html: wrap(`
          <p>We received a request to reset the password for this HIVE account.</p>
          ${buttonHtml(link, "Reset password")}
          <p style="color:#666;font-size:12px;margin-top:24px">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
        `),
      };
    }
    case "invite": {
      const link = verifyLink(supabaseUrl, data);
      return {
        subject: "You've been invited to HIVE",
        html: wrap(`
          <p>You've been invited to join HIVE.</p>
          ${buttonHtml(link, "Accept invitation")}
        `),
      };
    }
    case "email_change": {
      const link = verifyLink(supabaseUrl, data);
      return {
        subject: "Confirm your new email for HIVE",
        html: wrap(`
          <p>Confirm this address to finish updating the email on your HIVE account.</p>
          ${buttonHtml(link, "Confirm new email")}
          <p style="color:#666;font-size:12px;margin-top:24px">If you didn't request this change, you can safely ignore this email.</p>
        `),
      };
    }
    case "reauthentication": {
      return {
        subject: "Your HIVE confirmation code",
        html: wrap(`
          <p>Use this code to confirm the action you're taking on your HIVE account:</p>
          <p style="margin:28px 0;text-align:center">
            <span style="display:inline-block;font-size:32px;font-weight:800;letter-spacing:.2em;background:#f1f5f9;padding:16px 24px;border-radius:8px">
              ${escapeHtml(data.token)}
            </span>
          </p>
        `),
      };
    }
    default: {
      const link = verifyLink(supabaseUrl, data);
      return {
        subject: "Confirm your HIVE account action",
        html: wrap(`${buttonHtml(link, "Continue")}`),
      };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

  if (!hookSecret || !RESEND_API_KEY || !SUPABASE_URL) {
    console.error("[auth-send-email] not configured: missing SEND_EMAIL_HOOK_SECRET, RESEND_API_KEY, or SUPABASE_URL");
    return json({ error: "not configured" }, 500);
  }

  const rawBody = await req.text();

  let payload: HookPayload;
  try {
    const wh = new Webhook(hookSecret);
    payload = wh.verify(rawBody, Object.fromEntries(req.headers)) as HookPayload;
  } catch (err) {
    console.error("[auth-send-email] signature verification failed", err);
    return json({ error: "invalid signature" }, 401);
  }

  try {
    const { subject, html } = buildEmail(SUPABASE_URL, payload.email_data);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [payload.user.email],
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("[auth-send-email] Resend failure", resp.status, errText);
      return json({ error: "email send failed" }, 500);
    }

    return json({}, 200);
  } catch (e) {
    console.error("[auth-send-email] unhandled", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────────
// MANUAL DASHBOARD STEP (cannot be done from code):
//
// 1. Deploy this function (Lovable Cloud / Supabase CLI deploy picks it up
//    automatically from supabase/functions/auth-send-email).
// 2. Set two Edge Function secrets (Supabase Dashboard → Edge Functions →
//    Secrets, or `supabase secrets set`):
//      - RESEND_API_KEY          (already set for send-email — reuse the same key)
//      - SEND_EMAIL_HOOK_SECRET  (generated in step 3 below)
// 3. In the Supabase Dashboard: Authentication → Hooks → "Send Email Hook"
//    → Enable → choose this function (auth-send-email) as the target →
//    Supabase generates a signing secret starting with `v1,whsec_...` —
//    copy it into SEND_EMAIL_HOOK_SECRET from step 2.
// 4. Save. From that point on, Supabase Auth calls this function for every
//    auth email (signup codes, password reset, invite, email change)
//    instead of its own mailer.
// ────────────────────────────────────────────────────────────────────────
