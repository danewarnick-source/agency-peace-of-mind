import { createServerFn } from "@tanstack/react-start";
import { isValidSignupEmail, normalizeSignupEmail } from "@/lib/signup-email";

/**
 * Public server fn — returns whether an auth user already exists for the given email.
 * Uses the admin client to look up by email. Safe to call unauthenticated because
 * it only returns a boolean (no PII), and is rate-limited by the platform.
 *
 * Exact mailbox only (trim + lowercase). Plus-aliases stay distinct:
 * danewarnick@gmail.com and danewarnick+pi1@gmail.com are different users.
 * Do not strip +tags. Do not Gmail-dot-normalize.
 */
export const checkEmailExists = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => {
    const email = normalizeSignupEmail(String(input?.email ?? ""));
    if (!email || !isValidSignupEmail(email)) {
      throw new Error("Invalid email");
    }
    return { email };
  })
  .handler(async ({ data }) => {
    // We avoid auth.admin.listUsers — it can 500 with "Scan error on column
    // confirmation_token: converting NULL to string is unsupported" (GoTrue
    // bug when any user row has a NULL confirmation_token). Query profiles
    // by email instead; every signup creates a profile row.
    const { readSupabaseAdminEnv } = await import("@/lib/supabase-public-env");
    if (!readSupabaseAdminEnv()) {
      // Create account still proceeds via client signUp (VITE_ URL + anon).
      return { exists: false };
    }
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

/**
 * Public server fn — Have I Been Pwned range lookup (same check Auth uses
 * for "Password is known to be weak and easy to guess…").
 *
 * Client sends only the SHA-1 prefix (k-anonymity). The password never
 * leaves the browser for this pre-check. Fail-open on HIBP errors so a
 * network blip does not invent a new signup rule.
 */
export const checkPasswordPwnedRange = createServerFn({ method: "POST" })
  .inputValidator((input: { sha1Prefix: string }) => {
    const sha1Prefix = String(input?.sha1Prefix ?? "").trim().toUpperCase();
    if (!/^[A-F0-9]{5}$/.test(sha1Prefix)) {
      throw new Error("Invalid prefix");
    }
    return { sha1Prefix };
  })
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${data.sha1Prefix}`, {
        headers: {
          "Add-Padding": "true",
          "User-Agent": "ProviderInterface-signup",
        },
      });
      if (!res.ok) return { range: "" };
      return { range: await res.text() };
    } catch {
      return { range: "" };
    }
  });

