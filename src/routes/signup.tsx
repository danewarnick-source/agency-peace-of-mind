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
import { PI_LIST_MINIMUM_LINE, PI_LIST_PRICE_DISPLAY, PI_SIGNUP_PRICE_LINE } from "@/lib/pi-landing";
import {
  SIGNUP_AGENCY_PLACEHOLDER,
  SIGNUP_TRAINING_ADDONS,
  newTrainingPersonRow,
  quotePiListSubscription,
  quoteSignupTrainingLines,
  trainingQuantitiesFromPeople,
  trainingRosterTotalCents,
  type TrainingPersonRow,
} from "@/lib/pi-signup-pricing";
import { toast } from "sonner";
import {
  SIGNUP_EMAIL_IN_USE_MESSAGE,
  humanizeSignupAccountError,
  isAlreadyUsedEmailError,
  isMissingLegalAttestationsError,
} from "@/lib/signup-account-error";

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
  trainingPeople: TrainingPersonRow[];
  acceptedTos: boolean;
  acceptedBaa: boolean;
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
  trainingPeople: [],
  acceptedTos: false,
  acceptedBaa: false,
};

/* ──────────────────────────── shell ──────────────────────────── */

function Brand() {
  return <PiWordmark to="/" />;
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mb-8" data-testid="signup-stepper">
      <div
        className="mb-3 flex items-center justify-between text-sm"
        style={{ fontFamily: JAKARTA, color: AMBER }}
      >
        <span data-testid="signup-step-label">
          Step <span className="font-semibold">{step + 1}</span> of {STEPS.length}
        </span>
        <span className="font-semibold" data-testid="signup-step-name">
          {STEPS[step]}
        </span>
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
  onSkip,
  nextLabel = "Continue",
  skipLabel = "Skip training",
  nextDisabled,
  loading,
  showBack = true,
}: {
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  skipLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
  showBack?: boolean;
}) {
  return (
    <div
      className="mt-7 flex flex-col gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between"
      data-testid="signup-nav"
    >
      <div className="order-1 flex w-full flex-col gap-2 sm:order-2 sm:w-auto sm:flex-row-reverse sm:justify-end">
        <Button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || loading}
          className="group h-11 w-full border-0 bg-[#0b1220] text-[#f3efe6] hover:bg-[#111827] sm:w-auto sm:min-w-[160px]"
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
        {onSkip ? (
          <Button
            type="button"
            variant="outline"
            onClick={onSkip}
            disabled={loading}
            className="h-11 w-full sm:w-auto"
            data-testid="signup-training-skip"
            style={{ fontFamily: JAKARTA }}
          >
            {skipLabel}
          </Button>
        ) : null}
      </div>
      {showBack && onBack ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={loading}
          className="order-2 h-11 w-full sm:order-1 sm:w-auto"
          style={{ fontFamily: JAKARTA }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      ) : (
        <span className="order-2 hidden sm:order-1 sm:block" />
      )}
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
        <p className="mt-8 text-center text-xs text-[#f3efe6]/40">
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-[#f3efe6]">
            Terms
          </a>
          {" · "}
          <a href="/baa" target="_blank" rel="noopener noreferrer" className="hover:text-[#f3efe6]">
            BAA
          </a>
        </p>
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
        setEmailErr(SIGNUP_EMAIL_IN_USE_MESSAGE);
      }
    } catch {
      // soft-fail; we'll re-check on submit
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    setEmailErr(null);
    if (!form.acceptedTos) return toast.error("Agree to the Terms to continue.");
    if (!form.acceptedBaa) return toast.error("Agree to the Business Associate Agreement to continue.");
    if (!emailValid) return setEmailErr("Please enter a valid email address.");
    if (!lenOk || !numOk) return toast.error("Password must be at least 8 characters and include a number.");
    if (!matchOk) return toast.error("Passwords don't match.");
    if (await verifyPasswordPwned(form.password)) return;
    setBusy(true);
    try {
      let exists = false;
      try {
        const r = await checkEmail({ data: { email: form.email } });
        exists = r.exists;
      } catch (e) {
        if (isAlreadyUsedEmailError(e)) {
          setEmailErr(SIGNUP_EMAIL_IN_USE_MESSAGE);
          setBusy(false);
          return;
        }
        if (isMissingLegalAttestationsError(e)) {
          toast.error(humanizeSignupAccountError(e));
          setBusy(false);
          return;
        }
        /* empty / unknown server-fn payload — unique-email still runs on signUp */
      }
      if (exists) {
        setEmailErr(SIGNUP_EMAIL_IN_USE_MESSAGE);
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
        if (isAlreadyUsedEmailError(error) || /already/i.test(error.message ?? "")) {
          setEmailErr(SIGNUP_EMAIL_IN_USE_MESSAGE);
        } else if (isAuthPwnedPasswordMessage(error.message)) {
          setPasswordWeakErr(weakPasswordCopyFromAuth(error.message));
        } else {
          toast.error(humanizeSignupAccountError(error));
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
      if (isAlreadyUsedEmailError(e)) {
        setEmailErr(SIGNUP_EMAIL_IN_USE_MESSAGE);
      } else {
        toast.error(humanizeSignupAccountError(e));
      }
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

      <label
        className="mt-6 flex items-start gap-3 text-sm text-[var(--hive-text)]"
        data-testid="signup-tos"
      >
        <input
          type="checkbox"
          checked={form.acceptedTos}
          onChange={(e) => update("acceptedTos", e.target.checked)}
          data-testid="signup-tos-checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--hive-border)] accent-[#0b1220]"
        />
        <span>
          I agree to the{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--hive-gold)] underline underline-offset-2 hover:text-[#0b1220]"
            data-testid="signup-tos-link"
          >
            Terms
          </a>
          .
        </span>
      </label>

      <label
        className="mt-3 flex items-start gap-3 text-sm text-[var(--hive-text)]"
        data-testid="signup-baa"
      >
        <input
          type="checkbox"
          checked={form.acceptedBaa}
          onChange={(e) => update("acceptedBaa", e.target.checked)}
          data-testid="signup-baa-checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--hive-border)] accent-[#0b1220]"
        />
        <span>
          I am authorized to bind this agency. I have read the{" "}
          <a
            href="/baa"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--hive-gold)] underline underline-offset-2 hover:text-[#0b1220]"
            data-testid="signup-baa-link"
          >
            Business Associate Agreement
          </a>{" "}
          and I agree to it on behalf of this agency.
        </span>
      </label>

      <NavButtons
        showBack={false}
        onNext={submit}
        loading={busy}
        nextDisabled={
          !form.acceptedTos ||
          !form.acceptedBaa ||
          !emailValid ||
          !lenOk ||
          !numOk ||
          !matchOk ||
          !!emailErr ||
          !!passwordWeakErr
        }
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
  return (
    <>
      <Header
        title="Your plan"
        subtitle="You pay $69 for each client who is actually active that month, or $350, whichever is higher. Staff are not billed."
      />
      <div
        className="mb-5 rounded-xl border border-[var(--hive-border)] bg-[var(--hive-canvas)] p-4"
        data-testid="signup-plan-quote"
      >
        <p className="text-lg font-semibold text-[var(--hive-text)]">
          {PI_LIST_PRICE_DISPLAY}{" "}
          <span className="text-sm font-normal text-[var(--hive-text-muted)]">per active client / month</span>
        </p>
        <p className="mt-1 text-sm text-[var(--hive-text-muted)]">{PI_LIST_MINIMUM_LINE}</p>
        <p className="mt-3 text-sm text-[var(--hive-text)]">This page does not charge you.</p>
        <p className="mt-3 text-sm text-[var(--hive-text)]" data-testid="signup-plan-math">
          Example: if 12 clients are active, that month is $828. If fewer than 6 are active, you still pay $350.
        </p>
      </div>
      <div className="grid gap-4">
        <Field
          label="About how many clients will you start with?"
          hint="A starting guess for the workspace. Not your bill. We bill the highest number of clients who were actually active that month. Discharged clients are not billed."
        >
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
  const people = form.trainingPeople;
  const quantities = trainingQuantitiesFromPeople(people);
  const totalCents = trainingRosterTotalCents(people);

  const setPeople = (next: TrainingPersonRow[]) => update("trainingPeople", next);
  const addPerson = () => setPeople([...people, newTrainingPersonRow()]);
  const updatePerson = (id: string, patch: Partial<TrainingPersonRow>) =>
    setPeople(people.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const removePerson = (id: string) => setPeople(people.filter((row) => row.id !== id));
  const skip = () => {
    setPeople([]);
    onNext();
  };
  const continueNext = () => {
    setPeople(people.filter((row) => row.name.trim().length > 0));
    onNext();
  };

  return (
    <>
      <Header
        title="Optional training"
        subtitle="Add who needs training, or skip. You can buy training later from the office."
      />
      <div className="grid gap-4" data-testid="signup-training-step">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SIGNUP_TRAINING_ADDONS.map((addon) => (
            <div
              key={addon.id}
              data-testid={`signup-training-${addon.id}`}
              className="rounded-lg border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-3 py-2 text-sm"
            >
              <span className="block font-medium text-[var(--hive-text)]">{addon.name}</span>
              <span className="text-[var(--hive-text-muted)]">{formatUsdFromCents(addon.priceCents)}</span>
            </div>
          ))}
        </div>

        <p className="text-sm">
          <Link
            to="/training"
            className="text-[var(--hive-text-muted)] underline-offset-4 hover:text-[var(--hive-text)] hover:underline"
            data-testid="signup-training-only-link"
          >
            Just need training? Buy classes without the office.
          </Link>
        </p>

        {people.map((person, index) => (
          <div
            key={person.id}
            data-testid={`signup-training-row-${index}`}
            className="rounded-xl border border-[var(--hive-border)] bg-[var(--hive-canvas)] p-3"
          >
            <div className="flex items-start gap-2">
              <input
                type="text"
                value={person.name}
                onChange={(e) => updatePerson(person.id, { name: e.target.value })}
                placeholder="Name"
                data-testid={`signup-training-name-${index}`}
                className="flex h-11 w-full rounded-lg px-3 py-2 text-base outline-none focus:border-[var(--hive-gold)]/60 focus:ring-2 focus:ring-[var(--hive-gold)]/40"
                style={inputStyle}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => removePerson(person.id)}
                className="h-11 shrink-0 px-3"
                data-testid={`signup-training-remove-${index}`}
              >
                Remove
              </Button>
            </div>
            <fieldset className="mt-3 grid grid-cols-2 gap-2">
              <legend className="sr-only">Training for {person.name || `person ${index + 1}`}</legend>
              {SIGNUP_TRAINING_ADDONS.map((addon) => {
                const selected = person.sku === addon.id;
                return (
                  <label
                    key={addon.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    style={{
                      borderColor: selected ? "#0b1220" : "var(--hive-border)",
                      background: selected ? "rgba(11,18,32,0.06)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name={`signup-training-sku-${person.id}`}
                      checked={selected}
                      onChange={() => updatePerson(person.id, { sku: addon.id })}
                      data-testid={`signup-training-sku-${index}-${addon.id}`}
                      className="accent-[#0b1220]"
                    />
                    <span className="font-medium text-[var(--hive-text)]">{addon.name}</span>
                  </label>
                );
              })}
            </fieldset>
            <p className="mt-2 text-xs text-[var(--hive-text-muted)]">
              Pack is that person&apos;s training — not also CPR, 30-day, or Mandt.
            </p>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={addPerson}
          className="h-11 w-full"
          data-testid="signup-training-add"
          style={{ fontFamily: JAKARTA }}
        >
          Add a person
        </Button>

        <div
          className="rounded-xl border border-[var(--hive-border)] bg-[var(--hive-canvas)] p-3 text-sm"
          data-testid="signup-training-total"
        >
          <p className="font-semibold text-[var(--hive-text)]">
            Training total {formatUsdFromCents(totalCents)}
          </p>
          <p className="mt-1 text-[var(--hive-text-muted)]">
            {quantities.cpr_first_aid}× CPR · {quantities.pack}× Pack · {quantities.thirty_day}× 30-day ·{" "}
            {quantities.mandt}× Mandt
          </p>
          <p className="mt-2 text-[var(--hive-text)]">This page does not charge you.</p>
        </div>
      </div>
      <NavButtons onBack={onBack} onNext={continueNext} onSkip={skip} skipLabel="Skip training" />
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
  const namedPeople = form.trainingPeople.filter((row) => row.name.trim().length > 0);
  const trainingLines = quoteSignupTrainingLines(trainingQuantitiesFromPeople(namedPeople));
  const trainingTotalCents = trainingRosterTotalCents(namedPeople);
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
          fromSignup: true,
          trainingPeople: namedPeople.map((row) => ({ name: row.name.trim(), sku: row.sku })),
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
        {trainingLines.length > 0 ? (
          <div className="mt-2 space-y-1 text-[var(--hive-text)]" data-testid="signup-payment-training">
            {trainingLines.map((line) => (
              <p key={line.id}>
                Training · {line.name} × {line.quantity}: {formatUsdFromCents(line.priceCents * line.quantity)} one-time
              </p>
            ))}
            <p className="font-medium">Training total {formatUsdFromCents(trainingTotalCents)}</p>
          </div>
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
