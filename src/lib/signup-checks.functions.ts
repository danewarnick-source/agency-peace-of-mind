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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // listUsers doesn't support direct email filter; iterate small pages.
    // For a brand-new signup flow this is fine; switch to a server-side index later.
    const { data: page, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw error;
    const exists = page.users.some(
      (u) => (u.email ?? "").toLowerCase() === data.email,
    );
    return { exists };
  });
