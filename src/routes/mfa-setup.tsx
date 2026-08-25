/**
 * MFA enrollment / verification for admin, manager, and super_admin roles.
 * Uses Supabase Auth TOTP (authenticator apps).
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";

export const Route = createFileRoute("/mfa-setup")({
  component: MfaSetupPage,
});

type Factor = { id: string; status: string; factor_type: string };

function MfaSetupPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [mode, setMode] = useState<"enroll" | "verify">("enroll");

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        void navigate({ to: "/login" });
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: list } = await supabase.auth.mfa.listFactors();
      const totp = (list?.totp ?? []) as Factor[];
      setFactors(totp);
      const verified = totp.filter((f) => f.status === "verified");
      if (aal?.currentLevel === "aal2") {
        void navigate({ to: "/dashboard" });
        return;
      }
      if (verified.length > 0) {
        setMode("verify");
        setFactorId(verified[0].id);
        const { data: ch, error } = await supabase.auth.mfa.challenge({ factorId: verified[0].id });
        if (error) toast.error(error.message);
        else setChallengeId(ch.id);
      } else {
        setMode("enroll");
      }
      setBusy(false);
    })();
  }, [navigate]);

  async function startEnroll() {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "HIVE authenticator",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: data.id });
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
      return;
    }
    toast.success("Two-factor authentication enabled.");
    void navigate({ to: "/dashboard" });
  }

  if (busy && !qr && mode === "enroll" && factors.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {mode === "verify" ? "Confirm two-factor code" : "Set up two-factor authentication"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Admin and manager accounts require an authenticator app (TOTP) before accessing PHI.
            </p>
          </div>
        </div>

        {mode === "enroll" && !qr && (
          <Button onClick={() => void startEnroll()} disabled={busy} className="w-full min-h-[44px]">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Start setup
          </Button>
        )}

        {qr && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with Google Authenticator, 1Password, or Authy, then enter the 6-digit code.
            </p>
            <div className="flex justify-center rounded-lg border border-border bg-white p-3">
              {qr.startsWith("<svg") || qr.includes("<svg") ? (
                // eslint-disable-next-line react/no-danger
                <div dangerouslySetInnerHTML={{ __html: qr }} />
              ) : (
                <img src={qr} alt="Authenticator QR code" className="h-48 w-48" />
              )}
            </div>
          </div>
        )}

        {(qr || mode === "verify") && (
          <div className="space-y-3">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-lg tracking-widest"
            />
            <Button onClick={() => void confirm()} disabled={busy} className="w-full min-h-[44px]">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify and continue
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
