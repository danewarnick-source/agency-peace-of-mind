import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  performAwsForgotPassword,
  performAwsRefresh,
  performAwsSignOut,
  performAwsUpdatePassword,
  performPasswordSignIn,
} from "@/lib/login.server";

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

export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SignInInput.parse(d))
  .handler(async ({ data }) => performPasswordSignIn(data.identifier, data.password));

export const signOutAwsSession = createServerFn({ method: "POST" }).handler(async () => {
  await performAwsSignOut();
});

export const refreshAwsSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ refresh_token: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => performAwsRefresh(data.refresh_token));

export const requestAwsPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data }) => {
    await performAwsForgotPassword(data.email);
  });

export const updateAwsPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(8).max(200) }).parse(d))
  .handler(async ({ data }) => {
    await performAwsUpdatePassword(data.password);
  });
