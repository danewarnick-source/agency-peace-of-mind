import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { completeClientSignOut } from "@/lib/client-sign-out";
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
  JOIN_PASSWORD_HINT,
  JOIN_PASSWORD_TOO_SHORT,
  JOIN_USERNAME_HINT,
  JOIN_USERNAME_INVALID,
  joinConfirmLiveMessage,
  joinHomeForRole,
  joinPasswordLiveMessage,
  joinSetsAuthPassword,
  joinUsernameLiveMessage,
  suggestJoinUsername,
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

const fieldClass =
  "flex h-12 w-full rounded-md border border-[#0a0f1c]/15 bg-white px-3 py-2 text-base text-[#0a0f1c] outline-none placeholder:text-[#0a0f1c]/40 focus:ring-2 focus:ring-[#c4a35a]/35";

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
  const [usernameTouched, setUsernameTouched] = useState(false);
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

  useEffect(() => {
    if (!preview || preview.ok !== true || preview.has_username || usernameTouched) return;
    const suggested = suggestJoinUsername(preview.email);
    if (suggested) setUsername(suggested);
  }, [preview, usernameTouched]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token || !preview || preview.ok !== true) return;
    if (preview.needs_name && !fullName.trim()) {
      return toast.error("Please enter your name.");
    }
    if (!preview.has_username && !isValidJoinUsername(username)) {
      return toast.error(JOIN_USERNAME_INVALID);
    }
    if (
      joinSetsAuthPassword(preview.account_exists, {
        mustChangePassword: preview.must_change_password,
      })
    ) {
      if (!isValidJoinPassword(password)) {
        return toast.error(JOIN_PASSWORD_TOO_SHORT);
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
        await completeClientSignOut(() => supabase.auth.signOut(), { markSignedOut: false });
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
          <Loader2 className="h-6 w-6 animate-spin text-[#0a0f1c]/45" />
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
          className="rounded-lg border border-[#0a0f1c]/15 bg-white p-4 text-sm text-[#0a0f1c]"
          data-testid="join-error"
        >
          <p>{preview.message}</p>
          <p className="mt-3 text-[#0a0f1c]/55">
            If you already have a login, you can{" "}
            <Link to="/login" className="font-medium text-[#8a6d32] hover:underline">
              sign in
            </Link>
            . Don't create a new agency from this link.
          </p>
        </div>
      </AuthShell>
    );
  }

  const roleLabel = ROLE_LABEL[preview.role as Role] ?? preview.role;
  const setsNewPassword = joinSetsAuthPassword(preview.account_exists, {
    mustChangePassword: preview.must_change_password,
  });
  const suggestedUsername = preview.has_username ? "" : suggestJoinUsername(preview.email);
  const usernameLive = joinUsernameLiveMessage(username);
  const passwordLive = setsNewPassword
    ? joinPasswordLiveMessage(password)
    : password.length > 0
      ? { ok: true, text: "Ready to check this password against your existing sign-in." }
      : null;
  const confirmLive = joinConfirmLiveMessage(password, confirm);
  const usernameOk = preview.has_username || isValidJoinUsername(username);
  const passwordOk = setsNewPassword
    ? isValidJoinPassword(password)
    : isValidExistingJoinPassword(password);
  const matchOk = password.length > 0 && password === confirm;
  const nameOk = !preview.needs_name || !!fullName.trim();
  const canJoin = nameOk && usernameOk && passwordOk && matchOk && !busy;

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
          <Label htmlFor="join-email" className="text-[#0a0f1c]">
            Email
          </Label>
          <input
            id="join-email"
            name="email"
            type="email"
            value={preview.email}
            readOnly
            autoComplete="email"
            className={`${fieldClass} bg-[#0a0f1c]/[0.04]`}
          />
        </div>
        {preview.needs_name && (
          <div className="grid gap-2">
            <Label htmlFor="join-name" className="text-[#0a0f1c]">
              Your name
            </Label>
            <input
              id="join-name"
              name="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              className={fieldClass}
            />
          </div>
        )}
        {!preview.has_username && (
          <div className="grid gap-2">
            <Label htmlFor="join-username" className="text-[#0a0f1c]">
              Username
            </Label>
            <input
              id="join-username"
              name="username"
              value={username}
              onChange={(e) => {
                setUsernameTouched(true);
                setUsername(e.target.value);
              }}
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={fieldClass}
              aria-describedby="join-username-hint join-username-live"
            />
            <p id="join-username-hint" className="text-xs text-[#0a0f1c]/55" data-testid="join-username-hint">
              {JOIN_USERNAME_HINT}
            </p>
            {suggestedUsername && suggestedUsername !== username.trim().toLowerCase() && (
              <button
                type="button"
                data-testid="join-username-suggest"
                onClick={() => {
                  setUsernameTouched(true);
                  setUsername(suggestedUsername);
                }}
                className="text-left text-xs font-medium text-[#8a6d32] hover:text-[#0a0f1c] hover:underline"
              >
                Use email as username: {suggestedUsername}
              </button>
            )}
            <LiveLine id="join-username-live" testId="join-username-live" status={usernameLive} />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="join-password" className="text-[#0a0f1c]">
            {setsNewPassword ? "Password" : "Password you already use"}
          </Label>
          <PasswordInput
            id="join-password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={setsNewPassword ? 8 : undefined}
            autoComplete={setsNewPassword ? "new-password" : "current-password"}
            className={fieldClass}
            aria-describedby="join-password-hint join-password-live"
          />
          {setsNewPassword ? (
            <p id="join-password-hint" className="text-xs text-[#0a0f1c]/55" data-testid="join-password-hint">
              {JOIN_PASSWORD_HINT}
            </p>
          ) : (
            <p id="join-password-hint" className="text-xs text-[#0a0f1c]/55" data-testid="join-password-hint">
              This does not change your password. Use the same one you use on the sign-in page.
            </p>
          )}
          {setsNewPassword && (
            <ul className="grid gap-1" data-testid="join-password-rules" aria-label="Password requirements">
              <JoinRule ok={isValidJoinPassword(password)} idle={password.length === 0}>
                At least 8 characters
              </JoinRule>
            </ul>
          )}
          <LiveLine id="join-password-live" testId="join-password-live" status={passwordLive} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="join-confirm" className="text-[#0a0f1c]">
            Confirm password
          </Label>
          <PasswordInput
            id="join-confirm"
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete={setsNewPassword ? "new-password" : "current-password"}
            className={fieldClass}
            aria-describedby="join-confirm-live"
          />
          <p className="text-xs text-[#0a0f1c]/55" data-testid="join-confirm-hint">
            Re-enter the same password so we can check they match.
          </p>
          <LiveLine id="join-confirm-live" testId="join-confirm-live" status={confirmLive} />
        </div>
        <Button
          type="submit"
          disabled={!canJoin}
          className="h-11 bg-[linear-gradient(135deg,var(--hive-gold)_0%,var(--hive-gold)_100%)] text-[#141a3d] hover:opacity-95 disabled:opacity-50"
        >
          {busy ? "Joining…" : `Join ${preview.org_name}`}
        </Button>
        <p className="text-center text-xs text-[#0a0f1c]/45">
          Already on this team?{" "}
          <Link to="/login" className="text-[#8a6d32] hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

function LiveLine({
  id,
  testId,
  status,
}: {
  id: string;
  testId: string;
  status: { ok: boolean; text: string } | null;
}) {
  if (!status) return <div id={id} data-testid={testId} className="sr-only" />;
  return (
    <div
      id={id}
      data-testid={testId}
      role="status"
      aria-live="polite"
      className={`text-xs font-medium ${status.ok ? "text-[#1e3a30]" : "text-[#8a3228]"}`}
    >
      {status.text}
    </div>
  );
}

function JoinRule({
  ok,
  idle,
  children,
}: {
  ok: boolean;
  idle: boolean;
  children: ReactNode;
}) {
  const color = idle ? "#3a4553" : ok ? "#1e3a30" : "#8a3228";
  return (
    <li className="flex items-center gap-2 text-xs" style={{ color }}>
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
        style={{ background: ok && !idle ? "rgba(127, 209, 168, 0.28)" : "rgba(10, 15, 28, 0.08)" }}
      >
        {ok && !idle ? <Check className="h-3 w-3" /> : "•"}
      </span>
      {children}
    </li>
  );
}
