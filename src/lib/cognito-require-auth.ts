/**
 * Cognito requireSupabaseAuth must not throw Unauthorized.
 * h3 turns that throw into a detail-free JSON 500, then server.ts used to
 * HTML-rewrite it. Missing user → empty isSSR context, same as no Bearer.
 */

export const AWS_SESSION_COOKIE_NAME = "hive.aws_session";

export function cookieHeaderHasAwsSession(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .some((part) => part.trim().startsWith(`${AWS_SESSION_COOKIE_NAME}=`));
}

export function emptySsrAuthContext() {
  return {
    supabase: null,
    userId: null,
    claims: null,
    isSSR: true as const,
  };
}

/** Never throw — serverFns degrade to empty instead of Internal Server Error. */
export function cognitoUnresolvedUserAction(): "empty-ssr-context" {
  return "empty-ssr-context";
}

export function logCognitoRequireAuth(opts: {
  hasCookie: boolean;
  hasBearer: boolean;
  resolved: boolean;
}) {
  console.error(
    `[requireSupabaseAuth] cognito resolved=${opts.resolved ? "yes" : "no"} hasCookie=${opts.hasCookie} hasBearer=${opts.hasBearer}`,
  );
}
