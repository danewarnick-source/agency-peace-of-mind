import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { passwordResetRedirectUrl } from "@/lib/auth-redirect";
import { toast } from "sonner";
import { AuthShell } from "./login";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — Provider Interface" }] }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(String(fd.get("email")), {
      redirectTo: passwordResetRedirectUrl(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent(true);
    toast.success("Check your email for the reset link.");
  };

  return (
    <AuthShell title="Reset your password" subtitle="We'll send you a secure link to set a new password.">
      {sent ? (
        <div className="rounded-lg border border-[#0a0f1c]/12 bg-white p-4 text-sm text-[#0a0f1c]">
          We've sent a password reset link to your email. It will expire in 1 hour.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
          <button type="submit" disabled={busy} className="pi-home-btn gold" style={{ width: "100%" }}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-[#0a0f1c]/60">
        Remembered it? <Link to="/login" className="font-medium text-[#0a0f1c] hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
