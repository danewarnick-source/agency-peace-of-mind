import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hexagon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { lookupEmailByUsername } from "@/lib/login.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — HIVE" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const resolveUsername = useServerFn(lookupEmailByUsername);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const identifier = String(fd.get("identifier")).trim();
    const password = String(fd.get("password"));
    setBusy(true);
    let email = identifier;
    if (!identifier.includes("@")) {
      try {
        const r = await resolveUsername({ data: { username: identifier } });
        if (!r.email) { setBusy(false); return toast.error("No account with that username"); }
        email = r.email;
      } catch (err) {
        setBusy(false);
        return toast.error((err as Error).message);
      }
    }
    const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setBusy(false); return toast.error(error.message); }
    // Block archived accounts immediately
    if (signIn.user) {
      const { data: prof } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("account_status" as any)
        .eq("id", signIn.user.id)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((prof as any)?.account_status === "archived") {
        await supabase.auth.signOut();
        setBusy(false);
        return toast.error("Account suspended. Contact your administrator.");
      }
    }
    setBusy(false);
    toast.success("Signed in");
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (r.error) toast.error("Google sign-in failed");
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your HIVE dashboard.">
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="identifier">Email or username</Label><Input id="identifier" name="identifier" type="text" autoComplete="username" required /></div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-accent hover:underline">Forgot?</Link>
          </div>
          <Input id="password" name="password" type="password" required />
        </div>
        <Button type="submit" disabled={busy} className="bg-[image:var(--gradient-brand)] text-primary-foreground">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <Divider />
      <Button variant="outline" onClick={google} className="w-full">Continue with Google</Button>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here? <Link to="/signup" className="font-medium text-accent hover:underline">Start a free trial</Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[image:var(--gradient-hero)] p-12 text-white md:flex">
        <Link to="/" className="flex items-center gap-2 font-semibold">
            <Hexagon className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span>HIVE <span className="ml-1 text-xs font-normal text-white/60">— powered by NECTAR</span></span>
        </Link>

        </Link>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">"Onboarding a new hire went from two weeks of paperwork to two clicks."</h2>
          <p className="mt-4 text-white/70">— Marcus Liu, HR Lead at Northbay Support Services</p>
        </div>
        <p className="text-xs text-white/50">Trusted by modern training teams</p>
      </aside>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center md:text-left">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
          <p className="mt-8 text-center text-xs text-muted-foreground md:text-left">
            <Link to="/" className="hover:underline">← Back to site</Link> · {pathname}
          </p>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div className="relative my-6 text-center text-xs uppercase tracking-wider text-muted-foreground">
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <span className="relative bg-background px-3">or</span>
    </div>
  );
}
