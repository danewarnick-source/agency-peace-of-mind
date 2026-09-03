import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getDatabaseUrl, isCognitoAuth } from "@/lib/aws/env";
import { readSupabasePublicEnv } from "@/lib/supabase-public-env";
import { resolveRequestUser } from "@/lib/aws/resolve-user.server";
import { getAwsDataClient } from "@/lib/aws/db-client.server";
import { readAwsSessionCookie } from "@/lib/aws/session-cookie.server";
import {
  cookieHeaderHasAwsSession,
  emptySsrAuthContext,
  logCognitoRequireAuth,
} from "@/lib/cognito-require-auth";

type SupabaseAuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: User;
  isSSR: boolean;
};

function trustedDataClient() {
  if (getDatabaseUrl()) return getAwsDataClient() as unknown as SupabaseClient<Database>;
  return null;
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();

    if (isCognitoAuth()) {
      const resolved = await resolveRequestUser(request);
      const authHeader = request?.headers?.get("authorization");
      const hasBearer = !!authHeader?.startsWith("Bearer ");
      let hasCookie = cookieHeaderHasAwsSession(request?.headers?.get("cookie"));
      try {
        hasCookie = hasCookie || !!readAwsSessionCookie();
      } catch {
        /* getCookie can throw outside a Start request context */
      }
      logCognitoRequireAuth({ hasCookie, hasBearer, resolved: !!resolved });
      if (!resolved) {
        // Do not throw Unauthorized — h3 turns that into a JSON 500 that
        // server.ts used to HTML-rewrite, hanging Cognito Loading.
        return next({
          context: emptySsrAuthContext() as unknown as SupabaseAuthContext,
        });
      }
      const dataClient =
        trustedDataClient() ??
        ((await import("./client.server")).supabaseAdmin as unknown as SupabaseClient<Database>);
      return next({
        context: {
          supabase: dataClient,
          userId: resolved.userId,
          claims: resolved.claims,
          isSSR: false,
        },
      });
    }

    const mapped = readSupabasePublicEnv();

    if (!mapped) {
      throw new Error("Missing Supabase environment variables.");
    }
    const SUPABASE_URL = mapped.url;
    const SUPABASE_PUBLISHABLE_KEY = mapped.key;

    const authHeader = request?.headers?.get("authorization");

    // During SSR there is no auth header — return a safe empty context
    // instead of throwing, so SSR completes and the client re-calls with
    // proper auth after hydration.
    if (!authHeader?.startsWith("Bearer ")) {
      return next({
        context: emptySsrAuthContext() as unknown as SupabaseAuthContext,
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      // TEMPORARY: log full detail — h3/nitro on the AWS Lambda target
      // sanitizes every thrown error down to a generic, detail-free
      // "Internal Server Error" downstream, so this is the only place the
      // real cause (expired token, Supabase reachability, wrong key, etc.)
      // will actually show up in CloudWatch. Remove once the real cause
      // here is found and fixed.
      console.error("[requireSupabaseAuth] getUser failed:", error, "hasUser:", !!data?.user);
      throw new Error("Unauthorized");
    }

    const dataClient = trustedDataClient() ?? supabase;

    return next({
      context: {
        supabase: dataClient,
        userId: data.user.id,
        claims: data.user,
        isSSR: false,
      },
    });
  },
);
