// Server functions for managing an organization's billing SMS phone number.
//
// The phone number is required (signup step 3) and may be updated by org
// admins from /dashboard/settings/subscription. It cannot be removed — a
// number must always be on file because it is the urgent-billing channel.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeUSPhoneToE164 } from "./us-phone";

interface UpdateInput {
  organizationId: string;
  phone: string;
}

async function ensureOrgAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  organizationId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, active")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data as { role?: string } | null)?.role ?? null;
  if (role !== "admin" && role !== "super_admin") {
    throw new Error("Only org admins may update the billing contact number.");
  }
}

export const getBillingSmsPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => {
    if (!input.organizationId) throw new Error("organizationId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("organizations")
      .select("billing_sms_phone")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { phone: (row as { billing_sms_phone: string | null } | null)?.billing_sms_phone ?? null };
  });

export const updateBillingSmsPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateInput) => {
    if (!input.organizationId) throw new Error("organizationId required");
    if (!input.phone || !input.phone.trim()) {
      throw new Error("A mobile number is required and cannot be removed.");
    }
    const e164 = normalizeUSPhoneToE164(input.phone);
    if (!e164) throw new Error("Enter a valid US mobile number (10 digits).");
    return { organizationId: input.organizationId, phone: e164 };
  })
  .handler(async ({ data, context }) => {
    await ensureOrgAdmin(context.supabase, context.userId, data.organizationId);
    const { error } = await context.supabase
      .from("organizations")
      .update({ billing_sms_phone: data.phone })
      .eq("id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true, phone: data.phone };
  });

// Used during signup, where the user is the org creator (no role row yet
// may exist). Caller passes organizationId looked up via `created_by`.
export const setBillingSmsPhoneAtSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateInput) => {
    if (!input.organizationId) throw new Error("organizationId required");
    const e164 = normalizeUSPhoneToE164(input.phone || "");
    if (!e164) throw new Error("Enter a valid US mobile number (10 digits).");
    return { organizationId: input.organizationId, phone: e164 };
  })
  .handler(async ({ data, context }) => {
    // Verify the caller created this org.
    const { data: org, error: orgErr } = await context.supabase
      .from("organizations")
      .select("id, created_by")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (orgErr) throw new Error(orgErr.message);
    if (!org || (org as { created_by: string }).created_by !== context.userId) {
      throw new Error("Not authorized for this organization.");
    }
    const { error } = await context.supabase
      .from("organizations")
      .update({ billing_sms_phone: data.phone })
      .eq("id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true, phone: data.phone };
  });
