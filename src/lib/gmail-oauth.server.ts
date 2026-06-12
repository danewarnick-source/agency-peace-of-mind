/**
 * Gmail OAuth + Google API helpers (server-only).
 *
 * SECURITY:
 * - Tokens never leave the server. UI never sees access_token / refresh_token.
 * - State parameter is HMAC-signed (GMAIL_OAUTH_STATE_SECRET) and carries org_id,
 *   user_id, nonce, and a short expiry — callback verifies before exchange.
 * - Read-only Gmail scope (gmail.readonly). No send/modify.
 */
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_TTL_SECONDS = 15 * 60;

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export interface OAuthState {
  org: string;
  uid: string;
  nonce: string;
  exp: number;
}

export function signOAuthState(state: Omit<OAuthState, "nonce" | "exp">): string {
  const secret = process.env.GMAIL_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("GMAIL_OAUTH_STATE_SECRET not configured");
  const full: OAuthState = {
    ...state,
    nonce: randomBytes(12).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  const payload = b64url(JSON.stringify(full));
  const sig = b64url(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyOAuthState(token: string): OAuthState {
  const secret = process.env.GMAIL_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("GMAIL_OAUTH_STATE_SECRET not configured");
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new Error("Invalid state");
  const expected = b64url(createHmac("sha256", secret).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("State signature invalid");
  const parsed = JSON.parse(b64urlDecode(payload).toString("utf8")) as OAuthState;
  if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("State expired — please reconnect");
  }
  return parsed;
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not configured");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenSet> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth client not configured");
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${t.slice(0, 300)}`);
  }
  return (await res.json()) as TokenSet;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth client not configured");
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Token refresh failed (${res.status}): ${t.slice(0, 300)}`);
  }
  return (await res.json()) as TokenSet;
}

/** Fetch the connected Google account's email from the userinfo endpoint. */
export async function getGoogleUserinfo(accessToken: string): Promise<{ email: string; sub: string }> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed (${res.status})`);
  const body = (await res.json()) as { email?: string; sub?: string };
  if (!body.email || !body.sub) throw new Error("userinfo missing email/sub");
  return { email: body.email, sub: body.sub };
}
