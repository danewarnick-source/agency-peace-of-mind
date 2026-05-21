import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { AuthShell } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Start free trial — Care Academy" }] }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: String(fd.get("full_name")),
          agency_name: String(fd.get("company_name")),
        },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — welcome to Care Academy!");
    navigate({ to: "/dashboard" });
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (r.error) toast.error("Google sign-in failed");
  };

  return (
    <AuthShell title="Start your free trial" subtitle="14 days free. No credit card required.">
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="full_name">Full name</Label><Input id="full_name" name="full_name" required /></div>
        <div className="grid gap-2"><Label htmlFor="company_name">Company name</Label><Input id="company_name" name="company_name" required /></div>
        <div className="grid gap-2"><Label htmlFor="email">Work email</Label><Input id="email" name="email" type="email" required /></div>
        <div className="grid gap-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" minLength={8} required /></div>
        <Button type="submit" disabled={busy} className="bg-[image:var(--gradient-brand)] text-primary-foreground">
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <div className="relative my-6 text-center text-xs uppercase tracking-wider text-muted-foreground">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span className="relative bg-background px-3">or</span>
      </div>
      <Button variant="outline" onClick={google} className="w-full">Continue with Google</Button>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account? <Link to="/login" className="font-medium text-accent hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
