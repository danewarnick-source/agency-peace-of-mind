import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { PiWordmark } from "@/components/pi-landing/pi-mark";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { authRedirectUrl } from "@/lib/auth-redirect";
import { checkEmailExists, checkPasswordPwnedRange } from "@/lib/signup-checks.functions";
import { ensureSignupWorkspace } from "@/lib/signup-workspace.functions";
import {
  SIGNUP_CONFIRM_EMAIL_MESSAGE,
  messageForSignupWorkspaceReason,
  signupHasSession,
} from "@/lib/signup-workspace";
import {
  AUTH_PWNED_PASSWORD_MESSAGE,
  hibpRangeIncludesSha1,
  hibpSha1Prefix,
  isAuthPwnedPasswordMessage,
  sha1HexUpper,
  weakPasswordCopyFromAuth,
} from "@/lib/signup-password";
import { setBillingSmsPhoneAtSignup } from "@/lib/billing-sms.functions";
import { isValidUSPhone, normalizeUSPhoneToE164 } from "@/lib/us-phone";
import {
  createSubscriptionCheckoutFn,
  getSignupPaymentsStatusFn,
} from "@/lib/stripe-checkout.functions";
import { formatUsdFromCents, type BillingInterval } from "@/lib/hive-pricing";
import { PI_LIST_MINIMUM_LINE, PI_LIST_PRICE_DISPLAY, PI_LIST_PRICE_UNIT, PI_SIGNUP_PRICE_LINE } from "@/lib/pi-landing";
import {
  SIGNUP_AGENCY_PLACEHOLDER,
  SIGNUP_TRAINING_ADDONS,
  quotePiListSubscription,
  quoteSignupTrainingAddon,
  type SignupTrainingAddonId,
} from "@/lib/pi-signup-pricing";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Get started — Provider Interface" },
      { name: "description", content: "Create your Provider Interface account and start running your agency from one place." },
    ],
  }),
  component: SignupPage,
});

/* ──────────────────────────── design tokens ──────────────────────────── */

const JAKARTA = '"Inter", ui-sans-serif, system-ui, sans-serif';
const NAVY_BG = "#0b1220";
const AMBER = "#f3efe6";
const AMBER_GRAD = "#f3efe6";

const inputStyle: React.CSSProperties = {
  background: "var(--hive-surface)",
  border: "1px solid var(--hive-border)",
  color: "var(--hive-text)",
  fontFamily: JAKARTA,
};

const STEPS = [
  "Account",
  "Your business",
  "Plan",
  "Training",
  "Payment",
] as const;

/* ──────────────────────────── form state ──────────────────────────── */

interface FormState {
  email: string;
  password: string;
  confirm: string;
  agencyName: string;
  contactName: string;
  phone: string;
  providerNumber: string;
  staffCount: number;
  clientCount: number;
  interval: BillingInterval;
  trainingAddon: SignupTrainingAddonId | "none";
}

const initialForm: FormState = {
  email: "",
  password: "",
  confirm: "",
  agencyName: "",
  contactName: "",
  phone: "",
  providerNumber: "",
  staffCount: 8,
  clientCount: 12,
  interval: "monthly",
  trainingAddon: "none",
};

/* ──────────────────────────── shell ──────────────────────────── */

function Brand() {
  return <PiWordmark to="/" />;
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between text-xs text-[var(--hive-text-muted)]" style={{ fontFamily: JAKARTA }}>
        <span>
          Step <span className="font-semibold text-[var(--hive-text)]">{step + 1}</span> of {STEPS.length}
        </span>
        <span className="font-medium text-[var(--hive-text)]">{STEPS[step]}</span>
      </div>
      <div className="flex gap-1.5">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-colors"
            style={{ background: i <= step ? AMBER : "var(--hive-border)" }}
          />
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[var(--hive-text)]" style={{ fontFamily: JAKARTA }}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--hive-danger)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--hive-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
  loading,
  showBack = true,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
  showBack?: boolean;
}) {
  return (
    <div className="mt-7 flex items-center justify-between gap-3">
      {showBack && onBack ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={loading}
          className="h-11"
          style={{ fontFamily: JAKARTA }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || loading}
        className="group h-11 min-w-[160px] border-0 bg-[#0b1220] text-[#f3efe6] hover:bg-[#111827]"
        style={{ fontFamily: JAKARTA, fontWeight: 700 }}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {nextLabel}
            <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </Button>
    </div>
  );
}

/* ──────────────────────────── main component ──────────────────────────── */

function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialForm);
  const checkEmail = useServerFn(checkEmailExists);
  const checkPwnedRange = useServerFn(checkPasswordPwnedRange);
  const ensureWorkspace = useServerFn(ensureSignupWorkspace);

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any).auth.getSession();
      if (signupHasSession(data.session)) setStep(1);
    })();
  }, []);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="relative min-h-screen overflow-hidden text-[#f3efe6]" style={{ background: NAVY_BG, fontFamily: JAKARTA }}>
      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col px-5 py-8 md:py-12">
        <header className="mb-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Brand />
          <Link to="/login" className="text-sm text-[#f3efe6]/60 hover:text-[#f3efe6]">
            Already have an account? <span className="font-medium text-[#f3efe6]">Sign in</span>
          </Link>
        </header>

        <main className="mx-auto w-full max-w-2xl flex-1">
          <Stepper step={step} />
          <div
            className="rounded-2xl border border-white/[0.10] bg-[#f3efe6] p-6 text-[#0b1220] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.55)] sm:p-8"
            data-testid="signup-new-agency"
          >
            {step === 0 && (
              <Step1Account
                form={form}
                update={update}
                checkEmail={checkEmail}
                checkPwnedRange={checkPwnedRange}
                onNext={() => setStep(1)}
              />
            )}
            {step === 1 && (
              <Step3Business
                form={form}
                update={update}
                ensureWorkspace={ensureWorkspace}
                onBack={goBack}
                onNext={() => setStep(2)}
              />
            )}
            {step === 2 && (
              <Step4Pricing form={form} update={update} onBack={goBack} onNext={() => setStep(3)} />
            )}
            {step === 3 && (
              <Step5Training form={form} update={update} onBack={goBack} onNext={() => setStep(4)} />
            )}
            {step === 4 && (
              <Step6Payment
                form={form}
                onBack={goBack}
                onComplete={async () => {
                  await navigate({ to: "/dashboard", search: { welcome: "1" } as never }).catch(() => navigate({ to: "/dashboard" }));
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ──────────────────────────── STEP 1 ──────────────────────────── */

function Step1Account({
  form,
  update,
  checkEmail,
  checkPwnedRange,
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  checkEmail: (input: { data: { email: string } }) => Promise<{ exists: boolean }>;
  checkPwnedRange: (input: { data: { sha1Prefix: string } }) => Promise<{ range: string }>;
  onNext: () => void;
}) {
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [confirmEmailMsg, setConfirmEmailMsg] = useState<string | null>(null);
  const [passwordWeakErr, setPasswordWeakErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const weakCheckGen = useRef(0);

  const lenOk = form.password.length >= 8;
  const numOk = /\d/.test(form.password);
  const matchOk = form.password.length > 0 && form.password === form.confirm;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  const verifyPasswordPwned = useCallback(async (password: string): Promise<boolean> => {
    const gen = ++weakCheckGen.current;
    if (password.length < 8) {
      setPasswordWeakErr(null);
      return false;
    }
    try {
      const sha1 = await sha1HexUpper(password);
      const { range } = await checkPwnedRange({ data: { sha1Prefix: hibpSha1Prefix(sha1) } });
      if (gen !== weakCheckGen.current) return false;
      const pwned = hibpRangeIncludesSha1(range, sha1);
      setPasswordWeakErr(pwned ? AUTH_PWNED_PASSWORD_MESSAGE : null);
      return pwned;
    } catch {
      if (gen !== weakCheckGen.current) return false;
      // fail-open — Auth still rejects on submit
      return false;
    }
  }, [checkPwnedRange]);

  useEffect(() => {
    if (form.password.length < 8) {
      setPasswordWeakErr(null);
      return;
    }
    const t = window.setTimeout(() => {
      void verifyPasswordPwned(form.password);
    }, 400);
    return () => window.clearTimeout(t);
  }, [form.password, verifyPasswordPwned]);

  const verifyEmail = async () => {
    if (!emailValid) return;
    setChecking(true);
    setEmailErr(null);
    try {
      const r = await checkEmail({ data: { email: form.email } });
      if (r.exists) {
        setEmailErr("An account with this email already exists. Sign in instead?");
      }
    } catch {
      // soft-fail; we'll re-check on submit
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    setEmailErr(null);
    if (!emailValid) return setEmailErr("Please enter a valid email address.");
    if (!lenOk || !numOk) return toast.error("Password must be at least 8 characters and include a number.");
    if (!matchOk) return toast.error("Passwords don't match.");
    if (await verifyPasswordPwned(form.password)) return;
    setBusy(true);
    try {
      const r = await checkEmail({ data: { email: form.email } });
      if (r.exists) {
        setEmailErr("An account with this email already exists. Sign in instead?");
        setBusy(false);
        return;
      }
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: authRedirectUrl("/signup"),
          data: {
            full_name: form.contactName || form.email.split("@")[0],
            agency_name: form.agencyName || `${form.email.split("@")[0]}'s workspace`,
          },
        },
      });
      if (error) {
        if (/already/i.test(error.message)) {
          setEmailErr("An account with this email already exists. Sign in instead?");
        } else if (isAuthPwnedPasswordMessage(error.message)) {
          setPasswordWeakErr(weakPasswordCopyFromAuth(error.message));
        } else {
          toast.error(error.message);
        }
        setBusy(false);
        return;
      }
      if (!signupHasSession(signUpData.session)) {
        setConfirmEmailMsg(SIGNUP_CONFIRM_EMAIL_MESSAGE);
        setBusy(false);
        return;
      }
      toast.success("Account created — let's set up your business.");
      setBusy(false);
      onNext();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <Header title="Create your account" subtitle="Start with a few quick details to get your workspace ready." />
      {confirmEmailMsg ? (
        <div
          role="alert"
          data-testid="signup-confirm-email"
          className="mb-4 rounded-md border border-[var(--hive-danger)]/50 bg-[var(--hive-danger-soft)] px-3 py-2 text-sm font-medium text-[var(--hive-danger-fg)]"
        >
          {confirmEmailMsg}
        </div>
      ) : null}
      <div className="grid gap-4">
        <Field
          label="Email address"
          error={
            emailErr ? (
              <>
                {emailErr}{" "}
                <Link to="/login" className="font-medium text-[var(--hive-gold)] hover:underline">
                  Sign in →
                </Link>
              </>
            ) : null
          }
        >
          <input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => {
              setEmailErr(null);
              update("email", e.target.value);
            }}
            onBlur={verifyEmail}
            className="flex h-12 w-full rounded-lg px-3 py-2 text-base outline-none focus:border-[var(--hive-gold)]/60 focus:ring-2 focus:ring-[var(--hive-gold)]/40"
            style={inputStyle}
            placeholder="you+agency@gmail.com"
            data-testid="signup-email"
          />
          {checking && <span className="text-xs text-[var(--hive-text-muted)]">Checking…</span>}
        </Field>

        <Field label="Password">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              onBlur={() => {
                void verifyPasswordPwned(form.password);
              }}
              aria-invalid={passwordWeakErr ? true : undefined}
              aria-describedby={passwordWeakErr ? "signup-password-weak" : undefined}
              data-testid="signup-password"
              className="flex h-12 w-full rounded-lg px-3 py-2 pr-10 text-base outline-none focus:border-[var(--hive-gold)]/60 focus:ring-2 focus:ring-[var(--hive-gold)]/40"
              style={inputStyle}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--hive-text-muted)] hover:text-[var(--hive-text)]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {passwordWeakErr ? (
            <div
              id="signup-password-weak"
              role="alert"
              data-testid="signup-password-weak"
              className="rounded-md border border-[var(--hive-danger)]/50 bg-[var(--hive-danger-soft)] px-3 py-2 text-xs font-medium text-[var(--hive-danger-fg)]"
            >
              {passwordWeakErr}
            </div>
          ) : null}
        </Field>

        <ul className="-mt-1 grid gap-1 text-xs">
          <PwRule ok={lenOk}>At least 8 characters</PwRule>
          <PwRule ok={numOk}>At least one number</PwRule>
        </ul>

        <Field label="Confirm password" error={!matchOk && form.confirm ? "Passwords don't match." : null}>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => update("confirm", e.target.value)}
              data-testid="signup-confirm"
              className="flex h-12 w-full rounded-lg px-3 py-2 pr-10 text-base outline-none focus:border-[var(--hive-gold)]/60 focus:ring-2 focus:ring-[var(--hive-gold)]/40"
              style={inputStyle}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--hive-text-muted)] hover:text-[var(--hive-text)]"
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
      </div>

      <NavButtons
        showBack={false}
        onNext={submit}
        loading={busy}
        nextDisabled={!emailValid || !lenOk || !numOk || !matchOk || !!emailErr || !!passwordWeakErr}
        nextLabel="Create account"
      />
    </>
  );
}

function PwRule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2" style={{ color: ok ? "#86efac" : "rgba(255,255,255,0.5)" }}>
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
        style={{ background: ok ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.08)" }}
      >
        {ok ? <Check className="h-3 w-3" /> : "•"}
      </span>
      {children}
    </li>
  );
}

/* ──────────────────────────── STEP 3 ──────────────────────────── */

function Step3Business({
  form,
  update,
  ensureWorkspace,
  onBack,
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  ensureWorkspace: (input: { data: { agencyName?: string } }) => Promise<{
    ok: boolean;
    orgId: string | null;
    reason: "no_session" | "org_query_error" | "trigger_blocked" | "provision_failed" | null;
  }>;
  onBack: () => void;
  onNext: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const setSmsPhoneFn = useServerFn(setBillingSmsPhoneAtSignup);
  const phoneOk = isValidUSPhone(form.phone);
  const canContinue =
    !!form.agencyName.trim() && !!form.contactName.trim() && phoneOk;
  const showPhoneError = form.phone.trim().length > 0 && !phoneOk;

  const save = async () => {
    if (!phoneOk) {
      toast.error("Enter a valid US mobile number to continue.");
      return;
    }
    setBusy(true);
    try {
      const { data: sessionResp } = await (supabase as any).auth.getSession();
      if (!signupHasSession(sessionResp?.session)) {
        toast.error(SIGNUP_CONFIRM_EMAIL_MESSAGE);
        setBusy(false);
        return;
      }

      const { data: userResp } = await (supabase as any).auth.getUser();
      const uid = userResp.user?.id;
      if (!uid) {
        toast.error(SIGNUP_CONFIRM_EMAIL_MESSAGE);
        setBusy(false);
        return;
      }

      // Best-effort profile update — don't block on failure.
      try {
        await (supabase as any).from("profiles").update({
          full_name: form.contactName,
          agency_name: form.agencyName,
        }).eq("id", uid);
      } catch {
        /* non-blocking */
      }

      const ensured = await ensureWorkspace({ data: { agencyName: form.agencyName.trim() } });
      if (!ensured?.ok || !ensured.orgId) {
        toast.error(messageForSignupWorkspaceReason(ensured?.reason));
        setBusy(false);
        return;
      }
      const orgId = ensured.orgId;

      const isTrainingOnly =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("flow") === "training";

      const { error: orgErr } = await (supabase as any)
        .from("organizations")
        .update({
          name: form.agencyName,
          state_code: "UT",
          dhhs_provider_id: form.providerNumber || null,
          account_contact_name: form.contactName || null,
          account_contact_email: userResp.user?.email ?? null,
          training_only: isTrainingOnly,
        })
        .eq("id", orgId);
      if (orgErr) {
        toast.error("Couldn't save your business details — please try again.");
        setBusy(false);
        return;
      }

      try {
        await setSmsPhoneFn({ data: { organizationId: orgId, phone: form.phone } });
      } catch (e) {
        console.warn("[signup] sms phone save failed", e);
        toast.error("Could not save your mobile number. Please try again.");
        setBusy(false);
        return;
      }
    } catch (e) {
      console.warn("[signup] business save failed", e);
      toast.error("Couldn't save your business details — please try again.");
      setBusy(false);
      return;
    }
    setBusy(false);
    onNext();
  };

  return (
    <>
      <Header title="Tell us about your business" subtitle="This becomes your workspace name across Provider Interface." />
      <div className="grid gap-4">
        <Field label="Agency or company name">
          <TextInput
            value={form.agencyName}
            onChange={(v) => update("agencyName", v)}
            placeholder={SIGNUP_AGENCY_PLACEHOLDER}
            testId="signup-agency-name"
          />
        </Field>
        <Field label="Primary contact (full name)">
          <TextInput value={form.contactName} onChange={(v) => update("contactName", v)} placeholder="Jane Doe" />
        </Field>
        <Field
          label="Mobile number"
          hint="Required — we use this to reach you about urgent billing issues and account status. We will never use it for marketing."
        >
          <TextInput
            value={form.phone}
            onChange={(v) => update("phone", v)}
            placeholder="(801) 555-0123"
            type="tel"
          />
          {showPhoneError ? (
            <div className="mt-1 text-xs" style={{ color: "#fda4af" }}>
              Enter a valid 10-digit US mobile number.
            </div>
          ) : phoneOk ? (
            <div className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              We'll text this number: {normalizeUSPhoneToE164(form.phone)}
            </div>
          ) : null}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="State" hint="Utah for now. You can add more later.">
            <TextInput value="Utah" onChange={() => {}} disabled />
          </Field>
          <Field label="Provider number" hint="Optional — you can add this later in settings.">
            <TextInput value={form.providerNumber} onChange={(v) => update("providerNumber", v)} placeholder="" />
          </Field>
        </div>
      </div>
      <NavButtons onBack={onBack} onNext={save} loading={busy} nextDisabled={!canContinue} />
    </>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testId}
      className="flex h-12 w-full rounded-lg px-3 py-2 text-base outline-none focus:border-[var(--hive-gold)]/60 focus:ring-2 focus:ring-[var(--hive-gold)]/40 disabled:opacity-60"
      style={inputStyle}
    />
  );
}

/* ──────────────────────────── STEP 4 ──────────────────────────── */

function Step4Pricing({
  form,
  update,
  onBack,
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const quote = quotePiListSubscription({ clientCount: form.clientCount });
  return (
    <>
      <Header title="Your plan" subtitle={PI_SIGNUP_PRICE_LINE} />
      <div
        className="mb-5 rounded-xl border border-[var(--hive-border)] bg-[var(--hive-canvas)] p-4"
        data-testid="signup-plan-quote"
      >
        <p className="text-lg font-semibold text-[var(--hive-text)]">
          {PI_LIST_PRICE_DISPLAY} <span className="text-sm font-normal text-[var(--hive-text-muted)]">{PI_LIST_PRICE_UNIT}</span>
        </p>
        <p className="mt-1 text-sm text-[var(--hive-text-muted)]">{PI_LIST_MINIMUM_LINE}</p>
        <p className="mt-3 text-sm text-[var(--hive-text)]" data-testid="signup-plan-math">
          {quote.summaryLine}
        </p>
      </div>
      <div className="grid gap-4">
        <Field label="About how many clients?" hint="Billing is per client. Staff count does not change the price.">
          <TextInput
            type="number"
            value={String(form.clientCount)}
            onChange={(v) => update("clientCount", Math.max(0, Number(v) || 0))}
          />
        </Field>
        <Field label="How many active staff?" hint="For your workspace only — not billed.">
          <TextInput
            type="number"
            value={String(form.staffCount)}
            onChange={(v) => update("staffCount", Math.max(1, Number(v) || 1))}
          />
        </Field>
      </div>
      <NavButtons onBack={onBack} onNext={onNext} />
    </>
  );
}

function Step5Training({
  form,
  update,
  onBack,
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const skip = () => {
    update("trainingAddon", "none");
    onNext();
  };
  return (
    <>
      <Header
        title="Optional training"
        subtitle="Take one add-on now, or skip. You can buy training later from the office."
      />
      <div className="grid gap-2" data-testid="signup-training-step">
        {SIGNUP_TRAINING_ADDONS.map((addon) => {
          const selected = form.trainingAddon === addon.id;
          return (
            <button
              key={addon.id}
              type="button"
              data-testid={`signup-training-${addon.id}`}
              onClick={() => update("trainingAddon", addon.id)}
              className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left"
              style={{
                borderColor: selected ? "#0b1220" : "var(--hive-border)",
                background: selected ? "rgba(11,18,32,0.06)" : "var(--hive-canvas)",
              }}
            >
              <span>
                <span className="block font-medium text-[var(--hive-text)]">{addon.name}</span>
                {addon.savingsHint ? (
                  <span className="block text-xs text-[var(--hive-text-muted)]">{addon.savingsHint}</span>
                ) : null}
              </span>
              <span className="text-sm font-semibold text-[var(--hive-text)]">
                {formatUsdFromCents(addon.priceCents)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-7 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="h-11"
          style={{ fontFamily: JAKARTA }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={skip}
            className="h-11"
            data-testid="signup-training-skip"
            style={{ fontFamily: JAKARTA }}
          >
            Skip training
          </Button>
          <Button
            type="button"
            onClick={onNext}
            disabled={form.trainingAddon === "none"}
            className="group h-11 min-w-[140px] border-0 bg-[#0b1220] text-[#f3efe6] hover:bg-[#111827]"
            style={{ fontFamily: JAKARTA, fontWeight: 700 }}
          >
            Continue
            <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </div>
    </>
  );
}

function Step6Payment({
  form,
  onBack,
  onComplete,
}: {
  form: FormState;
  onBack: () => void;
  onComplete: () => Promise<void>;
}) {
  const checkoutFn = useServerFn(createSubscriptionCheckoutFn);
  const paymentsStatusFn = useServerFn(getSignupPaymentsStatusFn);
  const [busy, setBusy] = useState(false);
  const [payStatus, setPayStatus] = useState<{
    paymentsConfigured: boolean;
    testMode: boolean;
    liveBlocked: boolean;
    message: string | null;
  } | null>(null);
  const quote = quotePiListSubscription({ clientCount: form.clientCount });
  const training = quoteSignupTrainingAddon(form.trainingAddon);
  const liveBlocked = payStatus?.liveBlocked === true;
  const canPay = !liveBlocked && (payStatus == null || payStatus.paymentsConfigured);

  useEffect(() => {
    let cancelled = false;
    void paymentsStatusFn()
      .then((status) => {
        if (!cancelled) setPayStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setPayStatus({
            paymentsConfigured: false,
            testMode: false,
            liveBlocked: false,
            message: "Could not read payment status.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [paymentsStatusFn]);

  const submit = async () => {
    setBusy(true);
    try {
      const { data: userResp } = await supabase.auth.getUser();
      const uid = userResp.user?.id;
      if (!uid) throw new Error("Session lost — please sign in again.");

      const { data: orgs } = await supabase
        .from("organizations")
        .select("id")
        .eq("created_by", uid)
        .limit(1);
      const orgId = orgs?.[0]?.id;
      if (!orgId) throw new Error("Your workspace wasn't ready — please refresh and try again.");

      const r = await checkoutFn({
        data: {
          organizationId: orgId,
          staffCount: form.staffCount,
          clientCount: form.clientCount,
          interval: "monthly",
          pricingModel: "pi_list",
          trainingAddon: form.trainingAddon,
        },
      });
      if (r.exempt) {
        toast.success("Welcome to Provider Interface — this company is comped.");
        await onComplete();
        return;
      }
      if (r.error || !r.url) {
        toast.error(r.error ?? "Could not start checkout. Stay on this page — do not use a live card.");
        setBusy(false);
        return;
      }
      window.location.href = r.url;
    } catch (e) {
      setBusy(false);
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <Header
        title="Pay to activate Provider Interface"
        subtitle="You will be sent to Stripe Checkout. The dashboard stays locked until payment succeeds."
      />

      {liveBlocked ? (
        <div
          className="mb-5 flex items-start gap-3 rounded-lg border p-3 text-sm"
          data-testid="stripe-live-blocked"
          style={{
            background: "rgba(244,63,94,0.10)",
            borderColor: "rgba(244,63,94,0.35)",
            color: "#9f1239",
          }}
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Live charges are blocked.</strong>{" "}
            {payStatus?.message ??
              "This host has live Stripe keys. Use a preview URL with test keys. Do not pay here."}
          </span>
        </div>
      ) : (
        <div
          className="mb-5 flex items-start gap-3 rounded-lg border p-3 text-sm"
          data-testid="stripe-test-mode-hint"
          style={{
            background: "rgba(244,169,58,0.12)",
            borderColor: "rgba(180,120,20,0.45)",
            color: "#7a4b00",
          }}
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>TEST MODE</strong> — no real charge. Use card 4242 4242 4242 4242, any future expiry, any CVC, any ZIP.
            {payStatus && !payStatus.paymentsConfigured ? (
              <>
                {" "}
                {payStatus.message ?? "Payments are not set up on this host yet."}
              </>
            ) : null}
          </span>
        </div>
      )}

      <div
        className="rounded-xl border border-[var(--hive-border)] bg-[var(--hive-canvas)] p-4 text-sm"
        data-testid="pricing-schedule"
      >
        <p className="font-medium text-[var(--hive-text)]">{PI_SIGNUP_PRICE_LINE}</p>
        <p className="mt-2 text-[var(--hive-text)]">{quote.summaryLine}</p>
        {training.id !== "none" ? (
          <p className="mt-1 text-[var(--hive-text)]">
            Training · {training.name}: {formatUsdFromCents(training.priceCents)} one-time
          </p>
        ) : (
          <p className="mt-1 text-[var(--hive-text-muted)]">Training skipped.</p>
        )}
      </div>

      <NavButtons
        onBack={onBack}
        onNext={submit}
        loading={busy}
        nextDisabled={!canPay}
        nextLabel="Pay with Stripe"
      />
    </>
  );
}

/* ──────────────────────────── shared bits ──────────────────────────── */

function Header({ title, subtitle }: { title: string; subtitle: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1
        className="text-2xl tracking-tight text-[var(--hive-text)] sm:text-3xl"
        style={{ fontFamily: JAKARTA, fontWeight: 800, letterSpacing: "-0.01em" }}
      >
        {title}
      </h1>
      <p className="mt-1.5 text-sm text-[var(--hive-text-muted)]">{subtitle}</p>
    </div>
  );
}
