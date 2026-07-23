import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, createRootRouteWithContext, useRouter, redirect,
  HeadContent, Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { CelebrationProvider } from "@/components/celebrations/celebration-provider";
import { GuidedTourProvider } from "@/components/nectar/guided-tour-provider";
import { isChunkLoadError, tryAutoReloadOnce, clearChunkReloadGuard } from "@/lib/chunk-reload";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-4 text-muted-foreground">This page doesn't exist.</p>
        <a href="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Go home</a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
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
            onClick={() => { clearChunkReloadGuard(); window.location.reload(); }}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >Refresh</button>
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
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >Try again</button>
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", session.user.id)
      .maybeSingle();
    if (data?.must_change_password) {
      throw redirect({ to: "/reset-password" });
    }

    // Gate app access on unsigned required provider policies. Exempted from
    // itself the same way /reset-password is exempted. IMPORTANT: this only
    // runs in beforeLoad, i.e. only on a route transition — never poll or
    // re-check this on a mounted page, or it would forcibly interrupt an
    // already-loaded session mid-shift.
    if (location.pathname.startsWith("/sign-policy/")) return;
    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", session.user.id)
      .eq("active", true)
      .limit(1);
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
      let staffTypeKeys: string[] | null = null;
      for (const doc of gatingDocs) {
        const groups = (doc.policy_assigned_groups as string[] | null) ?? [];
        const users = (doc.policy_assigned_users as string[] | null) ?? [];
        let inScope = users.includes(session.user.id);
        if (!inScope && groups.includes("all_staff")) inScope = true;
        if (!inScope && groups.length) {
          if (staffTypeKeys === null) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("staff_type_keys")
              .eq("id", session.user.id)
              .maybeSingle();
            staffTypeKeys = (prof?.staff_type_keys as string[] | null) ?? [];
          }
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
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0d112b" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "HIVE" },
      { title: "HIVE" },
      { name: "description", content: "Modern employee training and certification platform for teams that take compliance seriously." },
      { property: "og:title", content: "HIVE" },
      { name: "twitter:title", content: "HIVE" },
      { property: "og:description", content: "Modern employee training and certification platform for teams that take compliance seriously." },
      { name: "twitter:description", content: "Modern employee training and certification platform for teams that take compliance seriously." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/263ffe8b-ec5c-4e60-82b2-dbae54124a7e/id-preview-7c0aa2f3--4bb83c55-d88b-48a7-ba9c-cfb9436a8b52.lovable.app-1780466746098.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/263ffe8b-ec5c-4e60-82b2-dbae54124a7e/id-preview-7c0aa2f3--4bb83c55-d88b-48a7-ba9c-cfb9436a8b52.lovable.app-1780466746098.png" },
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
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
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
    const onError = (e: ErrorEvent) => { tryAutoReloadOnce(e.error ?? e.message); };
    const onRejection = (e: PromiseRejectionEvent) => { tryAutoReloadOnce(e.reason); };
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
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => { /* non-fatal */ });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CelebrationProvider>
          <GuidedTourProvider>
            <Outlet />
          </GuidedTourProvider>
        </CelebrationProvider>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
