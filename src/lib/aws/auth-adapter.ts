/**
 * supabase.auth-compatible adapter. When AUTH_PROVIDER=cognito this is what
 * `supabase.auth` returns. Callers (login, useAuth, attachSupabaseAuth) stay
 * unchanged. Tests inject `cognitoSignIn` so we can prove supabase.auth is
 * never called on the Cognito path.
 */

import type { Session, User } from "@supabase/supabase-js";
import { isCognitoAuth } from "./env.ts";
import {
  appUserFromClaims,
  decodeJwtPayload,
  readBrowserSession,
  sessionFromTokens,
  subscribeAuth,
  writeBrowserSession,
} from "./session-store.ts";

export type PasswordSignInResult = {
  data: { session: Session | null; user: User | null };
  error: { message: string } | null;
};

export type CognitoAuthDeps = {
  /** Cognito (or test) password sign-in. Must NOT call supabase.auth. */
  cognitoSignIn: (
    email: string,
    password: string,
  ) => Promise<{
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    user: { id: string; email?: string };
  }>;
  cognitoSignOut?: () => Promise<void>;
  cognitoRefresh?: (
    refreshToken: string,
  ) => Promise<{
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    user: { id: string; email?: string };
  }>;
  cognitoResetPassword?: (email: string) => Promise<void>;
  cognitoUpdatePassword?: (password: string) => Promise<void>;
  /** Only used when AUTH_PROVIDER is supabase — tests prove it is skipped. */
  supabaseSignIn?: (
    email: string,
    password: string,
  ) => Promise<PasswordSignInResult>;
};

function userFromToken(
  accessToken: string,
  fallback: { id: string; email?: string },
): User {
  const claims = decodeJwtPayload(accessToken);
  return appUserFromClaims(claims, fallback.id);
}

function toSession(tokens: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user: { id: string; email?: string };
}): Session {
  const user = userFromToken(tokens.access_token, tokens.user);
  return sessionFromTokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    user,
  });
}

export function createCognitoAuthAdapter(deps: CognitoAuthDeps) {
  const adapter = {
    async signInWithPassword(args: { email: string; password: string }): Promise<PasswordSignInResult> {
      if (!isCognitoAuth()) {
        if (!deps.supabaseSignIn) {
          return { data: { session: null, user: null }, error: { message: "Auth is not configured" } };
        }
        return deps.supabaseSignIn(args.email, args.password);
      }
      try {
        const tokens = await deps.cognitoSignIn(args.email, args.password);
        const session = toSession(tokens);
        writeBrowserSession(session, "SIGNED_IN");
        return { data: { session, user: session.user }, error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid username or password";
        return { data: { session: null, user: null }, error: { message } };
      }
    },

    async signOut(): Promise<{ error: null }> {
      try {
        await deps.cognitoSignOut?.();
      } catch {
        /* ignore */
      }
      writeBrowserSession(null, "SIGNED_OUT");
      return { error: null };
    },

    async getSession(): Promise<{ data: { session: Session | null }; error: null }> {
      return { data: { session: readBrowserSession() }, error: null };
    },

    async getUser(): Promise<{ data: { user: User | null }; error: null }> {
      const session = readBrowserSession();
      return { data: { user: session?.user ?? null }, error: null };
    },

    async setSession(tokens: {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
      user?: { id: string; email?: string };
    }): Promise<{ data: { session: Session | null; user: User | null }; error: { message: string } | null }> {
      try {
        const claims = decodeJwtPayload(tokens.access_token);
        const supabaseId =
          (typeof claims["custom:supabase_id"] === "string" && claims["custom:supabase_id"]) ||
          tokens.user?.id ||
          "";
        const email =
          (typeof claims.email === "string" && claims.email) || tokens.user?.email || "";
        const session = toSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          user: { id: supabaseId, email },
        });
        if (!session.user?.id) {
          return {
            data: { session: null, user: null },
            error: { message: "Signed in, but no app user id (custom:supabase_id) was present." },
          };
        }
        writeBrowserSession(session, "SIGNED_IN");
        return { data: { session, user: session.user }, error: null };
      } catch (err) {
        return {
          data: { session: null, user: null },
          error: { message: err instanceof Error ? err.message : "Could not store session" },
        };
      }
    },

    async refreshSession(): Promise<{ data: { session: Session | null; user: User | null }; error: { message: string } | null }> {
      const current = readBrowserSession();
      if (!current?.refresh_token || !deps.cognitoRefresh) {
        return { data: { session: current, user: current?.user ?? null }, error: null };
      }
      try {
        const tokens = await deps.cognitoRefresh(current.refresh_token);
        const session = toSession(tokens);
        writeBrowserSession(session, "TOKEN_REFRESHED");
        return { data: { session, user: session.user }, error: null };
      } catch (err) {
        return {
          data: { session: current, user: current.user },
          error: { message: err instanceof Error ? err.message : "Refresh failed" },
        };
      }
    },

    onAuthStateChange(fn: (event: string, session: Session | null) => void) {
      const unsub = subscribeAuth(fn);
      return { data: { subscription: { unsubscribe: unsub } } };
    },

    async resetPasswordForEmail(email: string, _opts?: { redirectTo?: string }) {
      if (!deps.cognitoResetPassword) {
        return { data: {}, error: { message: "Password reset is not configured for Cognito yet." } };
      }
      try {
        await deps.cognitoResetPassword(email);
        return { data: {}, error: null };
      } catch (err) {
        return { data: {}, error: { message: err instanceof Error ? err.message : "Reset failed" } };
      }
    },

    async updateUser(attrs: { password?: string; data?: Record<string, unknown> }) {
      const current = readBrowserSession();
      if (!current?.user) {
        return { data: { user: null }, error: { message: "Not signed in" } };
      }
      if (attrs.password) {
        if (!deps.cognitoUpdatePassword) {
          return { data: { user: null }, error: { message: "Password update is not configured." } };
        }
        try {
          await deps.cognitoUpdatePassword(attrs.password);
        } catch (err) {
          return {
            data: { user: null },
            error: { message: err instanceof Error ? err.message : "Password update failed" },
          };
        }
      }
      return { data: { user: current.user }, error: null };
    },

    async exchangeCodeForSession(_code: string) {
      return {
        data: { session: null, user: null },
        error: { message: "Magic-link recovery is a Supabase flow. Use Forgot password on Cognito." },
      };
    },

    async signUp() {
      return {
        data: { session: null, user: null },
        error: { message: "Sign up on the AWS path is handled by invite / admin create." },
      };
    },

    async verifyOtp() {
      return { data: { session: null, user: null }, error: { message: "OTP is not used on the Cognito path." } };
    },

    async resend() {
      return { data: {}, error: { message: "OTP is not used on the Cognito path." } };
    },

    async signInWithOtp() {
      return { data: {}, error: { message: "OTP is not used on the Cognito path." } };
    },
  };

  return adapter;
}

let _browserAdapter: ReturnType<typeof createCognitoAuthAdapter> | null = null;

/**
 * Lazy browser adapter that talks to Hive server functions for Cognito.
 * supabase.auth.signIn is never invoked on this path.
 */
export function getBrowserCognitoAuth() {
  if (_browserAdapter) return _browserAdapter;
  _browserAdapter = createCognitoAuthAdapter({
    cognitoSignIn: async (email, password) => {
      const res = await fetch("/api/aws/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "signin", email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || "Invalid username or password");
      return json as {
        access_token: string;
        refresh_token: string;
        expires_in?: number;
        user: { id: string; email?: string };
      };
    },
    cognitoSignOut: async () => {
      await fetch("/api/aws/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "signout" }),
      }).catch(() => {});
    },
    cognitoRefresh: async (refreshToken) => {
      const res = await fetch("/api/aws/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "refresh", refresh_token: refreshToken }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || "Refresh failed");
      return json as {
        access_token: string;
        refresh_token: string;
        expires_in?: number;
        user: { id: string; email?: string };
      };
    },
    cognitoResetPassword: async (email) => {
      await fetch("/api/aws/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "forgot", email }),
      });
    },
    cognitoUpdatePassword: async (password) => {
      const res = await fetch("/api/aws/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "updatePassword", password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || "Password update failed");
      }
    },
  });
  return _browserAdapter;
}

function getServerCognitoAuth() {
  // Match today's SSR: no localStorage, so no session until the client hydrates.
  // httpOnly cookies still protect server functions via requireSupabaseAuth.
  const empty = { data: { session: null as null, user: null as null }, error: null as null };
  return {
    async signInWithPassword() {
      return { data: { session: null, user: null }, error: { message: "Use the browser login form." } };
    },
    async signOut() {
      return { error: null };
    },
    async getSession() {
      return { data: { session: null }, error: null };
    },
    async getUser() {
      return { data: { user: null }, error: null };
    },
    async setSession() {
      return empty;
    },
    async refreshSession() {
      return empty;
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async resetPasswordForEmail() {
      return { data: {}, error: null };
    },
    async updateUser() {
      return { data: { user: null }, error: { message: "Not signed in" } };
    },
    async exchangeCodeForSession() {
      return { data: { session: null, user: null }, error: { message: "Not supported on Cognito." } };
    },
    async signUp() {
      return { data: { session: null, user: null }, error: { message: "Not supported on Cognito." } };
    },
    async verifyOtp() {
      return { data: { session: null, user: null }, error: { message: "Not supported on Cognito." } };
    },
    async resend() {
      return { data: {}, error: { message: "Not supported on Cognito." } };
    },
    async signInWithOtp() {
      return { data: {}, error: { message: "Not supported on Cognito." } };
    },
  };
}

export function getRuntimeCognitoAuth() {
  if (typeof window === "undefined") return getServerCognitoAuth();
  return getBrowserCognitoAuth();
}
