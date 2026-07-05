import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowRight, Hexagon, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { signInWithUsername } from "@/lib/login.functions";
import { checkHiveExecutive } from "@/lib/hive-exec.functions";
import { toast } from "sonner";

function isSafeNext(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//");
}

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — HIVE" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: isSafeNext(s.next) ? s.next : undefined,
  }),
  component: LoginPage,
});

const JAKARTA = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
const NAVY_BG =
  "radial-gradient(1000px 600px at 80% 110%, rgba(244,169,58,0.18), transparent 60%), linear-gradient(140deg, #141a3d 0%, #0d112b 100%)";

function HexPattern() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="hex" width="80" height="92" patternUnits="userSpaceOnUse" patternTransform="scale(1.4)">
          <polygon
            points="40,2 78,24 78,68 40,90 2,68 2,24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex)" />
    </svg>
  );
}

function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2.5 font-semibold text-white ${className}`} style={{ fontFamily: JAKARTA }}>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] backdrop-blur">
        <Hexagon className="h-4 w-4 text-[#f4a93a]" strokeWidth={2.5} />
      </span>
      <span className="text-[15px] tracking-tight">
        HIVE <span className="ml-1 text-xs font-normal text-white/55">— powered by NECTAR™</span>
      </span>
    </Link>
  );
}

function NectarPill() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
      style={{
        fontFamily: JAKARTA,
        background: "rgba(244,169,58,0.12)",
        borderColor: "rgba(244,169,58,0.35)",
        color: "#f7c172",
      }}
    >
      <Sparkles className="h-3 w-3" />
      Powered by NECTAR™ — the intelligence layer for care
    </span>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const signIn = useServerFn(signInWithUsername);
  const execCheck = useServerFn(checkHiveExecutive);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = Route.useSearch();
  const nextPath = search.next;

  // Resolve the correct landing route ONCE per authenticated session, then
  // navigate with `replace` so the dashboard shell isn't forced to reconcile
  // /dashboard ↔ /dashboard/hive-exec after auth state settles.
  useEffect(() => {
    if (loading || !session) return;
    let cancelled = false;
    (async () => {
      // If a same-origin `next` path was preserved (e.g. MCP OAuth consent),
      // honor it and skip the exec-route resolution.
      if (nextPath) {
        if (!cancelled) window.location.replace(nextPath);
        return;
      }
      let target = "/dashboard";
      try {
        const r = await execCheck();
        if (r?.isExecutive) {
          // Persist exec view so the dashboard shell doesn't re-route us.
          try {
            window.localStorage.setItem("portal-view", "hive_exec");
            window.dispatchEvent(new Event("portal-view-change"));
          } catch { /* ignore */ }
          target = "/dashboard/hive-exec";
        }
      } catch { /* fall back to /dashboard */ }
      if (!cancelled) navigate({ to: target, replace: true });
    })();
    return () => { cancelled = true; };
  }, [loading, session, navigate, execCheck, nextPath]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const identifier = String(fd.get("identifier")).trim();
    const password = String(fd.get("password"));
    setBusy(true);

    try {
      if (identifier.includes("@")) {
        // Email path — normal client sign-in (preserves session persistence).
        const { data: signInRes, error } = await supabase.auth.signInWithPassword({
          email: identifier,
          password,
        });
        if (error) { setBusy(false); return toast.error("Invalid username or password"); }
        if (signInRes.user) {
          const { data: prof } = await supabase
            .from("profiles")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select("account_status" as any)
            .eq("id", signInRes.user.id)
            .maybeSingle();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((prof as any)?.account_status === "archived") {
            await supabase.auth.signOut();
            setBusy(false);
            return toast.error("Account suspended. Contact your administrator.");
          }
        }
      } else {
        // Username path — server resolves username + signs in; we never see the email.
        const tokens = await signIn({ data: { identifier, password } });
        const { error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });
        if (error) { setBusy(false); return toast.error("Invalid username or password"); }
      }
    } catch (err) {
      setBusy(false);
      return toast.error((err as Error).message || "Invalid username or password");
    }

    setBusy(false);
    toast.success("Signed in");
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (r.error) toast.error("Google sign-in failed");
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: JAKARTA,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.11)",
    color: "#ffffff",
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={{ background: NAVY_BG, fontFamily: JAKARTA }}
    >
      <HexPattern />

      <div className="relative grid min-h-screen md:grid-cols-2">
        {/* Left panel */}
        <aside className="relative hidden flex-col justify-between p-12 md:flex">
          <BrandLogo />

          <div className="max-w-md space-y-6">
            <NectarPill />
            <h2
              className="text-3xl leading-tight text-white md:text-[2rem]"
              style={{ fontFamily: JAKARTA, fontWeight: 800, letterSpacing: "-0.02em" }}
            >
              "Onboarding a new hire went from two weeks of paperwork to two clicks."
            </h2>
            <p className="text-white/65" style={{ fontFamily: JAKARTA }}>
              — Marcus Liu, HR Lead at Northbay Support Services
            </p>
          </div>

          <p className="text-xs text-white/45" style={{ fontFamily: JAKARTA }}>
            Trusted by modern training teams
          </p>
        </aside>

        {/* Right panel — form */}
        <div className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-6 flex justify-center md:hidden">
              <BrandLogo />
            </div>

            <div
              className="rounded-2xl p-7 shadow-2xl backdrop-blur-xl"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.11)",
              }}
            >
              <div className="mb-7 text-center md:text-left">
                <h1
                  className="text-2xl tracking-tight text-white"
                  style={{ fontFamily: JAKARTA, fontWeight: 800, letterSpacing: "-0.01em" }}
                >
                  Welcome back
                </h1>
                <p className="mt-1.5 text-sm text-white/60" style={{ fontFamily: JAKARTA }}>
                  Sign in to your HIVE dashboard.
                </p>
              </div>

              <form onSubmit={onSubmit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="identifier" className="text-white/80" style={{ fontFamily: JAKARTA }}>
                    Email or username
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
                    className="flex h-12 w-full rounded-lg px-3 py-2 text-base outline-none transition placeholder:text-white/35 focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
                    style={inputStyle}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-white/80" style={{ fontFamily: JAKARTA }}>
                      Password
                    </Label>
                    <Link to="/forgot-password" className="text-xs font-medium text-[#f4a93a] hover:text-[#f7c172] hover:underline">
                      Forgot?
                    </Link>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="flex h-12 w-full rounded-lg px-3 py-2 text-base outline-none transition placeholder:text-white/35 focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
                    style={inputStyle}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={busy}
                  className="group h-11 w-full border-0 text-[#1a1208] shadow-lg shadow-amber-900/20 hover:brightness-105"
                  style={{
                    fontFamily: JAKARTA,
                    fontWeight: 700,
                    backgroundImage: "linear-gradient(135deg, #f4a93a 0%, #f59324 100%)",
                  }}
                >
                  {busy ? "Signing in…" : (
                    <>
                      Sign in
                      <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>

              <div className="relative my-6 text-center text-[11px] uppercase tracking-[0.18em] text-white/40">
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                <span className="relative px-3" style={{ background: "transparent" }}>
                  <span className="rounded bg-[#141a3d] px-2">or</span>
                </span>
              </div>

              <Button
                variant="ghost"
                onClick={google}
                className="h-11 w-full border bg-transparent text-white hover:bg-white/[0.06] hover:text-white"
                style={{
                  fontFamily: JAKARTA,
                  fontWeight: 600,
                  borderColor: "rgba(255,255,255,0.18)",
                }}
              >
                Continue with Google
              </Button>

              <p className="mt-6 text-center text-sm text-white/60" style={{ fontFamily: JAKARTA }}>
                New here?{" "}
                <Link to="/signup" className="font-semibold text-[#f4a93a] hover:text-[#f7c172] hover:underline">
                  Start a free trial
                </Link>
              </p>
            </div>

            <p className="mt-6 text-center text-xs text-white/40" style={{ fontFamily: JAKARTA }}>
              <Link to="/" className="hover:text-white/70 hover:underline">← Back to site</Link> · {pathname}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shared dark auth shell used by forgot-password / reset-password / signup.
 * Matches the new login page visual language.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={{ background: NAVY_BG, fontFamily: JAKARTA }}
    >
      <HexPattern />
      <div className="relative grid min-h-screen md:grid-cols-2">
        <aside className="relative hidden flex-col justify-between p-12 md:flex">
          <BrandLogo />
          <div className="max-w-md space-y-6">
            <NectarPill />
            <h2
              className="text-3xl leading-tight text-white md:text-[2rem]"
              style={{ fontFamily: JAKARTA, fontWeight: 800, letterSpacing: "-0.02em" }}
            >
              "Onboarding a new hire went from two weeks of paperwork to two clicks."
            </h2>
            <p className="text-white/65">— Marcus Liu, HR Lead at Northbay Support Services</p>
          </div>
          <p className="text-xs text-white/45">Trusted by modern training teams</p>
        </aside>

        <div className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-6 flex justify-center md:hidden"><BrandLogo /></div>
            <div
              className="rounded-2xl p-7 shadow-2xl backdrop-blur-xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.11)" }}
            >
              <div className="mb-7 text-center md:text-left">
                <h1
                  className="text-2xl tracking-tight text-white"
                  style={{ fontFamily: JAKARTA, fontWeight: 800, letterSpacing: "-0.01em" }}
                >
                  {title}
                </h1>
                <p className="mt-1.5 text-sm text-white/60">{subtitle}</p>
              </div>
              {children}
            </div>
            <p className="mt-6 text-center text-xs text-white/40">
              <Link to="/" className="hover:text-white/70 hover:underline">← Back to site</Link> · {pathname}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

