import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthShell } from "./login";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password — Care Academy" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

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

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password you don't use elsewhere.">
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" minLength={8} required /></div>
        <div className="grid gap-2"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" name="confirm" type="password" minLength={8} required /></div>
        <Button type="submit" disabled={busy} className="bg-[image:var(--gradient-brand)] text-primary-foreground">
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
