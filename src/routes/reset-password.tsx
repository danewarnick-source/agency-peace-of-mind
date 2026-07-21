import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthShell } from "./login";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password — HIVE" }] }),
  component: ResetPassword,
});

type Status = "verifying" | "ready" | "error";

function ResetPassword() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const cleanUrl = () => {
      try {
        window.history.replaceState({}, "", window.location.pathname);
      } catch { /* ignore */ }
    };

    const markReady = () => { if (!cancelled) setStatus("ready"); };
    const markError = (msg: string) => {
      if (cancelled) return;
      setErrorMsg(msg);
      setStatus("error");
    };

    // Listen for the recovery event — Supabase emits PASSWORD_RECOVERY
    // when it processes a recovery link from the URL hash.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        markReady();
      }
    });

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) return markError("This reset link is invalid or has expired.");
          cleanUrl();
          return markReady();
        }

        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hash);
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        const type = hashParams.get("type");

        if (access_token && refresh_token && (type === "recovery" || !type)) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) return markError("This reset link is invalid or has expired.");
          cleanUrl();
          return markReady();
        }

        // Maybe the user already has a recovery session (link processed by another tab/listener).
        const { data } = await supabase.auth.getSession();
        if (data.session) return markReady();

        // Give the onAuthStateChange listener a brief window to fire.
        setTimeout(async () => {
          if (cancelled) return;
          const { data: again } = await supabase.auth.getSession();
          if (again.session) markReady();
          else markError("This reset link is invalid or has expired.");
        }, 1200);
      } catch (e) {
        markError(e instanceof Error ? e.message : "Could not verify reset link.");
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password"));
    const confirm = String(fd.get("confirm"));
    if (password !== confirm) return toast.error("Passwords don't match");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    const { data: u, error } = await supabase.auth.updateUser({ password });
    if (!error && u.user) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", u.user.id);
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  };

  if (status === "verifying") {
    return (
      <AuthShell title="Verifying reset link…" subtitle="Hang tight for a moment.">
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Checking your reset link…
        </div>
      </AuthShell>
    );
  }

  if (status === "error") {
    return (
      <AuthShell title="Link invalid or expired" subtitle="Reset links expire after 1 hour and can only be used once.">
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          {errorMsg || "This reset link is invalid or has expired."}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/forgot-password" className="font-medium text-accent hover:underline">
            Request a new reset link
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password you don't use elsewhere.">
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="password">New password</Label><PasswordInput id="password" name="password" minLength={8} required /></div>
        <div className="grid gap-2"><Label htmlFor="confirm">Confirm password</Label><PasswordInput id="confirm" name="confirm" minLength={8} required /></div>
        <Button type="submit" disabled={busy} className="bg-[image:var(--gradient-brand)] text-primary-foreground">
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
