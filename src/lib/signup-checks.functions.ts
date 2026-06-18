import { createServerFn } from "@tanstack/react-start";

/**
 * Public server fn — returns whether an auth user already exists for the given email.
 * Uses the admin client to look up by email. Safe to call unauthenticated because
 * it only returns a boolean (no PII), and is rate-limited by the platform.
 */
export const checkEmailExists = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email");
    }
    return { email };
  })
  .handler(async ({ data }) => {
    // We avoid auth.admin.listUsers — it can 500 with "Scan error on column
    // confirmation_token: converting NULL to string is unsupported" (GoTrue
    // bug when any user row has a NULL confirmation_token). Query profiles
    // by email instead; every signup creates a profile row.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { exists: !!row };
  });

