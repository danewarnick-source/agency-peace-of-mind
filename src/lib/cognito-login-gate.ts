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
  /** After an explicit Sign out, never auto-enter a leftover token. */
  explicitSignOut?: boolean;
}): boolean {
  if (opts.justSignedIn) return false;
  if (opts.explicitSignOut) return true;
  if (!opts.isCognito) return false;
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

/**
 * Cognito Loading… overlay (the one with Sign out) must not wait forever.
 * Session is valid; leave Loading on ANY bootstrap failure: /api/aws/db 5xx,
 * unhandled HTTPError JSON, HTML 500 (branded error page), org/home loader
 * error, or the 8s stuck timer — show the dashboard with what loaded.
 */
export function shouldLeaveCognitoLoadingOverlay(opts: {
  isCognito: boolean;
  hasSession: boolean;
  awsDb5xx: boolean;
  orgError: boolean;
  timedOut: boolean;
  unhandledHttpError?: boolean;
  html5xx?: boolean;
}): boolean {
  if (!opts.isCognito) return false;
  if (!opts.hasSession) return false;
  return (
    opts.awsDb5xx || opts.orgError || opts.timedOut || !!opts.unhandledHttpError || !!opts.html5xx
  );
}

export const HIVE_BOOTSTRAP_ERROR_EVENT = "hive:bootstrap-error";

export type BootstrapFailureKind = "html-500" | "unhandled-httperror" | "http-5xx";

export type BootstrapFailure = {
  kind: BootstrapFailureKind;
  message: string;
  status: number;
};

export function inspectBootstrapFailure(
  res: { status: number; headers: { get: (name: string) => string | null } },
  bodyText: string,
): BootstrapFailure | null {
  if (res.status < 500) return null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/html")) {
    return { kind: "html-500", message: "HTML 500", status: res.status };
  }
  try {
    const json = JSON.parse(bodyText) as { unhandled?: boolean; message?: string };
    if (json && json.unhandled === true && /httperror/i.test(String(json.message ?? ""))) {
      return { kind: "unhandled-httperror", message: "HTTPError", status: res.status };
    }
  } catch {
    /* not JSON */
  }
  return { kind: "http-5xx", message: `HTTP ${res.status}`, status: res.status };
}

export function notifyBootstrapFailure(detail: BootstrapFailure) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HIVE_BOOTSTRAP_ERROR_EVENT, { detail }));
}

let watchDepth = 0;
let origFetch: typeof fetch | null = null;

/** Watch every fetch (serverFns, /api/aws/db) for 5xx / HTML 500 / unhandled HTTPError. */
export function installBootstrapFailureWatch(
  onFail: (detail: BootstrapFailure) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  if (!origFetch) origFetch = window.fetch.bind(window);
  const native = origFetch;
  watchDepth += 1;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await native(input, init);
    if (res.status >= 500) {
      const text = await res
        .clone()
        .text()
        .catch(() => "");
      const inspected = inspectBootstrapFailure(res, text);
      if (inspected) {
        notifyBootstrapFailure(inspected);
        onFail(inspected);
      }
    }
    return res;
  }) as typeof fetch;
  return () => {
    watchDepth -= 1;
    if (watchDepth <= 0 && origFetch) {
      window.fetch = origFetch;
      origFetch = null;
      watchDepth = 0;
    }
  };
}
