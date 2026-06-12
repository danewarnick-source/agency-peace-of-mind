// A6-pre: shared email rail.
//
// `sendEmail` is the SINGLE server fn every future email feature (A6 referral
// follow-ups, notifications, messaging) goes through. It:
//   1. Verifies caller has `send_emails` permission in the org.
//   2. Loads `org_email_settings`; refuses to send unless `verified = true`
//      and a `from_address` is configured. No fake success.
//   3. Composes the From header from per-org name/address and invokes the
//      `send-email` edge function via Resend.
//
// Settings read/write fns are also exposed for the admin UI.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/require-permission";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

const ORG_ID = z.string().uuid();

// ────────── Settings ──────────

export const getOrgEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) =>
    z.object({ organization_id: ORG_ID }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabase as any)
      .from("org_email_settings")
      .select("organization_id, from_name, from_address, reply_to, verified, updated_at")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const updateOrgEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    from_name: string;
    from_address: string;
    reply_to?: string | null;
    verified?: boolean;
  }) =>
    z.object({
      organization_id: ORG_ID,
      from_name: z.string().trim().min(1).max(200),
      from_address: z.string().trim().email().max(320),
      reply_to: z.string().trim().email().max(320).nullable().optional(),
      verified: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Settings live with admin/manager (RLS enforces this too). Use a real
    // permission so staff are blocked even if RLS ever loosens.
    await requirePermission(supabase, userId, data.organization_id, "manage_organization");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabase as any)
      .from("org_email_settings")
      .upsert(
        {
          organization_id: data.organization_id,
          from_name: data.from_name,
          from_address: data.from_address,
          reply_to: data.reply_to ?? null,
          verified: data.verified ?? false,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ────────── Send ──────────

export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    cc?: string[];
    bcc?: string[];
    reply_to?: string;
    /** Forces a failure path for honest-error verification. Server-side only. */
    forceFail?: boolean;
  }) =>
    z.object({
      organization_id: ORG_ID,
      to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
      subject: z.string().trim().min(1).max(998),
      html: z.string().max(200_000).optional(),
      text: z.string().max(200_000).optional(),
      cc: z.array(z.string().email()).optional(),
      bcc: z.array(z.string().email()).optional(),
      reply_to: z.string().email().optional(),
      forceFail: z.boolean().optional(),
    }).refine((v) => !!(v.html || v.text), { message: "html or text required" })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "send_emails");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settings, error: sErr } = await (supabase as any)
      .from("org_email_settings")
      .select("from_name, from_address, reply_to, verified")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!settings || !settings.from_address) {
      throw new Error("No sender configured. Set the org sender in Settings → Email.");
    }
    if (!settings.verified) {
      throw new Error("Sender is not marked verified. Verify the domain in Resend, then mark verified in Settings → Email.");
    }

    if (data.forceFail) {
      return { ok: false as const, error: "Forced failure (verification path)" };
    }

    const fromName = String(settings.from_name || "").trim();
    const fromAddress = String(settings.from_address).trim();
    const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invokeData, error: invokeErr } = await (supabase as any).functions.invoke("send-email", {
      body: {
        from,
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text,
        cc: data.cc,
        bcc: data.bcc,
        reply_to: data.reply_to ?? settings.reply_to ?? undefined,
      },
    });

    if (invokeErr) {
      return { ok: false as const, error: invokeErr.message || "Email send failed" };
    }
    if (!invokeData || invokeData.ok !== true) {
      return { ok: false as const, error: (invokeData && invokeData.error) || "Email send failed" };
    }
    return { ok: true as const, id: invokeData.id ?? null };
  });
