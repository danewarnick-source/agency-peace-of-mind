import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  AUTH_GET_SESSION_TIMEOUT_MS,
  DASHBOARD_BOOT_TIMEOUT_MS,
  attachGetSessionBoot,
  dashboardShouldRedirectToLogin,
  dashboardShellShowsLoading,
  type AuthSessionLike,
} from "./auth-session-boot.ts";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("attachGetSessionBoot — catch and timeout", () => {
  it("unblocks loading when getSession rejects (no hang)", async () => {
    let loadingDone = false;
    let session: AuthSessionLike | "unset" = "unset";
    const stop = attachGetSessionBoot({
      getSession: async () => {
        throw new Error("getSession failed");
      },
      onSession: (s) => {
        session = s;
      },
      onLoadingDone: () => {
        loadingDone = true;
      },
      timeoutMs: 5_000,
    });
    await wait(20);
    assert.equal(loadingDone, true);
    assert.equal(session, "unset");
    stop();
  });

  it("unblocks loading when getSession never settles", async () => {
    let loadingDone = false;
    let session: AuthSessionLike | "unset" = "unset";
    const stop = attachGetSessionBoot({
      getSession: () => new Promise(() => {}),
      onSession: (s) => {
        session = s;
      },
      onLoadingDone: () => {
        loadingDone = true;
      },
      timeoutMs: 30,
    });
    assert.equal(loadingDone, false);
    await wait(80);
    assert.equal(loadingDone, true);
    assert.equal(session, "unset");
    stop();
  });

  it("delivers a session that resolves before the timeout", async () => {
    let loadingDone = false;
    let session: AuthSessionLike | "unset" = "unset";
    const stop = attachGetSessionBoot({
      getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }),
      onSession: (s) => {
        session = s;
      },
      onLoadingDone: () => {
        loadingDone = true;
      },
      timeoutMs: 5_000,
    });
    await wait(20);
    assert.equal(loadingDone, true);
    assert.deepEqual(session, { user: { id: "user-1" } });
    stop();
  });

  it("still applies a late session after the timeout already unblocked loading", async () => {
    let loadingDone = false;
    let session: AuthSessionLike | "unset" = "unset";
    let release: ((value: { data: { session: AuthSessionLike } }) => void) | undefined;
    const stop = attachGetSessionBoot({
      getSession: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      onSession: (s) => {
        session = s;
      },
      onLoadingDone: () => {
        loadingDone = true;
      },
      timeoutMs: 20,
    });
    await wait(50);
    assert.equal(loadingDone, true);
    assert.equal(session, "unset");
    release!({ data: { session: { user: { id: "late" } } } });
    await wait(10);
    assert.deepEqual(session, { user: { id: "late" } });
    stop();
  });

  it("timeout is 2–3 seconds", () => {
    assert.ok(AUTH_GET_SESSION_TIMEOUT_MS >= 2000 && AUTH_GET_SESSION_TIMEOUT_MS <= 3000);
    assert.ok(DASHBOARD_BOOT_TIMEOUT_MS >= 2000 && DASHBOARD_BOOT_TIMEOUT_MS <= 3000);
  });
});

describe("dashboard shell must not block forever", () => {
  const blocked = {
    sessionLoading: true,
    hasSession: false,
    execLoading: true,
    hydrated: false,
    orgLoading: true,
    bootTimedOut: false,
  };

  it("matches the live Loading… gate before timeout", () => {
    assert.equal(dashboardShellShowsLoading(blocked), true);
    assert.equal(
      dashboardShellShowsLoading({
        ...blocked,
        sessionLoading: false,
        hasSession: true,
        execLoading: false,
        hydrated: true,
        orgLoading: false,
      }),
      false,
    );
    assert.equal(
      dashboardShellShowsLoading({
        ...blocked,
        sessionLoading: false,
        hasSession: true,
        execLoading: false,
        hydrated: true,
        orgLoading: true,
      }),
      true,
    );
  });

  it("after timeout with a session, renders even if org/session still loading", () => {
    assert.equal(
      dashboardShellShowsLoading({
        sessionLoading: true,
        hasSession: true,
        execLoading: true,
        hydrated: false,
        orgLoading: true,
        bootTimedOut: true,
      }),
      false,
    );
    assert.equal(
      dashboardShouldRedirectToLogin({
        sessionLoading: true,
        hasSession: true,
        bootTimedOut: true,
      }),
      false,
    );
  });

  it("after timeout with no session, send to /login", () => {
    assert.equal(
      dashboardShouldRedirectToLogin({
        sessionLoading: true,
        hasSession: false,
        bootTimedOut: true,
      }),
      true,
    );
    assert.equal(
      dashboardShellShowsLoading({
        ...blocked,
        bootTimedOut: true,
      }),
      true,
    );
  });

  it("does not redirect to login while getSession is still in flight", () => {
    assert.equal(
      dashboardShouldRedirectToLogin({
        sessionLoading: true,
        hasSession: false,
        bootTimedOut: false,
      }),
      false,
    );
  });
});

describe("this branch matches live CloudFront JS (image 1b8fbd50 / PR 190)", () => {
  it("AuthProvider starts loading true and only finished via getSession boot or onAuthStateChange", () => {
    const src = readFileSync(new URL("../hooks/use-auth.tsx", import.meta.url), "utf8");
    assert.match(src, /useState\(true\)/);
    assert.match(src, /attachGetSessionBoot/);
    assert.match(src, /onAuthStateChange/);
    assert.match(src, /getSession/);
    assert.match(src, /onLoadingDone:\s*\(\)\s*=>\s*setLoading\(false\)/);
    assert.match(src, /supabase as any/);
    assert.doesNotMatch(src, /supabase\.auth\.getSession\(\)\.then/);
  });

  it("dashboard shell uses the boot timeout instead of blocking forever", () => {
    const src = readFileSync(new URL("../routes/dashboard.tsx", import.meta.url), "utf8");
    assert.match(src, /dashboardShellShowsLoading/);
    assert.match(src, /dashboardShouldRedirectToLogin/);
    assert.match(src, /DASHBOARD_BOOT_TIMEOUT_MS/);
    assert.match(src, /Loading…/);
    assert.doesNotMatch(
      src,
      /if \(loading \|\| !session \|\| execLoading \|\| !viewHydrated \|\| orgLoading\)/,
    );
  });

  it("current-org is a direct supabase organization_members query (not a serverFn)", () => {
    const src = readFileSync(new URL("../hooks/use-org.tsx", import.meta.url), "utf8");
    assert.match(src, /queryKey:\s*\["current-org"/);
    assert.match(src, /from\("organization_members"\)/);
    assert.match(src, /useQuery/);
    assert.doesNotMatch(src, /useServerFn/);
    assert.doesNotMatch(src, /RequirePermission/);
  });

  it("browser client persistSession + detectSessionInUrl + localStorage; no cookieOptions", () => {
    const src = readFileSync(new URL("../integrations/supabase/client.ts", import.meta.url), "utf8");
    assert.match(src, /persistSession:\s*true/);
    assert.match(src, /detectSessionInUrl:\s*true/);
    assert.match(src, /storage:\s*window\.localStorage/);
    assert.doesNotMatch(src, /cookieOptions/);
    assert.doesNotMatch(src, /flowType/);
  });

  it("does not invent a CloudFront CSP — AWS source has no CSP header; meta connect-src allows supabase", () => {
    const vercel = readFileSync(new URL("../../vercel.json", import.meta.url), "utf8");
    assert.match(vercel, /Content-Security-Policy/);
    assert.match(vercel, /frame-ancestors 'none'/);
    assert.doesNotMatch(vercel, /connect-src/);

    const root = readFileSync(new URL("../routes/__root.tsx", import.meta.url), "utf8");
    assert.match(root, /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/);

    const aws = readFileSync(new URL("../../docs/AWS_DEPLOY.md", import.meta.url), "utf8");
    assert.doesNotMatch(aws, /Content-Security-Policy/);

    const lambda = readFileSync(new URL("../../docs/AWS_LAMBDA.md", import.meta.url), "utf8");
    assert.doesNotMatch(lambda, /Content-Security-Policy/);
    assert.match(lambda, /AllViewerExceptHostHeader/);
    assert.match(lambda, /E1BPLMZE2XLSKD/);

    const nitro = readFileSync(new URL("../../nitro.config.ts", import.meta.url), "utf8");
    assert.doesNotMatch(nitro, /Content-Security-Policy/);
  });
});
