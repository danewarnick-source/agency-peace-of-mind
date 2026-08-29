/**
 * Auth bootstrap must not spin forever. supabase.auth.getSession() can hang
 * (GoTrue initialize / token refresh never settles) and never reject — live
 * CloudFront after-login Loading… never reached ALB because this stays in
 * the browser. Same helper on Vercel (BUILD_TARGET unset) and AWS.
 */

export const AUTH_GET_SESSION_TIMEOUT_MS = 2500;
export const DASHBOARD_BOOT_TIMEOUT_MS = 2500;

export type AuthSessionLike = { user?: { id?: string } | null } | null;

export type GetSessionFn = () => Promise<{ data: { session: AuthSessionLike } }>;

export type ScheduledTimer = { cancel: () => void };

/**
 * Run getSession with .catch + a 2–3s timeout. Timeout only unblocks
 * loading — a late success still delivers the session.
 */
export function attachGetSessionBoot(opts: {
  getSession: GetSessionFn;
  onSession: (session: AuthSessionLike) => void;
  onLoadingDone: () => void;
  timeoutMs?: number;
  schedule?: (fn: () => void, ms: number) => ScheduledTimer;
}): () => void {
  let closed = false;
  let loadingDone = false;
  const timeoutMs = opts.timeoutMs ?? AUTH_GET_SESSION_TIMEOUT_MS;
  const schedule =
    opts.schedule ??
    ((fn, ms) => {
      const id = setTimeout(fn, ms);
      return { cancel: () => clearTimeout(id) };
    });

  const finishLoading = () => {
    if (closed || loadingDone) return;
    loadingDone = true;
    opts.onLoadingDone();
  };

  const timer = schedule(finishLoading, timeoutMs);

  Promise.resolve()
    .then(() => opts.getSession())
    .then(({ data }) => {
      if (closed) return;
      opts.onSession(data.session ?? null);
      finishLoading();
    })
    .catch(() => {
      finishLoading();
    });

  return () => {
    closed = true;
    timer.cancel();
  };
}

/** After timeout with no session → /login. While getSession is in flight → wait. */
export function dashboardShouldRedirectToLogin(input: {
  sessionLoading: boolean;
  hasSession: boolean;
  bootTimedOut: boolean;
}): boolean {
  if (input.hasSession) return false;
  return !input.sessionLoading || input.bootTimedOut;
}

/**
 * Live shell (`dashboard.tsx`) used to block on
 * session.loading || !session || execLoading || !hydrated || orgLoading.
 * After the boot timeout, a session must render the shell; no session
 * stays on Loading… only while the /login redirect runs.
 */
export function dashboardShellShowsLoading(input: {
  sessionLoading: boolean;
  hasSession: boolean;
  execLoading: boolean;
  hydrated: boolean;
  orgLoading: boolean;
  bootTimedOut: boolean;
}): boolean {
  if (input.bootTimedOut) return !input.hasSession;
  return (
    input.sessionLoading ||
    !input.hasSession ||
    input.execLoading ||
    !input.hydrated ||
    input.orgLoading
  );
}
