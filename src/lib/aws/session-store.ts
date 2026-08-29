/**
 * Browser/local session store for the Cognito dual-run path.
 * Shape matches supabase-js Session enough for useAuth + attachSupabaseAuth.
 */

import type { Session, User } from "@supabase/supabase-js";

export const COGNITO_SESSION_KEY = "hive.cognito.session";

type Listener = (event: string, session: Session | null) => void;

const listeners = new Set<Listener>();

export function appUserFromClaims(
  claims: Record<string, unknown>,
  fallbackId?: string | null,
): User {
  const supabaseId =
    (typeof claims["custom:supabase_id"] === "string" && claims["custom:supabase_id"]) ||
    fallbackId ||
    "";
  const email = typeof claims.email === "string" ? claims.email : "";
  const now = new Date().toISOString();
  return {
    id: supabaseId,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: now,
    phone: "",
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: "cognito", providers: ["cognito"] },
    user_metadata: {
      email,
      supabase_id: supabaseId,
    },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  } as User;
}

export function sessionFromTokens(opts: {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  user: User;
}): Session {
  const expiresIn = opts.expiresIn && opts.expiresIn > 0 ? opts.expiresIn : 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  return {
    access_token: opts.accessToken,
    refresh_token: opts.refreshToken,
    expires_in: expiresIn,
    expires_at: expiresAt,
    token_type: "bearer",
    user: opts.user,
  } as Session;
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) return {};
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json =
      typeof atob === "function"
        ? atob(b64 + pad)
        : Buffer.from(b64 + pad, "base64").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function canUseLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function readBrowserSession(): Session | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(COGNITO_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.access_token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeBrowserSession(session: Session | null, event = "SIGNED_IN"): void {
  if (!canUseLocalStorage()) return;
  try {
    if (session) window.localStorage.setItem(COGNITO_SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(COGNITO_SESSION_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  for (const fn of listeners) {
    try {
      fn(session ? event : "SIGNED_OUT", session);
    } catch {
      /* listener errors must not break auth */
    }
  }
}

export function subscribeAuth(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function bearerFromSession(session: Session | null): string | null {
  return session?.access_token ?? null;
}
