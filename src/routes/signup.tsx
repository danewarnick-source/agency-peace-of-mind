import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { AuthShell } from "./login";

interface SignupSearch { invite?: string }

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Start free trial — Care Academy" }] }),
  validateSearch: (s: Record<string, unknown>): SignupSearch => ({
    invite: typeof s.invite === "string" ? s.invite : undefined,
  }),
  component: SignupPage,
});

async function acceptInvite(token: string) {
  const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
  if (error) throw error;
  return data as string;
}

function SignupPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { invite } = useSearch({ from: "/signup" });
  const [busy, setBusy] = useState(false);

  // Preview the invitation (if any) so the form locks the email and shows role
  const invitePreview = useQuery({
    enabled: !!invite,
    queryKey: ["invite-preview", invite],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("email, role, status, expires_at, organization_id, organizations(name)")
        .eq("token", invite!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // If already signed in and an invite token is present, accept it.
  useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (invite) {
      acceptInvite(invite)
        .then(() => {
          toast.success("Invitation accepted — welcome to the team!");
          navigate({ to: "/dashboard" });
        })
        .catch((e: Error) => {
          toast.error(e.message);
          navigate({ to: "/dashboard" });
        });
    } else {
      navigate({ to: "/dashboard" });
    }
  }, [loading, session, invite, navigate]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));

    // If invited, force the email to match the invitation
    if (invitePreview.data && email.toLowerCase() !== invitePreview.data.email.toLowerCase()) {
      setBusy(false);
      return toast.error("Email must match your invitation");
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/signup${invite ? `?invite=${invite}` : ""}`,
        data: {
          full_name: String(fd.get("full_name") ?? ""),
          agency_name: String(fd.get("company_name") ?? ""),
        },
      },
    });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }

    // After sign-up, try to log in immediately (auto-confirm may be off)
    const { data: sessionData } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (sessionData.session && invite) {
      try { await acceptInvite(invite); } catch (e) { toast.error((e as Error).message); }
    }
    toast.success("Account created — welcome to Care Academy!");
    navigate({ to: "/dashboard" });
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + (invite ? `/signup?invite=${invite}` : "/dashboard"),
    });
    if (r.error) toast.error("Google sign-in failed");
  };

  const isInvited = !!invitePreview.data && invitePreview.data.status === "pending";
  const orgName = (invitePreview.data?.organizations as { name?: string } | null)?.name;

  return (
    <AuthShell
      title={isInvited ? `Join ${orgName ?? "your team"}` : "Start your free trial"}
      subtitle={isInvited
        ? `You've been invited as ${invitePreview.data!.role}. Create your account to accept.`
        : "14 days free. No credit card required."}
    >
      {invite && invitePreview.data && invitePreview.data.status !== "pending" && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          This invitation is no longer valid ({invitePreview.data.status}).
        </div>
      )}

      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" required />
        </div>
        {!isInvited && (
          <div className="grid gap-2">
            <Label htmlFor="company_name">Company name</Label>
            <Input id="company_name" name="company_name" required />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">{isInvited ? "Invitation email" : "Work email"}</Label>
          <Input
            id="email" name="email" type="email" required
            defaultValue={invitePreview.data?.email ?? ""}
            readOnly={isInvited}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" minLength={8} required />
        </div>
        <Button type="submit" disabled={busy} className="bg-[image:var(--gradient-brand)] text-primary-foreground">
          {busy ? "Creating account…" : isInvited ? "Accept invitation" : "Create account"}
        </Button>
      </form>
      <div className="relative my-6 text-center text-xs uppercase tracking-wider text-muted-foreground">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span className="relative bg-background px-3">or</span>
      </div>
      <Button variant="outline" onClick={google} className="w-full">Continue with Google</Button>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>

      </p>
    </AuthShell>
  );
}
