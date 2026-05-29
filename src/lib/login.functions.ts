import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LookupInput = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
});

/**
 * Resolve a username to an email — but only if the supplied password is
 * also valid. This prevents unauthenticated enumeration of usernames to
 * email addresses, while still letting users log in with their username.
 *
 * Returns { email } on success and { email: null } on any failure
 * (unknown username OR wrong password) so a caller cannot tell the two
 * apart from the response.
 */
export const lookupEmailByUsername = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LookupInput.parse(d))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("username", data.username)
      .maybeSingle();

    const email = row?.email;
    if (!email) return { email: null };

    // Verify the password against Supabase auth via a one-shot anon client.
    // We do NOT persist this session — the caller's browser will sign in
    // again with the returned email to set its own session.
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Auth environment is not configured.");
    }
    const probe = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { error } = await probe.auth.signInWithPassword({ email, password: data.password });
    if (error) return { email: null };

    // Sign the probe session out so we don't leave dangling tokens.
    await probe.auth.signOut().catch(() => {});
    return { email };
  });
