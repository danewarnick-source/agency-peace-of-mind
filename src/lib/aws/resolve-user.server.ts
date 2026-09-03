import type { User } from "@supabase/supabase-js";
import { isCognitoAuth } from "./env";
import { resolveAppUserId, verifyCognitoJwt, cognitoGetUser } from "./cognito.server";
import { readAwsSessionCookie } from "./session-cookie.server";
import { appUserFromClaims } from "./session-store";

export type ResolvedAwsUser = {
  userId: string;
  email: string;
  claims: User;
};

async function lookupProfileIdByEmail(email: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

export async function resolveSupabaseBearer(
  request: Request | null | undefined,
): Promise<ResolvedAwsUser | null> {
  const header = request?.headers?.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { readSupabasePublicEnv } = await import("@/lib/supabase-public-env");
  const mapped = readSupabasePublicEnv();
  const url = mapped?.url;
  const key = mapped?.key;
  if (!url || !key) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return { userId: data.user.id, email: data.user.email || "", claims: data.user };
  } catch {
    return null;
  }
}

export async function resolveAnyRequestUser(
  request: Request | null | undefined,
): Promise<ResolvedAwsUser | null> {
  if (isCognitoAuth()) return resolveRequestUser(request);
  return resolveSupabaseBearer(request);
}

export async function resolveRequestUser(
  request: Request | null | undefined,
): Promise<ResolvedAwsUser | null> {
  if (!isCognitoAuth()) return resolveSupabaseBearer(request);
  const header = request?.headers?.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const cookie = readAwsSessionCookie();
  const token = bearer || cookie?.access_token || "";
  if (!token) return null;

  try {
    const verified = await verifyCognitoJwt(token);
    let email = verified.email || cookie?.email || "";
    let supabaseId = verified.supabaseId || cookie?.app_user_id || null;
    if (!supabaseId || !email) {
      try {
        const u = await cognitoGetUser(token);
        email = email || u.email;
        supabaseId = supabaseId || u.supabaseId;
      } catch {
        /* id token may not work with GetUser (needs access token) */
      }
    }
    const userId = await resolveAppUserId({
      supabaseId,
      email,
      accessToken: token,
      lookupEmail: lookupProfileIdByEmail,
    });
    const claims = appUserFromClaims(
      { ...verified.raw, "custom:supabase_id": userId, email },
      userId,
    );
    return { userId, email, claims };
  } catch {
    if (cookie?.app_user_id) {
      const claims = appUserFromClaims(
        { "custom:supabase_id": cookie.app_user_id, email: cookie.email || "" },
        cookie.app_user_id,
      );
      return { userId: cookie.app_user_id, email: cookie.email || "", claims };
    }
    return null;
  }
}
