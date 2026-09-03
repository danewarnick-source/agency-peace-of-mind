/**
 * AWS dual-run env gates.
 *
 * Default is always the current Supabase path. AWS is used only when the
 * matching env var is set (ECS). Vercel must leave these unset.
 *
 * Client code cannot read ECS secrets. The server injects a public
 * `window.__HIVE_RUNTIME__` blob (booleans + Cognito region/ids only).
 */

import { readSupabasePublicEnv } from "../supabase-public-env.ts";

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

/**
 * URL + publishable key for constructing the existing supabase-js client.
 * When AWS is fully gated on and live Supabase keys are absent, returns a
 * dummy pair so `createClient` still succeeds (auth/data/storage are
 * intercepted). Missing keys with AWS unset still throw — same as today.
 */
export function resolveSupabaseClientEnv(): {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
} {
  const mapped = readSupabasePublicEnv();
  if (mapped) {
    return { SUPABASE_URL: mapped.url, SUPABASE_PUBLISHABLE_KEY: mapped.key };
  }

  if (isCognitoAuth() || isAwsDatabaseEnabled() || isS3StorageEnabled()) {
    return {
      SUPABASE_URL: "https://aws-dual-run.invalid",
      SUPABASE_PUBLISHABLE_KEY: "aws-dual-run",
    };
  }

  const message =
    "Missing Supabase environment variable(s): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. Connect Supabase in Lovable Cloud.";
  console.error(`[Supabase] ${message}`);
  throw new Error(message);
}
