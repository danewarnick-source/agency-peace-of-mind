import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { PiWordmark } from "@/components/pi-landing/pi-mark";

import { supabase } from "@/integrations/supabase/client";
import { authRedirectUrl } from "@/lib/auth-redirect";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { signInWithUsername } from "@/lib/login.functions";
import { checkHiveExecutive } from "@/lib/hive-exec.functions";
import { completePasswordSignIn, GENERIC_LOGIN_ERROR } from "@/lib/login-auth";
import { trainingOnlyHomeForMeFn } from "@/lib/training-only-access.functions";
import {
  isCompanyAdminRole,
  persistPortalView,
  readStoredPortalView,
  resolvePostLoginLanding,
} from "@/lib/portal-view-landing";
import { toast } from "sonner";
import { isCognitoAuth } from "@/lib/aws/env";
import { shouldSkipLoginAutoRedirect } from "@/lib/cognito-login-gate";

function isSafeNext(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//");
}

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Provider Interface" }] }),
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    isSafeNext(s.next) ? { next: s.next as string } : {},
  component: LoginPage,
});

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b1220] text-[#f3efe6]">
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
        {children}
      </div>
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const signIn = useServerFn(signInWithUsername);
  const execCheck = useServerFn(checkHiveExecutive);
  const trainingHomeFn = useServerFn(trainingOnlyHomeForMeFn);
  const search = Route.useSearch();
  const nextPath = search.next;
  const hadSessionOnArrival = useRef<boolean | null>(null);
  const [justSignedIn, setJustSignedIn] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (hadSessionOnArrival.current === null) {
      hadSessionOnArrival.current = !!session;
    }
  }, [loading, session]);

  // Resolve the correct landing route ONCE per authenticated session, then
  // navigate with `replace` so the dashboard shell isn't forced to reconcile
  // /dashboard ↔ /dashboard/hive-exec after auth state settles.
  useEffect(() => {
    if (loading || !session) return;
    if (
      shouldSkipLoginAutoRedirect({
        isCognito: isCognitoAuth(),
        hadSessionOnArrival: !!hadSessionOnArrival.current,
        justSignedIn,
      })
    ) {
      return;
    }
    let cancelled = false;
    (async () => {
      // If a same-origin `next` path was preserved (e.g. MCP OAuth consent),
      // honor it and skip the exec-route resolution. Never bounce back to the
      // retired MFA page.
      if (nextPath && nextPath !== "/mfa-setup" && !nextPath.startsWith("/mfa-setup?")) {
        if (!cancelled) window.location.replace(nextPath);
        return;
      }
      let target = "/dashboard";
      try {
        const r = await execCheck();
        if (r?.isExecutive) {
          // Honor last Admin/Staff choice. Only default to Command Center
          // when there is no stored view AND the executive has no company
          // admin membership. Never overwrite admin/staff/staff_mobile.
          const storedView = readStoredPortalView();
          let isCompanyAdmin = false;
          if (!storedView || storedView === "hive_exec" || storedView === "state_preview") {
            const { data: memberships, error } = await supabase
              .from("organization_members")
              .select("role")
              .eq("user_id", session.user.id)
              .eq("active", true);
            if (error) {
              // Fail toward the company dashboard so an owner-exec is not trapped.
              isCompanyAdmin = true;
            } else {
              isCompanyAdmin = (memberships ?? []).some((m) => isCompanyAdminRole(m.role));
            }
          }
          const landing = resolvePostLoginLanding({
            isExecutive: true,
            storedView,
            isCompanyAdmin,
          });
          if (landing.persistView) persistPortalView(landing.persistView);
          target = landing.path;
        }
      } catch {
        /* fall back to /dashboard */
      }
      if (target === "/dashboard") {
        try {
          const { data: memberships } = await supabase
            .from("organization_members")
            .select("id")
            .eq("user_id", session.user.id)
            .eq("active", true)
            .limit(1);
          if (!memberships?.length) {
            const home = await trainingHomeFn();
            if (home?.hasThirtyDay) target = "/training/course";
          }
        } catch {
          /* stay on dashboard */
        }
      }
      if (!cancelled) navigate({ to: target, replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, session, navigate, execCheck, nextPath, justSignedIn, trainingHomeFn]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const identifier = String(fd.get("identifier")).trim();
    const password = String(fd.get("password"));
    setBusy(true);

    const result = await completePasswordSignIn(identifier, password, {
      signInWithEmail: async (email, pw) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
        return {
          error: error ? { message: error.message } : null,
          user: data.user ? { id: data.user.id } : null,
        };
      },
      signInWithUsername: async (id, pw) => signIn({ data: { identifier: id, password: pw } }),
      setSession: async (tokens) => {
        const { error } = await supabase.auth.setSession(tokens);
        return { error: error ? { message: error.message } : null };
      },
      getAccountStatus: async (userId) => {
        const { data: prof } = await supabase
          .from("profiles")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("account_status" as any)
          .eq("id", userId)
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (prof as any)?.account_status as string | undefined;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    });
    if (!result.ok) {
      setBusy(false);
      return toast.error(result.message || GENERIC_LOGIN_ERROR);
    }

    setJustSignedIn(true);
    setBusy(false);
    toast.success("Signed in");
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: authRedirectUrl("/dashboard"),
    });
    if (r.error) toast.error("Google sign-in failed");
  };

  const fieldClass =
    "flex h-12 w-full rounded-md border border-white/[0.12] bg-[#0b1220] px-3 py-2 text-base text-[#f3efe6] outline-none placeholder:text-[#f3efe6]/40 focus:ring-2 focus:ring-[#f3efe6]/25";

  return (
    <AuthFrame>
      <div className="flex w-full max-w-md flex-col items-center">
        <PiWordmark to="/" />

        <div className="mt-8 w-full rounded-xl border border-white/[0.10] bg-[#111827] p-7">
          <div className="mb-7 text-center">
            <h1 className="font-sans text-2xl font-semibold tracking-tight text-[#f3efe6]">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-[#f3efe6]/60">
              Sign in to your Provider Interface account
            </p>
          </div>

          <form onSubmit={onSubmit} className="grid gap-4" data-testid="login-form">
            <div className="grid gap-2">
              <Label htmlFor="identifier" className="text-[#f3efe6]/70">
                Email
              </Label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="email"
                required
                placeholder="you@example.com"
                className={fieldClass}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password" className="text-[#f3efe6]/70">
                Password
              </Label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className={`${fieldClass} pr-10`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-[#f3efe6]/50 hover:text-[#f3efe6]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-[#f3efe6]/70 hover:text-[#f3efe6]"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="h-11 w-full bg-[#f3efe6] text-[#0b1220] hover:bg-[#f3efe6]/90"
            >
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="relative my-6 text-center text-[11px] uppercase tracking-[0.18em] text-[#f3efe6]/40">
            <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.10]" />
            <span className="relative bg-[#111827] px-3">or</span>
          </div>

          <Button
            asChild
            variant="outline"
            className="h-11 w-full border-[#f3efe6]/25 bg-transparent text-[#f3efe6] hover:bg-white/[0.06] hover:text-[#f3efe6]"
          >
            <Link to="/signup">Get started</Link>
          </Button>

          <button
            type="button"
            onClick={google}
            className="mt-4 w-full text-center text-xs text-[#f3efe6]/50 hover:text-[#f3efe6]"
          >
            Continue with Google
          </button>
        </div>
      </div>
    </AuthFrame>
  );
}

/**
 * Shared dusk auth shell used by forgot-password / reset-password.
 * Matches the Provider Interface login visual language.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <AuthFrame>
      <div className="flex w-full max-w-md flex-col items-center">
        <PiWordmark to="/" />
        <div className="mt-8 w-full rounded-xl border border-white/[0.10] bg-[#f3efe6] p-7 text-[#0b1220]">
          <div className="mb-7 text-center">
            <h1 className="font-sans text-2xl font-semibold tracking-tight text-[#0b1220]">
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-[#0b1220]/65">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </AuthFrame>
  );
}
