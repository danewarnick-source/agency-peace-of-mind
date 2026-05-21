import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Login — CareCompliance" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/dashboard" });
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (r.error) toast.error("Google sign-in failed");
  };

  return <AuthShell title="Welcome back" subtitle="Sign in to your CareCompliance dashboard.">
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
      <div className="grid gap-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required /></div>
      <Button type="submit" disabled={busy} className="bg-[image:var(--gradient-brand)] text-primary-foreground">{busy ? "Signing in…" : "Sign in"}</Button>
    </form>
    <Divider />
    <Button variant="outline" onClick={google} className="w-full">Continue with Google</Button>
    <p className="mt-6 text-center text-sm text-muted-foreground">
      New here? <Link to="/signup" className="font-medium text-accent hover:underline">Start a free trial</Link>
    </p>
  </AuthShell>;
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[image:var(--gradient-hero)] p-12 text-white md:flex">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
            <ShieldCheck className="h-4 w-4" />
          </span>
          CareCompliance
        </Link>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">"We replaced four spreadsheets and a wall calendar. Our last audit took 20 minutes."</h2>
          <p className="mt-4 text-white/70">— Director of Operations, Cascade Support Services</p>
        </div>
        <p className="text-xs text-white/50">DSPD aligned • HIPAA-ready</p>
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
