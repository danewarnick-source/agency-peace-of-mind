/**
 * CloudFront / Cognito login should not auto-enter the dashboard from a
 * leftover hive.aws_session / hive.cognito.session. Dane needs the
 * username+password form. After an explicit Sign in, redirect as usual.
 * Vercel/Supabase still auto-redirects when a session already exists.
 */
export function shouldSkipLoginAutoRedirect(opts: {
  isCognito: boolean;
  hadSessionOnArrival: boolean;
  justSignedIn: boolean;
}): boolean {
  if (!opts.isCognito) return false;
  if (opts.justSignedIn) return false;
  return opts.hadSessionOnArrival;
}

/** /api/aws/db or profile bootstrap failed hard enough to abandon the session. */
export function isAwsBootstrapFailure(result: {
  error?: { message?: string } | null;
  status?: number | null;
}): boolean {
  const status = result.status ?? 0;
  if (status >= 500 || status === 401 || status === 403) return true;
  const msg = String(result.error?.message ?? "");
  if (!msg) return false;
  return /self-signed certificate|does not exist|internal server error|httperror|\b500\b/i.test(
    msg,
  );
}
