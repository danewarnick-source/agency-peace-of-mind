import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthShell } from "./login";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import {
  extractInviteToken,
  humanizeInviteError,
  inviteFailureMessage,
  isValidExistingJoinPassword,
  isValidJoinPassword,
  isValidJoinUsername,
  joinHomeForRole,
  joinSetsAuthPassword,
} from "@/lib/join-invite";
import {
  previewInvitation,
  prepareInviteAccount,
  type InvitePreview,
} from "@/lib/join-invite.functions";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [{ title: "Join your provider — Provider Interface" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  validateSearch: (s: Record<string, unknown>): { invite?: string; token?: string } => {
    const invite = typeof s.invite === "string" && s.invite.trim() ? s.invite : undefined;
    const token = typeof s.token === "string" && s.token.trim() ? s.token : undefined;
    return { ...(invite ? { invite } : {}), ...(token ? { token } : {}) };
  },
  component: JoinPage,
});

function JoinPage() {
  const search = Route.useSearch();
  const token = extractInviteToken(search);
  const previewFn = useServerFn(previewInvitation);
  const prepareFn = useServerFn(prepareInviteAccount);

  const [preview, setPreview] = useState<InvitePreview | null>(
    token ? null : { ok: false, reason: "missing", message: inviteFailureMessage("missing") },
  );
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await previewFn({ data: { token } });
        if (!cancelled) setPreview(r);
      } catch (e) {
        if (!cancelled) {
          setPreview({
            ok: false,
            reason: "unknown",
            message: humanizeInviteError(e),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // previewFn is a stable server-fn wrapper; token is the only input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token || !preview || preview.ok !== true) return;
    if (preview.needs_name && !fullName.trim()) {
      return toast.error("Please enter your name.");
    }
    if (!preview.has_username && !isValidJoinUsername(username)) {
      return toast.error(
        "Username must start with a letter and be 3–32 letters, numbers, or underscores.",
      );
    }
    if (joinSetsAuthPassword(preview.account_exists)) {
      if (!isValidJoinPassword(password)) {
        return toast.error("Password must be at least 8 characters and include a number.");
      }
    } else if (!isValidExistingJoinPassword(password)) {
      return toast.error("Enter the password you already use to sign in.");
    }
    if (password !== confirm) return toast.error("Passwords don't match.");

    setBusy(true);
    try {
      const { data: existingSession } = await supabase.auth.getSession();
      const signedInEmail = existingSession.session?.user?.email?.toLowerCase() ?? "";
      if (signedInEmail && signedInEmail !== preview.email.toLowerCase()) {
        await supabase.auth.signOut();
      }

      const prepared = await prepareFn({
        data: {
          token,
          password,
          username: preview.has_username ? undefined : username.trim(),
          full_name: preview.needs_name ? fullName.trim() : undefined,
        },
      });

      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: prepared.email,
        password,
      });
      if (signErr) throw new Error(humanizeInviteError(signErr.message));

      const { error: rpcErr } = await supabase.rpc("accept_invitation", { _token: token });
      if (rpcErr) throw new Error(humanizeInviteError(rpcErr.message));

      toast.success(`You're in — welcome to ${prepared.org_name}.`);
      window.location.replace(joinHomeForRole(prepared.role));
    } catch (err) {
      toast.error(humanizeInviteError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!preview) {
    return (
      <AuthShell title="Checking your invitation…" subtitle="Hang tight for a moment.">
        <div className="flex justify-center py-6" data-testid="join-loading">
          <Loader2 className="h-6 w-6 animate-spin text-white/60" />
        </div>
      </AuthShell>
    );
  }

  if (preview.ok === false) {
    return (
      <AuthShell
        title="This invitation can't be used"
        subtitle="You were not sent to start a new company."
      >
        <div
          className="rounded-lg border border-white/15 bg-white/5 p-4 text-sm text-white/85"
          data-testid="join-error"
        >
          <p>{preview.message}</p>
          <p className="mt-3 text-white/55">
            If you already have a login, you can{" "}
            <Link to="/login" className="font-medium text-[var(--hive-gold)] hover:underline">
              sign in
            </Link>
            . Don't create a new agency from this link.
          </p>
        </div>
      </AuthShell>
    );
  }

  const roleLabel = ROLE_LABEL[preview.role as Role] ?? preview.role;
  const setsNewPassword = joinSetsAuthPassword(preview.account_exists);
  const matchOk = password.length > 0 && password === confirm;
  const lenOk = setsNewPassword
    ? isValidJoinPassword(password)
    : isValidExistingJoinPassword(password);

  return (
    <AuthShell
      title={`Join ${preview.org_name}`}
      subtitle={
        setsNewPassword
          ? `You've been invited as ${roleLabel}. Set how you'll sign in — this is not a new company.`
          : `You've been invited as ${roleLabel}. Use the password you already sign in with — this is not a new company.`
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4" data-testid="join-form">
        <div className="grid gap-2">
          <Label htmlFor="join-email">Email</Label>
          <Input
            id="join-email"
            name="email"
            type="email"
            value={preview.email}
            readOnly
            autoComplete="username"
            className="bg-white/5 text-white"
          />
        </div>
        {preview.needs_name && (
          <div className="grid gap-2">
            <Label htmlFor="join-name">Your name</Label>
            <Input
              id="join-name"
              name="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              className="bg-white/5 text-white"
            />
          </div>
        )}
        {!preview.has_username && (
          <div className="grid gap-2">
            <Label htmlFor="join-username">Username</Label>
            <Input
              id="join-username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="bg-white/5 text-white"
            />
            <p className="text-xs text-white/45">
              Letters, numbers, and underscores. You'll use this or your email to sign in.
            </p>
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="join-password">
            {setsNewPassword ? "Password" : "Password you already use"}
          </Label>
          <PasswordInput
            id="join-password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={setsNewPassword ? "new-password" : "current-password"}
            className="bg-white/5 text-white"
          />
          {setsNewPassword && !lenOk && password.length > 0 && (
            <p className="text-xs text-amber-200/80">At least 8 characters and one number.</p>
          )}
          {!setsNewPassword && (
            <p className="text-xs text-white/45">
              This does not change your password. Use the same one you use on the sign-in page.
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="join-confirm">Confirm password</Label>
          <PasswordInput
            id="join-confirm"
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete={setsNewPassword ? "new-password" : "current-password"}
            className="bg-white/5 text-white"
          />
          {confirm.length > 0 && !matchOk && (
            <p className="text-xs text-amber-200/80">Passwords don't match.</p>
          )}
        </div>
        <Button
          type="submit"
          disabled={busy}
          className="h-11 bg-[linear-gradient(135deg,var(--hive-gold)_0%,var(--hive-gold)_100%)] text-[#141a3d] hover:opacity-95"
        >
          {busy ? "Joining…" : `Join ${preview.org_name}`}
        </Button>
        <p className="text-center text-xs text-white/40">
          Already on this team?{" "}
          <Link to="/login" className="text-[var(--hive-gold)] hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
