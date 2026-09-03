/**
 * AWS dual-run env gates.
 *
 * Default is always the current Supabase path. AWS is used only when the
 * matching env var is set (ECS). Vercel must leave these unset.
 *
 * Client code cannot read ECS secrets. The server injects a public
 * `window.__HIVE_RUNTIME__` blob (booleans + Cognito region/ids only).
 */

export type AuthProvider = "cognito" | "supabase";

export type HiveRuntimeBlob = {
  authProvider: AuthProvider;
  databaseUrlSet: boolean;
  s3BucketSet: boolean;
  cognitoRegion?: string;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
};

declare global {
  interface Window {
    __HIVE_RUNTIME__?: HiveRuntimeBlob;
  }
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  }
}

function readRawAuthProvider(): string {
  const fromWindow =
    typeof window !== "undefined" ? window.__HIVE_RUNTIME__?.authProvider : undefined;
  const fromProc =
    typeof process !== "undefined"
      ? process.env.AUTH_PROVIDER || process.env.VITE_AUTH_PROVIDER
      : undefined;
  return String(fromWindow || fromProc || "supabase")
    .trim()
    .toLowerCase();
}

export function getAuthProvider(): AuthProvider {
  return readRawAuthProvider() === "cognito" ? "cognito" : "supabase";
}

export function isCognitoAuth(): boolean {
  return getAuthProvider() === "cognito";
}

export function getDatabaseUrl(): string | null {
  if (typeof process === "undefined") return null;
  const url = process.env.DATABASE_URL || process.env.AWS_DATABASE_URL;
  return url && url.trim() ? url.trim() : null;
}

export function isAwsDatabaseEnabled(): boolean {
  if (typeof window !== "undefined" && window.__HIVE_RUNTIME__) {
    return !!window.__HIVE_RUNTIME__.databaseUrlSet;
  }
  return getDatabaseUrl() !== null;
}

export function isS3StorageEnabled(): boolean {
  if (typeof window !== "undefined" && window.__HIVE_RUNTIME__) {
    return !!window.__HIVE_RUNTIME__.s3BucketSet;
  }
  if (typeof process === "undefined") return false;
  return !!(process.env.S3_BUCKET && process.env.S3_BUCKET.trim());
}

/** Client data must go through the server when Cognito is on (no Supabase JWT). */
export function shouldProxyClientData(): boolean {
  return isCognitoAuth() || isAwsDatabaseEnabled();
}

export function getS3Bucket(): string | null {
  if (typeof process === "undefined") return null;
  const b = process.env.S3_BUCKET?.trim();
  return b || null;
}

export function getS3Region(): string {
  if (typeof process === "undefined") return "us-east-1";
  return (process.env.S3_REGION || process.env.AWS_REGION || "us-east-1").trim();
}

export function getCognitoConfig(): {
  userPoolId: string;
  clientId: string;
  region: string;
  clientSecret: string | null;
} | null {
  const fromWindow = typeof window !== "undefined" ? window.__HIVE_RUNTIME__ : undefined;
  const userPoolId =
    fromWindow?.cognitoUserPoolId ||
    (typeof process !== "undefined" ? process.env.COGNITO_USER_POOL_ID : undefined) ||
    "";
  const clientId =
    fromWindow?.cognitoClientId ||
    (typeof process !== "undefined" ? process.env.COGNITO_CLIENT_ID : undefined) ||
    "";
  const region =
    fromWindow?.cognitoRegion ||
    (typeof process !== "undefined"
      ? process.env.COGNITO_REGION || process.env.AWS_REGION
      : undefined) ||
    "us-east-1";
  const clientSecret =
    typeof process !== "undefined" && process.env.COGNITO_CLIENT_SECRET
      ? process.env.COGNITO_CLIENT_SECRET
      : null;
  if (!userPoolId.trim() || !clientId.trim()) return null;
  return {
    userPoolId: userPoolId.trim(),
    clientId: clientId.trim(),
    region: region.trim() || "us-east-1",
    clientSecret,
  };
}

/**
 * Public runtime blob injected into the HTML shell so the browser bundle
 * (built without ECS env) still knows which path to take.
 * Secrets (DATABASE_URL, client secret, service role) are never included.
 */
export function getPublicRuntimeBlob(): HiveRuntimeBlob {
  // SSR injects this into the HTML. Reuse it on the client so hydration
  // matches (browser bundles do not receive ECS secrets / AUTH_PROVIDER).
  if (typeof window !== "undefined" && window.__HIVE_RUNTIME__) {
    return window.__HIVE_RUNTIME__;
  }
  const cognito = typeof process !== "undefined" ? getCognitoConfig() : null;
  return {
    authProvider: getAuthProvider(),
    databaseUrlSet: getDatabaseUrl() !== null,
    s3BucketSet: isS3StorageEnabled(),
    ...(cognito
      ? {
          cognitoRegion: cognito.region,
          cognitoUserPoolId: cognito.userPoolId,
          cognitoClientId: cognito.clientId,
        }
      : {}),
  };
}

function trimEnv(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function firstNamedEnv(
  env: Record<string, string | undefined>,
  names: readonly string[],
): string {
  for (const name of names) {
    const value = trimEnv(env[name]);
    if (value) return value;
  }
  return "";
}

/** Existing Vercel / Vite names on Hive-Platform, then Lovable / Next aliases. */
export const SUPABASE_PUBLISHABLE_URL_NAMES = [
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;

export const SUPABASE_PUBLISHABLE_KEY_NAMES = [
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/**
 * Publishable URL + anon key from a process.env-like record.
 * Prefers the Vercel names already set on Hive-Platform
 * (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
 */
export function readPublishableSupabaseEnv(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): { url: string; key: string } | null {
  const url = firstNamedEnv(env, SUPABASE_PUBLISHABLE_URL_NAMES);
  const key = firstNamedEnv(env, SUPABASE_PUBLISHABLE_KEY_NAMES);
  if (!url || !key) return null;
  return { url, key };
}

/**
 * URL + publishable key for constructing the existing supabase-js client.
 * When AWS is fully gated on and live Supabase keys are absent, returns a
 * dummy pair so `createClient` still succeeds (auth/data/storage are
 * intercepted). Missing keys with AWS unset still throw — same as today.
 *
 * Browser bundles only receive `import.meta.env.VITE_*` when those identifiers
 * are written statically — Vite will not inline a dynamic Record lookup.
 */
export function resolveSupabaseClientEnv(): {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
} {
  const viteUrl =
    typeof import.meta.env !== "undefined" ? trimEnv(import.meta.env.VITE_SUPABASE_URL) : "";
  const viteAnon =
    typeof import.meta.env !== "undefined" ? trimEnv(import.meta.env.VITE_SUPABASE_ANON_KEY) : "";
  const vitePublishable =
    typeof import.meta.env !== "undefined"
      ? trimEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
      : "";
  const fromProc = typeof process !== "undefined" ? readPublishableSupabaseEnv(process.env) : null;
  const url = viteUrl || fromProc?.url || "";
  const key = viteAnon || vitePublishable || fromProc?.key || "";

  if (url && key) return { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key };

  if (isCognitoAuth() || isAwsDatabaseEnabled() || isS3StorageEnabled()) {
    return {
      SUPABASE_URL: "https://aws-dual-run.invalid",
      SUPABASE_PUBLISHABLE_KEY: "aws-dual-run",
    };
  }

  const missing = [
    ...(!url ? ["SUPABASE_URL"] : []),
    ...(!key ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
  ];
  const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Connect Supabase in Lovable Cloud.`;
  console.error(`[Supabase] ${message}`);
  throw new Error(message);
}
