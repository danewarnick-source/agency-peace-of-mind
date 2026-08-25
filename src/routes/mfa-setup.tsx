/**
 * MFA enrollment / verification for every signed-in user. Anyone who can
 * open HIVE can see PHI. Uses Supabase Auth TOTP (authenticator apps).
 * SMS is not offered.
 *
 * Login flow:
 *  - First time: enroll (scan QR) once, then enter the 6-digit code.
 *  - Every later login: password → enter 6-digit code only (verify). Never re-enroll.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { ShieldCheck, Loader2, Copy, ChevronDown, LogOut } from "lucide-react";

export const Route = createFileRoute("/mfa-setup")({
  head: () => ({ meta: [{ title: "Two-factor setup — HIVE" }] }),
  component: MfaSetupPage,
});

type Factor = {
  id: string;
  status: string;
  factor_type: string;
  friendly_name?: string;
};

const FRIENDLY_NAME = "HIVE authenticator";

/** Supabase returns a data: URI, a raw SVG, or (rarely) a PNG URL. */
export function QrCodeVisual({ qr }: { qr: string }) {
  const value = qr.trim();
  if (value.startsWith("data:") || /^https?:\/\//i.test(value)) {
    return <img src={value} alt="Authenticator QR code" className="h-48 w-48" />;
  }
  if (value.startsWith("<svg") || value.includes("<svg")) {
    return (
      <div
        className="h-48 w-48 [&_svg]:h-full [&_svg]:w-full"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }
  return <img src={value} alt="Authenticator QR code" className="h-48 w-48" />;
}

/** Unverified leftovers live in `all`; verified TOTP also appears in `totp`. */
function collectTotpFactors(list: {
  totp?: Factor[];
  all?: Factor[];
} | null): { verified: Factor[]; unverified: Factor[] } {
  const byId = new Map<string, Factor>();
  for (const f of list?.all ?? []) {
    if (f.factor_type === "totp") byId.set(f.id, f);
  }
  for (const f of list?.totp ?? []) {
    byId.set(f.id, f);
  }
  const all = [...byId.values()];
  return {
    verified: all.filter((f) => f.status === "verified"),
    unverified: all.filter((f) => f.status !== "verified"),
  };
}

async function unenrollFactors(factors: Factor[]) {
  for (const f of factors) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
}

function MfaSetupPage() {
  const navigate = useNavigate();
  const codeRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [mode, setMode] = useState<"enroll" | "verify">("enroll");

  useEffect(() => {
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        void navigate({ to: "/login" });
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        void navigate({ to: "/dashboard" });
        return;
      }

      const { data: list } = await supabase.auth.mfa.listFactors();
      const { verified, unverified } = collectTotpFactors(list);

      // Incomplete prior setup leaves unverified factors that block re-enroll
      // ("friendly name already exists"). Clear them before showing Start setup.
      if (verified.length === 0 && unverified.length > 0) {
        await unenrollFactors(unverified);
      }

      if (verified.length > 0) {
        // Already enrolled — each login only needs the 6-digit code.
        setMode("verify");
        setFactorId(verified[0].id);
        const { data: ch, error } = await supabase.auth.mfa.challenge({
          factorId: verified[0].id,
        });
        if (error) toast.error(error.message);
        else setChallengeId(ch.id);
      } else {
        setMode("enroll");
      }
      setBusy(false);
    })();
  }, [navigate]);

  useEffect(() => {
    if (qr || mode === "verify") codeRef.current?.focus();
  }, [qr, mode]);

  async function startEnroll() {
    setBusy(true);
    const { data: list } = await supabase.auth.mfa.listFactors();
    const { verified, unverified } = collectTotpFactors(list);

    // If they somehow already finished enroll, switch to verify instead of
    // creating a second factor with the same friendly name.
    if (verified.length > 0) {
      setMode("verify");
      setQr(null);
      setSecret(null);
      setFactorId(verified[0].id);
      const { data: ch, error } = await supabase.auth.mfa.challenge({
        factorId: verified[0].id,
      });
      setBusy(false);
      if (error) toast.error(error.message);
      else setChallengeId(ch.id);
      return;
    }

    await unenrollFactors(unverified);

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: FRIENDLY_NAME,
    });
    if (error) {
      // Last resort: name conflict from a factor we couldn't list — try a unique name.
      const { data: retry, error: retryErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `${FRIENDLY_NAME} ${Date.now()}`,
      });
      if (retryErr || !retry) {
        setBusy(false);
        toast.error(error.message);
        return;
      }
      setFactorId(retry.id);
      setQr(retry.totp.qr_code);
      setSecret(retry.totp.secret);
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: retry.id,
      });
      setBusy(false);
      if (chErr) toast.error(chErr.message);
      else setChallengeId(ch.id);
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: data.id });
    setBusy(false);
    if (chErr) toast.error(chErr.message);
    else setChallengeId(ch.id);
  }

  async function confirm() {
    if (!factorId || !challengeId || code.trim().length < 6) {
      toast.error("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: code.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      setCode("");
      // Refresh challenge so the next code attempt is valid.
      const { data: ch } = await supabase.auth.mfa.challenge({ factorId });
      if (ch) setChallengeId(ch.id);
      codeRef.current?.focus();
      return;
    }
    toast.success(
      mode === "verify" ? "Signed in." : "Two-factor authentication enabled.",
    );
    void navigate({ to: "/dashboard" });
  }

  async function signOut() {
    await supabase.auth.signOut();
    void navigate({ to: "/login" });
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toast.success("Secret copied.");
    } catch {
      toast.error("Could not copy. Type the key into your app instead.");
    }
  }

  if (busy && !qr && mode === "enroll") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const enrolling = mode === "enroll" && !qr;
  const enteringCode = Boolean(qr) || mode === "verify";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {mode === "verify" ? "Enter your two-factor code" : "Set up two-factor authentication"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "verify"
                ? "Open your authenticator app and type the 6-digit code. You do this each time you sign in."
                : "One-time setup: scan a QR with Google Authenticator, 1Password, or Authy. After that you only enter a code at login."}
            </p>
          </div>
        </div>

        {enrolling && (
          <ol className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <li>
              <span className="font-medium text-foreground">1.</span>{" "}
              <span className="text-muted-foreground">
                Open Google Authenticator, 1Password, or Authy on your phone.
              </span>
            </li>
            <li>
              <span className="font-medium text-foreground">2.</span>{" "}
              <span className="text-muted-foreground">Scan the QR code we show next.</span>
            </li>
            <li>
              <span className="font-medium text-foreground">3.</span>{" "}
              <span className="text-muted-foreground">Type the 6-digit code here.</span>
            </li>
          </ol>
        )}

        {enrolling && (
          <Button onClick={() => void startEnroll()} disabled={busy} className="w-full min-h-[44px]">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue — show QR code
          </Button>
        )}

        {qr && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Scan this code with your authenticator app</p>
            <div className="flex justify-center rounded-lg border border-border bg-white p-3">
              <QrCodeVisual qr={qr} />
            </div>
            {secret && (
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
                  Can&apos;t scan? Enter a key instead
                  <ChevronDown className="h-3.5 w-3.5" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
                    <code className="min-w-0 flex-1 break-all font-mono text-xs">{secret}</code>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void copySecret()}>
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        {enteringCode && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            <label htmlFor="mfa-code" className="text-sm font-medium">
              {mode === "verify" ? "Code from your authenticator app" : "Then enter the 6-digit code"}
            </label>
            <Input
              ref={codeRef}
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-lg tracking-[0.4em]"
            />
            <Button
              type="submit"
              disabled={busy || code.length < 6}
              className="w-full min-h-[44px]"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {mode === "verify" ? "Continue" : "Verify and continue"}
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out and use a different account
        </button>
      </div>
    </div>
  );
}
