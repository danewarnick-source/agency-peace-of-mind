/**
 * Server-only password session helpers. Used by login.functions.ts (existing
 * username RPC) and /api/aws/session. Do not import from the browser.
 *
 * Password Auth uses the publishable-key client (SUPABASE_URL +
 * SUPABASE_PUBLISHABLE_KEY), not supabaseAdmin / service role.
 */

import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import { isCognitoAuth } from "@/lib/aws/env";
import {
  GENERIC_PASSWORD_ERROR,
  performPasswordSignInWithClient,
  readPublishableAuthEnv,
  type PasswordSession,
  type PublishableAuthClient,
} from "@/lib/login-password-signin";

export type { PasswordSession };
export const GENERIC_ERROR = GENERIC_PASSWORD_ERROR;

function createPublishableAuthClient(): PublishableAuthClient {
  const env = readPublishableAuthEnv();
  if (!env) {
    throw new Error(GENERIC_PASSWORD_ERROR);
  }
  return createClient(env.url, env.key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  }) as unknown as PublishableAuthClient;
}

async function lookupUsernameEmailWithServiceRole(username: string): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("username", username)
      .maybeSingle();
    return (row as { email?: string } | null)?.email ?? null;
  } catch {
    return null;
  }
}

export async function performPasswordSignIn(
  identifier: string,
  password: string,
): Promise<PasswordSession> {
  const session = await performPasswordSignInWithClient(identifier, password, {
    createPublishableClient: createPublishableAuthClient,
    lookupUsernameEmailWithServiceRole,
  });

  if (isCognitoAuth()) {
    let appUserId = session.user.id;
    try {
      const { resolveAppUserId } = await import("@/lib/aws/cognito.server");
      appUserId = await resolveAppUserId({
        supabaseId: session.user.id || null,
        email: session.user.email,
        lookupEmail: async (em) => {
          if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: row } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .ilike("email", em)
              .maybeSingle();
            return (row as { id?: string } | null)?.id ?? null;
          } catch {
            return null;
          }
        },
      });
      const { writeAwsSessionCookie } = await import("@/lib/aws/session-cookie.server");
      writeAwsSessionCookie({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        app_user_id: appUserId,
        email: session.user.email,
        expires_at: Math.floor(Date.now() / 1000) + session.expires_in,
      });
    } catch {
      /* Cognito cookie is optional; publishable sign-in already succeeded */
    }
    return { ...session, user: { ...session.user, id: appUserId } };
  }

  return session;
}

export async function performAwsSignOut(): Promise<void> {
  if (!isCognitoAuth()) return;
  const { clearAwsSessionCookie, readAwsSessionCookie } =
    await import("@/lib/aws/session-cookie.server");
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
  let appUserId = tokens.supabaseId || "";
  try {
    appUserId = await resolveAppUserId({
      supabaseId: tokens.supabaseId,
      email: tokens.email,
      lookupEmail: async (em) => {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("email", em)
          .maybeSingle();
        return (row as { id?: string } | null)?.id ?? null;
      },
    });
  } catch {
    if (!appUserId) throw new Error(GENERIC_PASSWORD_ERROR);
  }
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
