/**
 * Trusted server-side Supabase client (service role — bypasses RLS).
 * When DATABASE_URL / AWS_DATABASE_URL is set, `.from()` / `.rpc()` talk to
 * that Postgres pool instead. When AUTH_PROVIDER=cognito, `.auth` uses Cognito.
 * When S3_BUCKET is set, `.storage` uses S3. Unset AWS vars keep today's client.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getDatabaseUrl, isCognitoAuth, isS3StorageEnabled } from "@/lib/aws/env";
import { getAwsDataClient } from "@/lib/aws/db-client.server";
import { getS3StorageAdapter } from "@/lib/aws/s3-storage.server";
import { createAwsAuthAdmin } from "@/lib/aws/auth-admin.server";

function readAdminUrl(): string {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  return url && url.trim() ? url.trim() : "";
}

function createSupabaseAdminClient() {
  const SUPABASE_URL = readAdminUrl();
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Connect Supabase in Lovable Cloud.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

let _liveAdmin: AdminClient | null | undefined;
function liveAdminOrNull(): AdminClient | null {
  if (_liveAdmin !== undefined) return _liveAdmin;
  if (!readAdminUrl() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    _liveAdmin = null;
    return null;
  }
  try {
    _liveAdmin = createSupabaseAdminClient();
    return _liveAdmin;
  } catch {
    _liveAdmin = null;
    return null;
  }
}

export function getSupabaseAdminOrNull(): AdminClient | null {
  return liveAdminOrNull();
}

function requireLive(): AdminClient {
  const live = liveAdminOrNull();
  if (!live) {
    throw new Error(
      "Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Connect Supabase in Lovable Cloud.",
    );
  }
  return live;
}

let _awsAuth: unknown = null;

// Server-side Supabase client with service role - bypasses RLS
// SECURITY: Only use this for trusted server-side operations, never expose to client code
// Import like: import { supabaseAdmin } from "@/integrations/supabase/client.server";
export const supabaseAdmin = new Proxy({} as AdminClient, {
  get(_, prop, receiver) {
    if (prop === "from" || prop === "rpc") {
      if (getDatabaseUrl()) {
        return getAwsDataClient()[prop];
      }
    }
    if (prop === "storage" && isS3StorageEnabled()) {
      return getS3StorageAdapter();
    }
    if (prop === "auth" && isCognitoAuth()) {
      if (!_awsAuth) {
        const lookup = getDatabaseUrl() ? getAwsDataClient() : liveAdminOrNull();
        _awsAuth = createAwsAuthAdmin(lookup as never);
      }
      return _awsAuth;
    }
    const live = requireLive();
    return Reflect.get(live, prop, receiver);
  },
});
