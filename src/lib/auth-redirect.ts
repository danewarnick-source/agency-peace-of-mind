/**
 * Where auth emails (password reset, invite, magic link, email confirm)
 * send people after they click the link.
 *
 * Browser: current page origin (hivecertify.com, the Sep 1 Vercel host,
 * localhost). Lovable preview hosts are treated as unsafe and rewritten.
 * Server / SSR: PUBLIC_SITE_URL, PUBLIC_APP_URL, SITE_URL, then Vercel
 * URL env, then https://hivecertify.com.
 *
 * Ops (cannot be done from this repo): in the Supabase dashboard,
 * Authentication → URL Configuration, set Site URL to
 * https://hivecertify.com and add these Additional Redirect URLs:
 *   https://hivecertify.com/**
 *   https://agency-peace-of-mind.vercel.app/**
 * If Site URL stays a Lovable domain, Supabase can ignore our redirectTo
 * and the reset email will still open Lovable.
 */

export const CANONICAL_SITE_ORIGIN = "https://hivecertify.com";
export const RESET_PASSWORD_PATH = "/reset-password";
export const VERCEL_PREVIEW_ORIGIN = "https://agency-peace-of-mind.vercel.app";

function readEnv(name: string): string | undefined {
  try {
    if (typeof process !== "undefined" && process.env) {
      const value = process.env[name];
      return typeof value === "string" && value.trim() ? value : undefined;
    }
  } catch {
    /* browser / edge without process */
  }
  return undefined;
}

export function isLovableAuthHost(hostname: string): boolean {
  const host = String(hostname || "").toLowerCase();
  return (
    host === "lovable.app" ||
    host === "lovable.dev" ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovable.dev")
  );
}

export function normalizeOrigin(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isSafeAuthOrigin(origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  try {
    return !isLovableAuthHost(new URL(normalized).hostname);
  } catch {
    return false;
  }
}

function envAuthOrigin(): string | null {
  const candidates = [
    readEnv("PUBLIC_SITE_URL"),
    readEnv("PUBLIC_APP_URL"),
    readEnv("SITE_URL"),
    readEnv("APP_URL"),
    readEnv("APP_ORIGIN"),
  ];
  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate);
    if (origin && isSafeAuthOrigin(origin)) return origin;
  }

  const vercel = readEnv("VERCEL_PROJECT_PRODUCTION_URL") || readEnv("VERCEL_URL");
  const vercelOrigin = normalizeOrigin(vercel);
  if (vercelOrigin && isSafeAuthOrigin(vercelOrigin)) return vercelOrigin;

  return null;
}

/**
 * Resolve the origin auth emails should use.
 * `candidate` wins when it is a real, non-Lovable origin (callers pass
 * window.location.origin or a site_origin field from the browser).
 */
export function resolveAuthOrigin(candidate?: string | null): string {
  const fromCandidate = normalizeOrigin(candidate);
  if (fromCandidate && isSafeAuthOrigin(fromCandidate)) return fromCandidate;

  if (typeof window !== "undefined") {
    try {
      const fromWindow = normalizeOrigin(window.location.origin);
      if (fromWindow && isSafeAuthOrigin(fromWindow)) return fromWindow;
    } catch {
      /* ignore */
    }
  }

  return envAuthOrigin() ?? CANONICAL_SITE_ORIGIN;
}

export function authRedirectUrl(path: string, candidate?: string | null): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${resolveAuthOrigin(candidate)}${p}`;
}

export function passwordResetRedirectUrl(candidate?: string | null): string {
  return authRedirectUrl(RESET_PASSWORD_PATH, candidate);
}

/**
 * Rewrite a full redirect URL if it points at Lovable. Keeps path, query,
 * and hash so /reset-password and /audit-portal/set-password still land
 * on the right page after the host swap.
 */
export function sanitizeAuthRedirectUrl(
  url: string,
  fallbackPath: string = RESET_PASSWORD_PATH,
): string {
  try {
    const parsed = new URL(url);
    if (isLovableAuthHost(parsed.hostname)) {
      return `${CANONICAL_SITE_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return authRedirectUrl(fallbackPath);
  }
}
