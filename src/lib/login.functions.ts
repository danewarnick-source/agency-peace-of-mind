import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Pre-auth login helper. Accepts a username OR an email plus password,
// resolves to an email server-side, and performs the password sign-in
// on the server using the publishable-key auth API.
//
// Hardening vs. the previous lookupEmailByUsername:
//   - The caller never sees the resolved email — no enumeration via this fn.
//   - Returns the SAME generic error whether the username/email exists or
//     not, and whether the password is wrong — no "user not found" signal.
//   - On success returns only the session tokens, which the client passes
//     to supabase.auth.setSession() to mirror normal login persistence.
const SignInInput = z.object({
  identifier: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
});

const GENERIC_ERROR = "Invalid username or password";

export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SignInInput.parse(d))
  .handler(async ({ data }) => {
    let email = data.identifier;

    if (!email.includes("@")) {
      const { data: row } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .ilike("username", data.identifier)
        .maybeSingle();
      // Generic error — do not reveal whether username exists.
      if (!row?.email) throw new Error(GENERIC_ERROR);
      email = row.email;
    }

    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error || !signIn?.session) {
      throw new Error(GENERIC_ERROR);
    }

    // Check archived status server-side too, so the client can't bypass.
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("account_status")
      .eq("id", signIn.user!.id)
      .maybeSingle();
    if ((prof as { account_status?: string } | null)?.account_status === "archived") {
      // Revoke the session we just minted.
      await supabaseAdmin.auth.admin.signOut(signIn.session.access_token).catch(() => {});
      throw new Error("Account suspended. Contact your administrator.");
    }

    return {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    };
  });
