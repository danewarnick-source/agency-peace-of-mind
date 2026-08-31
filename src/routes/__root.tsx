import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  redirect,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { isChunkLoadError, tryAutoReloadOnce, clearChunkReloadGuard } from "@/lib/chunk-reload";
import { inviteTokenFromSearchStr } from "@/lib/join-invite";
import { getPublicRuntimeBlob } from "@/lib/aws/env";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-4 text-muted-foreground">This page doesn't exist.</p>
        <a
          href="/"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Go home
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  if (!import.meta.env.PROD) console.error(error);
  // In production: errors are caught here but not logged to console.
  // Wire to an error tracking service (Sentry etc.) here when ready.
  const router = useRouter();

  // Chunk-load class only: try a one-time auto reload. If the loop guard
  // blocks it (we already reloaded recently), fall through to a friendly
  // manual-refresh card. All other errors render the normal UI below.
  if (isChunkLoadError(error)) {
    if (typeof window !== "undefined") tryAutoReloadOnce(error);
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">A new version is available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please refresh to load the latest version of the app.
          </p>
          <button
            onClick={() => {
              clearChunkReloadGuard();
              window.location.reload();
            }}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    // Enforce must_change_password BEFORE any child route renders.
    // Running here (not in a useEffect) means the Outlet never renders
    // protected content — the redirect fires synchronously during navigation.
    if (location.pathname === "/reset-password") return;
    // MFA is disabled — never leave people on /mfa-setup (old bookmarks /
    // stale clients). Send them to the dashboard instead of short-circuiting.
    if (location.pathname === "/mfa-setup") {
      throw redirect({ to: "/dashboard", replace: true });
    }
    // Old copied invite links pointed at /signup?invite= — that page is
    // new-agency signup. Send them to /join so they join this provider.
    if (location.pathname === "/signup") {
      const inviteToken = inviteTokenFromSearchStr(location.searchStr);
      if (inviteToken) {
        throw redirect({ to: "/join", search: { invite: inviteToken }, replace: true });
      }
      return;
    }
    if (location.pathname === "/login" || location.pathname === "/join") return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    // Reject sessions older than 24 hours as a defense-in-depth measure.
    // Supabase handles token refresh automatically, but this catches edge cases
    // where the client has a session object but the token is stale.
    const issuedAt = (session as { user: { id: string }; created_at?: string }).created_at;
    if (issuedAt) {
      const sessionAge = Date.now() - new Date(issuedAt).getTime();
      const MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours
      if (sessionAge > MAX_SESSION_AGE) {
        await supabase.auth.signOut();
        throw redirect({ to: "/login", replace: true });
      }
    }

    const [{ data: profile }, { data: memberships }] = await Promise.all([
      supabase
        .from("profiles")
        .select("must_change_password, staff_type_keys")
        .eq("id", session.user.id)
        .maybeSingle(),
      supabase
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", session.user.id)
        .eq("active", true)
        .limit(5),
    ]);
    if (profile?.must_change_password) {
      throw redirect({ to: "/reset-password" });
    }

    // MFA is off until real PHI launch. Planned: email one-time code after
    // password (not authenticator-app TOTP). Do not re-enable the AAL2 gate
    // here without that flow.

    // Gate app access on unsigned required provider policies. Exempted from
    // itself the same way /reset-password is exempted. IMPORTANT: this only
    // runs in beforeLoad, i.e. only on a route transition — never poll or
    // re-check this on a mounted page, or it would forcibly interrupt an
    // already-loaded session mid-shift.
    if (location.pathname.startsWith("/sign-policy/")) return;
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return;
    const { data: gatingDocs } = await supabase
      .from("nectar_documents")
      .select("id, policy_assigned_groups, policy_assigned_users")
      .eq("organization_id", orgId)
      .eq("authoritative_kind", "provider_policy")
      .eq("is_current", true)
      .eq("requires_acknowledgment", true)
      .eq("gate_app_access", true);
    if (gatingDocs && gatingDocs.length > 0) {
      const staffTypeKeys = (profile?.staff_type_keys as string[] | null) ?? [];
      for (const doc of gatingDocs) {
        const groups = (doc.policy_assigned_groups as string[] | null) ?? [];
        const users = (doc.policy_assigned_users as string[] | null) ?? [];
        let inScope = users.includes(session.user.id);
        if (!inScope && groups.includes("all_staff")) inScope = true;
        if (!inScope && groups.length) {
          inScope = staffTypeKeys.some((k) => groups.includes(k));
        }
        if (!inScope) continue;
        const { data: sig } = await supabase
          .from("policy_signatures")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("document_id", doc.id)
          .eq("is_current", true)
          .maybeSingle();
        if (!sig) {
          throw redirect({ to: "/sign-policy/$documentId", params: { documentId: doc.id } });
        }
      }
    }
  },
  head: () => ({
    meta: [
      {
        "http-equiv": "Content-Security-Policy",
        content: [
          "default-src 'self'",
          "font-src 'self' fonts.googleapis.com fonts.gstatic.com",
          "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
          "script-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          // Nominatim geocode + Supabase + Vercel analytics/ingest. Do NOT put
          // frame-ancestors here — browsers ignore it on <meta http-equiv> and
          // log a console warning; set that directive via HTTP headers only.
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel.app https://vercel.live https://nominatim.openstreetmap.org https://*.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#12141A" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Hive" },
      { title: "Hive" },
      {
        name: "description",
        content:
          "Modern employee training and certification platform for teams that take compliance seriously.",
      },
      { property: "og:title", content: "HIVE" },
      { name: "twitter:title", content: "HIVE" },
      {
        property: "og:description",
        content:
          "Modern employee training and certification platform for teams that take compliance seriously.",
      },
      {
        name: "twitter:description",
        content:
          "Modern employee training and certification platform for teams that take compliance seriously.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/263ffe8b-ec5c-4e60-82b2-dbae54124a7e/id-preview-7c0aa2f3--4bb83c55-d88b-48a7-ba9c-cfb9436a8b52.lovable.app-1780466746098.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/263ffe8b-ec5c-4e60-82b2-dbae54124a7e/id-preview-7c0aa2f3--4bb83c55-d88b-48a7-ba9c-cfb9436a8b52.lovable.app-1780466746098.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  const runtime = JSON.stringify(getPublicRuntimeBlob()).replace(/</g, "\\u003c");
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: `window.__HIVE_RUNTIME__=${runtime}` }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Global safety net: failed dynamic imports / preloads that escape the
  // router error boundary still surface here. Same one-time, loop-guarded
  // reload — non-chunk errors are ignored and bubble up normally.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onError = (e: ErrorEvent) => {
      tryAutoReloadOnce(e.error ?? e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      tryAutoReloadOnce(e.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // PWA: register the offline-shell service worker (production only).
  // sw.js caches the app shell + hashed static assets — never API data.
  useEffect(() => {
    if (typeof window === "undefined" || !import.meta.env.PROD) return;
    const registerSW = () => {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal — SW unavailable, app works without it
      });
    };
    // Defer until browser is idle to avoid blocking main thread during startup
    if ("requestIdleCallback" in window) {
      (
        window as Window & {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void;
        }
      ).requestIdleCallback(registerSW, { timeout: 5000 });
    } else {
      setTimeout(registerSW, 2000);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
