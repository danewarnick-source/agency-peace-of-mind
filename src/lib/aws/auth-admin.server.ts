/**
 * supabaseAdmin.auth facade for AUTH_PROVIDER=cognito.
 * createUser / deleteUser keep using the original Supabase UUID as profiles.id
 * (custom:supabase_id). Does not force a password reset.
 */

import { randomUUID } from "node:crypto";
import {
  cognitoAdminCreateUser,
  cognitoAdminDeleteUser,
  cognitoAdminSetPassword,
  cognitoGlobalSignOut,
  cognitoInitiatePasswordAuth,
} from "./cognito.server";
import { isCognitoAuth } from "./env";

type AdminClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c: string, v: unknown) => {
        maybeSingle: () => Promise<{ data: { id?: string; email?: string } | null }>;
      };
    };
  };
};

export function createAwsAuthAdmin(liveAdmin: AdminClient | null) {
  return {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const tokens = await cognitoInitiatePasswordAuth(email, password);
      const appId = tokens.supabaseId;
      return {
        data: {
          user: { id: appId || "", email: tokens.email || email },
          session: {
            access_token: tokens.idToken,
            refresh_token: tokens.refreshToken,
            expires_in: tokens.expiresIn,
          },
        },
        error: null,
      };
    },
    admin: {
      async createUser(opts: {
        email: string;
        password?: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      }) {
        const id = randomUUID();
        const password = opts.password || randomUUID().slice(0, 12) + "Aa1!";
        const fullName =
          typeof opts.user_metadata?.full_name === "string" ? opts.user_metadata.full_name : undefined;
        await cognitoAdminCreateUser({
          email: opts.email,
          password,
          supabaseId: id,
          fullName,
        });
        return { data: { user: { id, email: opts.email } }, error: null };
      },
      async deleteUser(id: string) {
        const email = await emailForId(liveAdmin, id);
        if (email) await cognitoAdminDeleteUser(email).catch(() => {});
        return { data: {}, error: null };
      },
      async updateUserById(id: string, patch: { password?: string; email?: string }) {
        const email = patch.email || (await emailForId(liveAdmin, id));
        if (patch.password && email) await cognitoAdminSetPassword(email, patch.password);
        return { data: { user: { id, email } }, error: null };
      },
      async getUserById(id: string) {
        const email = await emailForId(liveAdmin, id);
        return { data: { user: email ? { id, email } : null }, error: null };
      },
      async signOut(tokenOrId: string) {
        if (tokenOrId.includes(".")) await cognitoGlobalSignOut(tokenOrId).catch(() => {});
        return { data: {}, error: null };
      },
      async inviteUserByEmail(email: string, _opts?: unknown) {
        const id = randomUUID();
        const password = randomUUID().slice(0, 12) + "Aa1!";
        await cognitoAdminCreateUser({ email, password, supabaseId: id });
        return { data: { user: { id, email } }, error: null };
      },
    },
  };
}

async function emailForId(liveAdmin: AdminClient | null, id: string): Promise<string | null> {
  if (!liveAdmin) return null;
  try {
    const { data } = await liveAdmin.from("profiles").select("email").eq("id", id).maybeSingle();
    return data?.email ?? null;
  } catch {
    return null;
  }
}

export function wrapAdminAuth(
  liveAuth: unknown,
  liveAdminForLookup: AdminClient | null,
): unknown {
  if (!isCognitoAuth()) return liveAuth;
  return createAwsAuthAdmin(liveAdminForLookup);
}
