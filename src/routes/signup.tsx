import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Hexagon,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { checkEmailExists } from "@/lib/signup-checks.functions";
import { setBillingSmsPhoneAtSignup } from "@/lib/billing-sms.functions";
import { isValidUSPhone, normalizeUSPhoneToE164 } from "@/lib/us-phone";
import { createSubscriptionCheckoutFn } from "@/lib/stripe-checkout.functions";
import { getSignupPricingFn } from "@/lib/hive-pricing.functions";
import {
  formatUsdFromCents,
  quoteHiveSubscription,
  type BillingInterval,
} from "@/lib/hive-pricing";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Get started — HIVE" },
      { name: "description", content: "Create your Hive account and start running your DSPD agency from one place." },
    ],
  }),
  component: SignupPage,
});

/* ──────────────────────────── design tokens ──────────────────────────── */

const JAKARTA = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
const NAVY_BG =
  "radial-gradient(1000px 600px at 80% 110%, rgba(244,169,58,0.18), transparent 60%), linear-gradient(140deg, #141a3d 0%, #0d112b 100%)";
const AMBER = "#f4a93a";
const AMBER_GRAD = "linear-gradient(135deg, #f4a93a 0%, #f59324 100%)";

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "white",
  fontFamily: JAKARTA,
};

const STEPS = [
  "Account",
  "Your business",
  "Staff & billing",
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
};

/* ──────────────────────────── shell ──────────────────────────── */

function HexPattern() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05]">
      <defs>
        <pattern id="hex" width="80" height="92" patternUnits="userSpaceOnUse" patternTransform="scale(1.4)">
          <polygon points="40,2 78,24 78,68 40,90 2,68 2,24" fill="none" stroke="#ffffff" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex)" />
    </svg>
  );
}

function Brand() {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 font-semibold text-white" style={{ fontFamily: JAKARTA }}>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] backdrop-blur">
        <Hexagon className="h-4 w-4 text-[#f4a93a]" strokeWidth={2.5} />
      </span>
      <span className="text-[15px] tracking-tight">
        HIVE <span className="ml-1 text-xs font-normal text-white/55">— powered by NECTAR™</span>
      </span>
    </Link>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between text-xs text-white/55" style={{ fontFamily: JAKARTA }}>
        <span>
          Step <span className="font-semibold text-white">{step + 1}</span> of {STEPS.length}
        </span>
        <span className="font-medium text-white/75">{STEPS[step]}</span>
      </div>
      <div className="flex gap-1.5">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-colors"
            style={{ background: i <= step ? AMBER : "rgba(255,255,255,0.1)" }}
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
      <Label className="text-white/80" style={{ fontFamily: JAKARTA }}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-white/45">{hint}</p>
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
          className="h-11 border border-white/15 bg-transparent text-white hover:bg-white/[0.06] hover:text-white"
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
        className="group h-11 min-w-[160px] border-0 text-[#1a1208] shadow-lg shadow-amber-900/20 hover:brightness-105"
        style={{ fontFamily: JAKARTA, fontWeight: 700, backgroundImage: AMBER_GRAD }}
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

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="relative min-h-screen overflow-hidden text-white" style={{ background: NAVY_BG, fontFamily: JAKARTA }}>
      <HexPattern />
      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col px-5 py-8 md:py-12">
        <header className="mb-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Brand />
          <Link to="/login" className="text-sm text-white/60 hover:text-white">
            Already have an account? <span className="font-medium text-[#f4a93a]">Sign in</span>
          </Link>
        </header>

        <main className="mx-auto w-full max-w-2xl flex-1">
          <Stepper step={step} />
          <div
            className="rounded-2xl p-6 shadow-2xl backdrop-blur-xl sm:p-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.11)" }}
          >
            {step === 0 && (
              <Step1Account
                form={form}
                update={update}
                checkEmail={checkEmail}
                onNext={() => setStep(1)}
              />
            )}
            {step === 1 && (
              <Step3Business form={form} update={update} onBack={goBack} onNext={() => setStep(2)} />
            )}
            {step === 2 && (
              <Step4Pricing form={form} update={update} onBack={goBack} onNext={() => setStep(3)} />
            )}
            {step === 3 && (
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
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  checkEmail: (input: { data: { email: string } }) => Promise<{ exists: boolean }>;
  onNext: () => void;
}) {
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const lenOk = form.password.length >= 8;
  const numOk = /\d/.test(form.password);
  const matchOk = form.password.length > 0 && form.password === form.confirm;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

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
    setBusy(true);
    try {
      const r = await checkEmail({ data: { email: form.email } });
      if (r.exists) {
        setEmailErr("An account with this email already exists. Sign in instead?");
        setBusy(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/signup`,
          data: {
            full_name: form.contactName || form.email.split("@")[0],
            agency_name: form.agencyName || `${form.email.split("@")[0]}'s workspace`,
          },
        },
      });
      if (error) {
        if (/already/i.test(error.message)) {
          setEmailErr("An account with this email already exists. Sign in instead?");
        } else {
          toast.error(error.message);
        }
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
      <div className="grid gap-4">
        <Field
          label="Email address"
          error={
            emailErr ? (
              <>
                {emailErr}{" "}
                <Link to="/login" className="font-medium text-[#f4a93a] hover:underline">
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
            className="flex h-12 w-full rounded-lg px-3 py-2 text-base outline-none focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
            style={inputStyle}
            placeholder="you@agency.com"
          />
          {checking && <span className="text-xs text-white/45">Checking…</span>}
        </Field>

        <Field label="Password">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              className="flex h-12 w-full rounded-lg px-3 py-2 pr-10 text-base outline-none focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
              style={inputStyle}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-white/50 hover:text-white/80"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
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
              className="flex h-12 w-full rounded-lg px-3 py-2 pr-10 text-base outline-none focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
              style={inputStyle}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-white/50 hover:text-white/80"
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
        nextDisabled={!emailValid || !lenOk || !numOk || !matchOk || !!emailErr}
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
  onBack,
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
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
      const { data: userResp } = await supabase.auth.getUser();
      const uid = userResp.user?.id;
      if (!uid) {
        toast.error("Your workspace isn't ready yet — please refresh and try again.");
        setBusy(false);
        return;
      }

      // Best-effort profile update — don't block on failure.
      try {
        await supabase.from("profiles").update({
          full_name: form.contactName,
          agency_name: form.agencyName,
        }).eq("id", uid);
      } catch {
        /* non-blocking */
      }

      const { data: orgs } = await supabase
        .from("organizations")
        .select("id")
        .eq("created_by", uid)
        .limit(1);
      const orgId = orgs?.[0]?.id;
      if (!orgId) {
        toast.error("Your workspace isn't ready yet — please refresh and try again.");
        setBusy(false);
        return;
      }

      const isTrainingOnly =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("flow") === "training";

      const { error: orgErr } = await supabase
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
      <Header title="Tell us about your business" subtitle="This becomes your workspace name across Hive." />
      <div className="grid gap-4">
        <Field label="Agency or company name">
          <TextInput value={form.agencyName} onChange={(v) => update("agencyName", v)} placeholder="True North Supports" />
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
          <Field label="State" hint="Hive is currently Utah DSPD only.">
            <TextInput value="Utah" onChange={() => {}} disabled />
          </Field>
          <Field label="DSPD provider number" hint="Optional — you can add this later in settings.">
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
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex h-12 w-full rounded-lg px-3 py-2 text-base outline-none focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40 disabled:opacity-60"
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
  const pricingFn = useServerFn(getSignupPricingFn);
  const [schedule, setSchedule] = useState<"list" | "founding">("founding");
  const [slots, setSlots] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    pricingFn()
      .then((r) => {
        if (cancelled) return;
        setSchedule(r.schedule);
        setSlots(r.foundingSlotsRemaining);
      })
      .catch(() => {
        if (!cancelled) setSchedule("founding");
      });
    return () => {
      cancelled = true;
    };
  }, [pricingFn]);

  const quote = quoteHiveSubscription({
    staffCount: form.staffCount,
    clientCount: form.clientCount,
    schedule,
    interval: form.interval,
  });

  return (
    <>
      <Header
        title="Staff & billing"
        subtitle="Hive is billed per active staff. True North Supports is never charged here. Enterprise custom work is contact-us — no public dollar amount."
      />
      {schedule === "founding" && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-sm"
          data-testid="founding-rate-note"
          style={{
            background: "rgba(244,169,58,0.10)",
            borderColor: "rgba(244,169,58,0.35)",
            color: "#f7c172",
          }}
        >
          Founding rate for the first 5 paying agencies: $79 / staff, $299 / month minimum
          {slots != null ? ` · ${slots} founding slot${slots === 1 ? "" : "s"} left` : ""}. After 12
          months you step up to list.
        </div>
      )}
      {schedule === "list" && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
          List rate: $125 / staff (1–19 clients), $109 at 20–49, $99 at 50+. $500 / month minimum.
          Annual saves 20%.
        </div>
      )}
      <div className="grid gap-4">
        <Field label="How many active staff?">
          <TextInput
            type="number"
            value={String(form.staffCount)}
            onChange={(v) => update("staffCount", Math.max(1, Number(v) || 1))}
          />
        </Field>
        <Field label="About how many clients?">
          <TextInput
            type="number"
            value={String(form.clientCount)}
            onChange={(v) => update("clientCount", Math.max(0, Number(v) || 0))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update("interval", "monthly")}
            className="rounded-xl p-3 text-left"
            style={{
              background: form.interval === "monthly" ? "rgba(244,169,58,0.10)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${form.interval === "monthly" ? "rgba(244,169,58,0.55)" : "rgba(255,255,255,0.10)"}`,
            }}
          >
            <div className="text-xs uppercase tracking-wider text-white/55">Monthly</div>
            <div className="mt-1 text-lg font-bold">{formatUsdFromCents(quote.monthlyCents)}</div>
          </button>
          <button
            type="button"
            onClick={() => update("interval", "annual")}
            className="rounded-xl p-3 text-left"
            style={{
              background: form.interval === "annual" ? "rgba(244,169,58,0.10)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${form.interval === "annual" ? "rgba(244,169,58,0.55)" : "rgba(255,255,255,0.10)"}`,
            }}
          >
            <div className="text-xs uppercase tracking-wider text-white/55">Annual · 20% off</div>
            <div className="mt-1 text-lg font-bold">{formatUsdFromCents(quote.billedCents)}</div>
          </button>
        </div>
        <p className="text-xs text-white/55">
          {formatUsdFromCents(quote.perStaffCents)} per staff
          {quote.minimumApplied ? ` · ${formatUsdFromCents(quote.minimumCents)} minimum applied` : ""}.
          Training is separate (full program $300 / staff; TNS skips it).
        </p>
      </div>
      <NavButtons onBack={onBack} onNext={onNext} />
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
  const pricingFn = useServerFn(getSignupPricingFn);
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState<"list" | "founding">("founding");

  useEffect(() => {
    pricingFn()
      .then((r) => setSchedule(r.schedule))
      .catch(() => setSchedule("founding"));
  }, [pricingFn]);

  const quote = quoteHiveSubscription({
    staffCount: form.staffCount,
    clientCount: form.clientCount,
    schedule,
    interval: form.interval,
  });

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
          interval: form.interval,
        },
      });
      if (r.exempt) {
        toast.success("Welcome to Hive — this company is comped.");
        await onComplete();
        return;
      }
      if (r.error || !r.url) {
        toast.error(r.error ?? "Could not start checkout. Your workspace is saved; you can pay from the subscription page.");
        setBusy(false);
        await onComplete();
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
        title="Pay to activate Hive"
        subtitle="You will be sent to Stripe Checkout. The dashboard stays locked until payment succeeds."
      />

      <div
        className="mb-5 flex items-start gap-3 rounded-lg border p-3 text-sm"
        data-testid="stripe-test-mode-hint"
        style={{
          background: "rgba(244,169,58,0.10)",
          borderColor: "rgba(244,169,58,0.35)",
          color: "#f7c172",
        }}
      >
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>TEST MODE</strong> — no real charge. Use card 4242 4242 4242 4242, any future expiry, any CVC, any ZIP.
        </span>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm" data-testid="pricing-schedule">
        <div className="text-xs uppercase tracking-wider text-[#f7c172]">
          {quote.schedule === "founding" ? "Founding" : "List"} · {form.staffCount} staff
        </div>
        <div className="mt-1 text-2xl font-bold">
          {formatUsdFromCents(form.interval === "annual" ? quote.billedCents : quote.monthlyCents)}
          <span className="text-base font-normal text-white/60">
            {form.interval === "annual" ? "/year" : "/mo"}
          </span>
        </div>
        <p className="mt-2 text-xs text-white/55">
          {formatUsdFromCents(quote.perStaffCents)} per staff
          {quote.minimumApplied ? ` · ${formatUsdFromCents(quote.minimumCents)} minimum` : ""}.
          Training is one-time and separate. Enterprise is contact us.
        </p>
      </div>

      <NavButtons onBack={onBack} onNext={submit} loading={busy} nextLabel="Pay with Stripe" />
    </>
  );
}

/* ──────────────────────────── shared bits ──────────────────────────── */

function Header({ title, subtitle }: { title: string; subtitle: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1
        className="text-2xl tracking-tight text-white sm:text-3xl"
        style={{ fontFamily: JAKARTA, fontWeight: 800, letterSpacing: "-0.01em" }}
      >
        {title}
      </h1>
      <p className="mt-1.5 text-sm text-white/60">{subtitle}</p>
    </div>
  );
}
