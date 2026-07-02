import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Hexagon,
  Loader2,
  Mail,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { checkEmailExists } from "@/lib/signup-checks.functions";
import { setBillingSmsPhoneAtSignup } from "@/lib/billing-sms.functions";
import { isValidUSPhone, normalizeUSPhoneToE164 } from "@/lib/us-phone";
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
  "Team & pricing",
  "Staff training",
  "Payment",
] as const;

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Math.round(cents / 100),
  );

/* ──────────────────────────── pricing logic ──────────────────────────── */

function ratePerStaff(staff: number): number {
  if (staff >= 50) return 99;
  if (staff >= 20) return 109;
  return 125;
}
function monthlyCost(staff: number): number {
  return Math.max(500, staff * ratePerStaff(staff));
}
function billedToday(monthly: number, interval: "monthly" | "annual") {
  return interval === "annual" ? Math.round(monthly * 12 * 0.8) : monthly;
}

/* ──────────────────────────── form state ──────────────────────────── */

type Training =
  | { kind: "full"; staffCount: number }
  | {
      kind: "alacarte";
      staffCount: number;
      cpr: boolean;
      mandt: boolean;
      dspd: boolean;
    }
  | { kind: "none" };

interface FormState {
  email: string;
  password: string;
  confirm: string;
  agencyName: string;
  contactName: string;
  phone: string;
  providerNumber: string;
  staffCount: number;
  interval: "monthly" | "annual";
  training: Training;
}

const initialForm: FormState = {
  email: "",
  password: "",
  confirm: "",
  agencyName: "",
  contactName: "",
  phone: "",
  providerNumber: "",
  staffCount: 5,
  interval: "monthly",
  training: { kind: "none" },
};

function trainingCostCents(t: Training, fallbackStaff: number): number {
  if (t.kind === "none") return 0;
  const staff = Math.max(1, t.staffCount || fallbackStaff);
  if (t.kind === "full") return staff * 300_00;
  const per = (t.cpr ? 75 : 0) + (t.mandt ? 200 : 0) + (t.dspd ? 100 : 0);
  return staff * per * 100;
}

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
          <input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            className="flex h-12 w-full rounded-lg px-3 py-2 text-base outline-none focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
            style={inputStyle}
          />
        </Field>

        <ul className="-mt-1 grid gap-1 text-xs">
          <PwRule ok={lenOk}>At least 8 characters</PwRule>
          <PwRule ok={numOk}>At least one number</PwRule>
        </ul>

        <Field label="Confirm password" error={!matchOk && form.confirm ? "Passwords don't match." : null}>
          <input
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => update("confirm", e.target.value)}
            className="flex h-12 w-full rounded-lg px-3 py-2 text-base outline-none focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
            style={inputStyle}
          />
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

/* ──────────────────────────── STEP 2 ──────────────────────────── */

function Step2Verify({
  email,
  onBack,
  onNext,
}: {
  email: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async () => {
    setErr(null);
    if (code.length !== 6) return setErr("Enter the 6-digit code from your email.");
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (error) {
      setErr("That code didn't match. Double-check or resend a new one.");
      return;
    }
    toast.success("Email verified.");
    onNext();
  };

  const resend = async () => {
    setErr(null);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("New code sent.");
    setCooldown(60);
  };

  return (
    <>
      <Header
        title="Check your inbox"
        subtitle={
          <>
            We sent a 6-digit code to <span className="text-white">{email}</span>. Enter it below to verify.
          </>
        }
      />
      <div className="grid gap-4">
        <Field label="Verification code" error={err}>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="flex h-14 w-full rounded-lg px-3 py-2 text-center text-2xl tracking-[0.5em] outline-none focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
            style={inputStyle}
          />
        </Field>
        <div className="flex items-center justify-between text-sm text-white/55">
          <span className="inline-flex items-center gap-2">
            <Mail className="h-4 w-4" /> Didn't get it? Check spam.
          </span>
          <button
            type="button"
            disabled={cooldown > 0}
            onClick={resend}
            className="font-medium text-[#f4a93a] hover:underline disabled:cursor-not-allowed disabled:text-white/30 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      </div>
      <NavButtons onBack={onBack} onNext={verify} loading={busy} nextDisabled={code.length !== 6} nextLabel="Verify email" />
    </>
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
  const monthly = monthlyCost(form.staffCount);
  const annual = Math.round(monthly * 12 * 0.8);
  const savings = monthly * 12 - annual;
  const rate = ratePerStaff(form.staffCount);

  return (
    <>
      <Header title="How many active staff do you have right now?" subtitle="You can change this anytime — your bill follows your headcount." />

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => update("staffCount", Math.max(1, form.staffCount - 1))}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]"
        >
          <Minus className="h-5 w-5" />
        </button>
        <input
          type="number"
          min={1}
          value={form.staffCount}
          onChange={(e) => update("staffCount", Math.max(1, parseInt(e.target.value || "1", 10)))}
          className="h-20 w-32 rounded-xl text-center text-5xl font-bold outline-none focus:ring-2 focus:ring-[#f4a93a]/40"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => update("staffCount", form.staffCount + 1)}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-white/55">staff members</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <PriceCard
          active={form.interval === "monthly"}
          onClick={() => update("interval", "monthly")}
          label="Monthly"
          amount={usd(monthly * 100)}
          sub="per month, billed monthly"
        />
        <PriceCard
          active={form.interval === "annual"}
          onClick={() => update("interval", "annual")}
          label="Annual"
          amount={usd(annual)}
          sub={`per year — save ${usd(savings * 100)}/yr`}
          badge="Save 20%"
        />
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <div className="flex items-center justify-between text-white/75">
          <span>Current rate</span>
          <span className="font-semibold text-white">${rate}/staff/mo</span>
        </div>
        {form.staffCount * rate < 500 && (
          <div className="mt-1 flex items-center justify-between text-white/55">
            <span>$500/mo minimum applied</span>
            <span>✓</span>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-white/55">
          Your rate drops automatically — <span className="text-white/80">$109/staff at 20+ clients</span>,{" "}
          <span className="text-white/80">$99/staff at 50+ clients</span>.
        </p>
      </div>

      <NavButtons onBack={onBack} onNext={onNext} />
    </>
  );
}

function PriceCard({
  active,
  onClick,
  label,
  amount,
  sub,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  amount: string;
  sub: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative rounded-xl p-4 text-left transition"
      style={{
        background: active ? "rgba(244,169,58,0.10)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${active ? "rgba(244,169,58,0.55)" : "rgba(255,255,255,0.10)"}`,
      }}
    >
      {badge && (
        <span
          className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "rgba(244,169,58,0.18)", color: "#f7c172", border: "1px solid rgba(244,169,58,0.35)" }}
        >
          {badge}
        </span>
      )}
      <div className="text-xs uppercase tracking-wider text-white/55">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{amount}</div>
      <div className="mt-0.5 text-xs text-white/55">{sub}</div>
    </button>
  );
}

/* ──────────────────────────── STEP 5 ──────────────────────────── */

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
  const t = form.training;
  const monthly = monthlyCost(form.staffCount);
  const platformCharge = billedToday(monthly, form.interval);
  const trainingCharge = trainingCostCents(t, form.staffCount);
  const todayTotal = platformCharge * 100 + trainingCharge;

  const setKind = (kind: Training["kind"]) => {
    if (kind === "full") update("training", { kind: "full", staffCount: form.staffCount });
    else if (kind === "alacarte")
      update("training", { kind: "alacarte", staffCount: form.staffCount, cpr: false, mandt: false, dspd: false });
    else update("training", { kind: "none" });
  };

  return (
    <>
      <Header title="Would you like to add staff training?" subtitle="Training fees are one-time and charged at signup. You can skip and add it later." />

      <div className="grid gap-3">
        <TrainingCard
          active={t.kind === "full"}
          onClick={() => setKind("full")}
          title="Full training program"
          price={`$300 / staff, one-time`}
          total={t.kind === "full" ? usd(trainingCostCents(t, form.staffCount)) : undefined}
        >
          <ul className="grid gap-1 text-sm text-white/65">
            <li>• CPR / First Aid</li>
            <li>• Mandt</li>
            <li>• 30-day DSPD required training</li>
            <li>• Hands-on platform walkthrough</li>
            <li>• Competency verification</li>
            <li>• 12 hrs custom ongoing content / year</li>
          </ul>
        </TrainingCard>

        <TrainingCard
          active={t.kind === "alacarte"}
          onClick={() => setKind("alacarte")}
          title="À la carte"
          price="Choose only what you need"
          total={t.kind === "alacarte" ? usd(trainingCostCents(t, form.staffCount)) : undefined}
        >
          {t.kind === "alacarte" && (
            <div className="grid gap-2 text-sm">
              <Mod label="CPR / First Aid — $75 / person" checked={t.cpr} onChange={(v) => update("training", { ...t, cpr: v })} />
              <Mod label="Mandt — $200 / person" checked={t.mandt} onChange={(v) => update("training", { ...t, mandt: v })} />
              <Mod
                label="DSPD required training + 12 hrs ongoing — $100 / person"
                checked={t.dspd}
                onChange={(v) => update("training", { ...t, dspd: v })}
              />
              <div className="mt-2 flex items-center gap-2 text-xs text-white/60">
                Apply to
                <input
                  type="number"
                  min={1}
                  value={t.staffCount}
                  onChange={(e) =>
                    update("training", { ...t, staffCount: Math.max(1, parseInt(e.target.value || "1", 10)) })
                  }
                  className="h-8 w-16 rounded-md px-2 text-center text-sm text-white"
                  style={inputStyle}
                />
                staff
              </div>
            </div>
          )}
        </TrainingCard>

        <TrainingCard
          active={t.kind === "none"}
          onClick={() => setKind("none")}
          title="No training right now"
          price="I'll handle training separately"
        >
          {t.kind === "none" && (
            <p className="text-xs text-white/55">You can add training at any time from your account settings.</p>
          )}
        </TrainingCard>
      </div>

      <OrderSummary
        interval={form.interval}
        platformCharge={platformCharge * 100}
        trainingCharge={trainingCharge}
        todayTotal={todayTotal}
        monthlyRecurring={monthly * 100}
      />

      <NavButtons onBack={onBack} onNext={onNext} />
    </>
  );
}

function TrainingCard({
  active,
  onClick,
  title,
  price,
  total,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  price: string;
  total?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-xl p-4 transition"
      style={{
        background: active ? "rgba(244,169,58,0.08)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${active ? "rgba(244,169,58,0.55)" : "rgba(255,255,255,0.10)"}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-white">{title}</div>
          <div className="text-xs text-white/55">{price}</div>
        </div>
        {total && <div className="text-sm font-semibold text-[#f4a93a]">{total}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Mod({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2"
      style={{ background: checked ? "rgba(255,255,255,0.05)" : "transparent" }}
      onClick={(e) => e.stopPropagation()}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#f4a93a]" />
      <span className="text-white/85">{label}</span>
    </label>
  );
}

function OrderSummary({
  interval,
  platformCharge,
  trainingCharge,
  todayTotal,
  monthlyRecurring,
}: {
  interval: "monthly" | "annual";
  platformCharge: number;
  trainingCharge: number;
  todayTotal: number;
  monthlyRecurring: number;
}) {
  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
      <div className="mb-2 text-xs uppercase tracking-wider text-white/55">Order summary</div>
      <Row label={`Platform subscription (${interval})`} value={usd(platformCharge)} />
      {trainingCharge > 0 && <Row label="Staff training (one-time)" value={usd(trainingCharge)} />}
      <div className="my-2 h-px bg-white/10" />
      <Row label="Total due today" value={usd(todayTotal)} bold />
      <p className="mt-2 text-xs text-white/45">
        After today, platform billing recurs at {usd(monthlyRecurring)} / month
        {interval === "annual" ? ", paid annually" : ""}.
      </p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={bold ? "text-white" : "text-white/65"}>{label}</span>
      <span className={bold ? "text-base font-bold text-white" : "text-white/85"}>{value}</span>
    </div>
  );
}

/* ──────────────────────────── STEP 6 ──────────────────────────── */

function Step6Payment({
  form,
  onBack,
  onComplete,
}: {
  form: FormState;
  onBack: () => void;
  onComplete: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const finished = useRef(false);

  const monthly = monthlyCost(form.staffCount);
  const platformCharge = billedToday(monthly, form.interval);
  const trainingCharge = trainingCostCents(form.training, form.staffCount);
  const todayTotal = platformCharge * 100 + trainingCharge;
  const brand = useMemo(() => detectBrand(card), [card]);

  const formatCard = (v: string) => v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
  const formatExp = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const canSubmit = name.trim() && card.replace(/\s/g, "").length >= 12 && exp.length === 5 && cvc.length >= 3 && zip.length >= 4;

  const submit = async () => {
    if (!canSubmit || finished.current) return;
    setBusy(true);
    finished.current = true;

    // Mock processing delay
    await new Promise((r) => setTimeout(r, 1500));

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

      const nowIso = new Date().toISOString();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + (form.interval === "annual" ? 365 : 30));

      // Subscription row — shape matches Stripe's data model so a real
      // integration only needs to populate the stripe_* ids via webhooks.
      // Card details are intentionally never stored.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: subErr } = await (supabase.from("org_subscriptions") as any).upsert(
        {
          organization_id: orgId,
          plan: "hive_standard", // single standard plan; "enterprise" is operator-set later
          status: "active", // providers pay at signup — no trial state
          mrr_cents: monthly * 100,
          staff_count: form.staffCount,
          billing_interval: form.interval,
          current_period_start: nowIso,
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          renewal_date: periodEnd.toISOString().slice(0, 10),
          started_at: nowIso,
          past_due_since: null,
          locked_at: null,
          lock_reason: null,
          failure_count: 0,
          last_payment_error: null,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          stripe_payment_method_id: null,
        },
        { onConflict: "organization_id" },
      );
      if (subErr) throw subErr;

      // Training order — separate table so a Stripe PaymentIntent webhook
      // can flip status to 'paid' and attach stripe_payment_intent_id.
      const trainingType: "full" | "alacarte" | "none" = form.training.kind;
      const selectedModules: string[] =
        form.training.kind === "alacarte"
          ? (["cpr", "mandt", "dspd"] as const).filter(
              (m) => (form.training as { cpr?: boolean; mandt?: boolean; dspd?: boolean })[m] === true,
            )
          : form.training.kind === "full"
            ? ["cpr", "mandt", "dspd"]
            : [];

      const { error: trainErr } = await supabase.from("org_training_orders").insert({
        organization_id: orgId,
        training_type: trainingType,
        selected_modules: selectedModules,
        staff_count: form.staffCount,
        amount_cents: trainingCharge,
        status: trainingCharge > 0 ? "paid" : "pending",
        stripe_payment_intent_id: null,
      });
      if (trainErr) throw trainErr;


      toast.success("Welcome to Hive!");
      await onComplete();
    } catch (e) {
      finished.current = false;
      setBusy(false);
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <Header title="Complete your setup" subtitle="One last step. Your account activates the moment you submit." />

      <div
        className="mb-5 flex items-start gap-3 rounded-lg border p-3 text-sm"
        style={{
          background: "rgba(244,169,58,0.10)",
          borderColor: "rgba(244,169,58,0.35)",
          color: "#f7c172",
        }}
      >
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>Test mode</strong> — no real charge will occur. Any card details are accepted.
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr,320px]">
        <div className="grid gap-4">
          <Field label="Cardholder name">
            <TextInput value={name} onChange={setName} placeholder="As it appears on the card" />
          </Field>

          <Field label="Card number">
            <div className="relative">
              <input
                value={card}
                onChange={(e) => setCard(formatCard(e.target.value))}
                placeholder="1234 1234 1234 1234"
                inputMode="numeric"
                autoComplete="cc-number"
                className="flex h-12 w-full rounded-lg px-3 pr-20 py-2 text-base outline-none focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
                style={inputStyle}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-white/80">
                {brand}
              </span>
            </div>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Expiry">
              <input
                value={exp}
                onChange={(e) => setExp(formatExp(e.target.value))}
                placeholder="MM/YY"
                inputMode="numeric"
                autoComplete="cc-exp"
                className="flex h-12 w-full rounded-lg px-3 py-2 text-base outline-none focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
                style={inputStyle}
              />
            </Field>
            <Field label="CVC">
              <input
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="123"
                inputMode="numeric"
                autoComplete="cc-csc"
                className="flex h-12 w-full rounded-lg px-3 py-2 text-base outline-none focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
                style={inputStyle}
              />
            </Field>
            <Field label="ZIP">
              <input
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10))}
                placeholder="84101"
                autoComplete="postal-code"
                className="flex h-12 w-full rounded-lg px-3 py-2 text-base outline-none focus:border-[#f4a93a]/60 focus:ring-2 focus:ring-[#f4a93a]/40"
                style={inputStyle}
              />
            </Field>
          </div>
        </div>

        <aside className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm md:sticky md:top-4 md:self-start">
          <div className="mb-2 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-[#f7c172]">
            <Sparkles className="h-3 w-3" /> Hive Standard
          </div>
          <Row label="Staff" value={`${form.staffCount}`} />
          <Row label="Billing" value={form.interval === "annual" ? "Annual (save 20%)" : "Monthly"} />
          <div className="my-2 h-px bg-white/10" />
          <Row label="Platform" value={usd(platformCharge * 100)} />
          {trainingCharge > 0 && <Row label="Training (one-time)" value={usd(trainingCharge)} />}
          <div className="my-2 h-px bg-white/10" />
          <Row label="Total today" value={usd(todayTotal)} bold />
          <p className="mt-3 text-xs text-white/45">
            Then {usd(monthly * 100)} / mo{form.interval === "annual" ? ", paid annually" : ""}.
          </p>
        </aside>
      </div>

      <NavButtons onBack={onBack} onNext={submit} loading={busy} nextDisabled={!canSubmit} nextLabel="Start using Hive →" />
    </>
  );
}

function detectBrand(card: string): "visa" | "mastercard" | "amex" | "discover" | "card" {
  const c = card.replace(/\s/g, "");
  if (/^4/.test(c)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(c)) return "mastercard";
  if (/^3[47]/.test(c)) return "amex";
  if (/^6/.test(c)) return "discover";
  return "card";
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
