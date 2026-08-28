/**
 * Server-only password session helpers. Used by login.functions.ts (existing
 * username RPC) and /api/aws/session. Do not import from the browser.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isCognitoAuth } from "@/lib/aws/env";
import { getRequest } from "@tanstack/react-start/server";

const GENERIC_ERROR = "Invalid username or password";

export type PasswordSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email: string };
};

export async function performPasswordSignIn(
  identifier: string,
  password: string,
): Promise<PasswordSession> {
  let email = identifier;

  if (!email.includes("@")) {
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("username", identifier)
      .maybeSingle();
    if (!row?.email) throw new Error(GENERIC_ERROR);
    email = row.email;
  }

  const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !signIn?.session) {
    throw new Error(GENERIC_ERROR);
  }

  let appUserId = signIn.user?.id ?? "";
  if (isCognitoAuth()) {
    const { resolveAppUserId } = await import("@/lib/aws/cognito.server");
    appUserId = await resolveAppUserId({
      supabaseId: appUserId || null,
      email,
      lookupEmail: async (em) => {
        const { data: row } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("email", em)
          .maybeSingle();
        return (row as { id?: string } | null)?.id ?? null;
      },
    });
    const { writeAwsSessionCookie } = await import("@/lib/aws/session-cookie.server");
    writeAwsSessionCookie({
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
      app_user_id: appUserId,
      email,
      expires_at: Math.floor(Date.now() / 1000) + (signIn.session.expires_in ?? 3600),
    });
  }

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("account_status")
    .eq("id", appUserId || signIn.user!.id)
    .maybeSingle();
  if ((prof as { account_status?: string } | null)?.account_status === "archived") {
    await supabaseAdmin.auth.admin.signOut(signIn.session.access_token).catch(() => {});
    throw new Error("Account suspended. Contact your administrator.");
  }

  return {
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
    expires_in: signIn.session.expires_in ?? 3600,
    user: { id: appUserId || signIn.user!.id, email },
  };
}

export async function performAwsSignOut(): Promise<void> {
  if (!isCognitoAuth()) return;
  const { clearAwsSessionCookie, readAwsSessionCookie } = await import("@/lib/aws/session-cookie.server");
  const { cognitoGlobalSignOut } = await import("@/lib/aws/cognito.server");
  const cookie = readAwsSessionCookie();
  const header = getRequest()?.headers?.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : cookie?.access_token;
  if (token) await cognitoGlobalSignOut(token).catch(() => {});
  clearAwsSessionCookie();
}

export async function performAwsRefresh(refreshToken: string): Promise<PasswordSession> {
  if (!isCognitoAuth()) throw new Error("Not a Cognito session");
  const { cognitoRefresh, resolveAppUserId } = await import("@/lib/aws/cognito.server");
  const tokens = await cognitoRefresh(refreshToken);
  const appUserId = await resolveAppUserId({
    supabaseId: tokens.supabaseId,
    email: tokens.email,
    lookupEmail: async (em) => {
      const { data: row } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", em)
        .maybeSingle();
      return (row as { id?: string } | null)?.id ?? null;
    },
  });
  const { writeAwsSessionCookie } = await import("@/lib/aws/session-cookie.server");
  writeAwsSessionCookie({
    access_token: tokens.idToken,
    refresh_token: tokens.refreshToken,
    app_user_id: appUserId,
    email: tokens.email,
    expires_at: Math.floor(Date.now() / 1000) + tokens.expiresIn,
  });
  return {
    access_token: tokens.idToken,
    refresh_token: tokens.refreshToken,
    expires_in: tokens.expiresIn,
    user: { id: appUserId, email: tokens.email },
  };
}

export async function performAwsForgotPassword(email: string): Promise<void> {
  if (!isCognitoAuth()) return;
  const { cognitoForgotPassword } = await import("@/lib/aws/cognito.server");
  try {
    await cognitoForgotPassword(email);
  } catch {
    /* do not reveal whether the email exists */
  }
}

export async function performAwsUpdatePassword(password: string): Promise<void> {
  if (!isCognitoAuth()) return;
  const { resolveRequestUser } = await import("@/lib/aws/resolve-user.server");
  const { cognitoAdminSetPassword } = await import("@/lib/aws/cognito.server");
  const user = await resolveRequestUser(getRequest());
  if (!user) throw new Error("Not signed in");
  if (!user.email) throw new Error("No email on session");
  await cognitoAdminSetPassword(user.email, password);
}
