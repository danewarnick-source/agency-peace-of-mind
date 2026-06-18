import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Lock,
  ArrowRight,
  Hexagon,
  Sparkles,
  Upload,
  Building2,
  Users,
  UserSquare2,
  Settings as SettingsIcon,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AuthoritativeSourceDrop } from "@/components/nectar/authoritative-source-drop";
import { AttestationBanner } from "@/components/nectar/attestation-banner";
import { OnboardingPipelineCard } from "@/components/company-overview/onboarding-pipeline-card";
import { cn } from "@/lib/utils";

const SERVICE_OPTIONS = ["HHS", "SLN", "SLH", "SEI", "DSI", "RHS"] as const;
type Service = (typeof SERVICE_OPTIONS)[number];

type ProfileDraft = {
  services: Service[];
  clientCount: string;
  staffCount: string;
  serviceArea: string;
  specializations: string;
};

const EMPTY_PROFILE: ProfileDraft = {
  services: [],
  clientCount: "",
  staffCount: "",
  serviceArea: "",
  specializations: "",
};

function lsKey(orgId: string, suffix: string) {
  return `hive_onboarding_${orgId}_${suffix}`;
}

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function NectarOnboardingPanel({
  welcomeFlag = false,
}: {
  welcomeFlag?: boolean;
}) {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const orgId = org?.organization_id;
  const orgName = org?.organization_name ?? "your agency";
  const userMeta = (user?.user_metadata ?? {}) as { first_name?: string; full_name?: string };
  const adminFirstName =
    userMeta.first_name ||
    userMeta.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "there";

  // --- Persistent local state -----------------------------------------------
  const [dismissed, setDismissed] = useState(false);
  const [profileSavedLocal, setProfileSavedLocal] = useState(false);
  const [servicesVisited, setServicesVisited] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(EMPTY_PROFILE);
  const [activeStepOverride, setActiveStepOverride] = useState<number | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setDismissed(readLS(lsKey(orgId, "dismissed"), false));
    setProfileSavedLocal(readLS(lsKey(orgId, "profile_saved"), false));
    setServicesVisited(readLS(lsKey(orgId, "services_visited"), false));
    setProfileDraft(readLS<ProfileDraft>(lsKey(orgId, "profile"), EMPTY_PROFILE));
  }, [orgId]);

  // --- Detection queries ----------------------------------------------------
  const { data: counts, refetch: refetchCounts } = useQuery({
    enabled: !!orgId,
    queryKey: ["nectar-onboarding", orgId],
    queryFn: async () => {
      const [authDocs, attestations, members, clients, allDocs] = await Promise.all([
        supabase
          .from("nectar_documents")
          .select("id, authoritative_kind", { count: "exact" })
          .eq("organization_id", orgId!)
          .eq("is_authoritative_source", true),
        supabase
          .from("nectar_attestations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!)
          .eq("scope", "document_upload"),
        supabase
          .from("organization_members")
          .select("user_id", { count: "exact", head: true })
          .eq("organization_id", orgId!),
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!),
        supabase
          .from("nectar_documents")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!),
      ]);
      const authRows = (authDocs.data ?? []) as Array<{ authoritative_kind: string | null }>;
      const sowCount = authRows.filter((r) => r.authoritative_kind === "state_sow").length;
      return {
        authSourcesCount: authDocs.count ?? authRows.length,
        sowCount,
        attestationCount: attestations.count ?? 0,
        memberCount: members.count ?? 0,
        clientCount: clients.count ?? 0,
        docsCount: allDocs.count ?? 0,
      };
    },
    refetchOnWindowFocus: true,
  });

  const c = counts ?? {
    authSourcesCount: 0,
    sowCount: 0,
    attestationCount: 0,
    memberCount: 0,
    clientCount: 0,
    docsCount: 0,
  };

  // --- Step completion ------------------------------------------------------
  const step1Complete = c.sowCount > 0 && c.attestationCount > 0;
  const step2Complete = profileSavedLocal;
  const step3Complete = c.memberCount > 1; // beyond the founding owner
  const step4Complete = c.clientCount > 0;
  const step5Complete = servicesVisited;
  const step6Complete = c.docsCount > 0;

  const steps = useMemo(
    () => [
      { n: 1, key: "sources", title: "Upload your authoritative sources", done: step1Complete, locked: false, href: "/dashboard/authoritative-sources" as const },
      { n: 2, key: "profile", title: "Tell NECTAR about your agency", done: step2Complete, locked: !step1Complete, href: "/dashboard/nectar-company-profile" as const },
      { n: 3, key: "staff", title: "Add your staff", done: step3Complete, locked: !step1Complete, href: "/dashboard/employees" as const },
      { n: 4, key: "clients", title: "Add your clients", done: step4Complete, locked: !step1Complete, href: "/dashboard/clients" as const },
      { n: 5, key: "services", title: "Configure your service codes", done: step5Complete, locked: !step1Complete, href: "/dashboard/settings/service-codes" as const },
      { n: 6, key: "docs", title: "Company Documents hub", done: step6Complete, locked: !step1Complete, href: "/dashboard/nectar-docs" as const },
    ],
    [step1Complete, step2Complete, step3Complete, step4Complete, step5Complete, step6Complete],
  );


  const completedCount = steps.filter((s) => s.done).length;
  const allComplete = completedCount === steps.length;

  // First unfinished, unlocked step is "active" by default
  const defaultActiveStep =
    steps.find((s) => !s.done && !s.locked)?.n ?? steps.find((s) => !s.done)?.n ?? 1;
  const activeStep = activeStepOverride ?? defaultActiveStep;

  // --- Visibility -----------------------------------------------------------
  // Hide if: dismissed, no org loaded, or all complete and not freshly welcomed
  const shouldShow =
    !!orgId &&
    !dismissed &&
    (welcomeFlag || !allComplete);

  // Auto-dismiss once all complete (one-time)
  useEffect(() => {
    if (orgId && allComplete && !dismissed) {
      // Don't auto-dismiss on the same render; let the user see the success state.
      // Provide a button below to dismiss.
    }
  }, [orgId, allComplete, dismissed]);

  if (!shouldShow || !orgId) return null;

  const dismiss = () => {
    writeLS(lsKey(orgId, "dismissed"), true);
    setDismissed(true);
  };

  const saveProfile = () => {
    writeLS(lsKey(orgId, "profile"), profileDraft);
    writeLS(lsKey(orgId, "profile_saved"), true);
    setProfileSavedLocal(true);
    setActiveStepOverride(3);
  };

  const markServicesVisited = () => {
    writeLS(lsKey(orgId, "services_visited"), true);
    setServicesVisited(true);
  };

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[color:var(--amber-400,#f4a93a)]/40 bg-gradient-to-br from-[#0b1733] via-[#0d1a3a] to-[#0b1733] text-amber-50 shadow-xl"
      aria-label="NECTAR onboarding"
    >
      {/* Hex backdrop accent */}
      <div className="pointer-events-none absolute -right-12 -top-12 opacity-20">
        <Hexagon className="h-56 w-56 text-[color:var(--amber-400,#f4a93a)]" strokeWidth={1} />
      </div>

      {/* Header */}
      <div className="relative flex flex-col gap-4 border-b border-amber-300/15 px-5 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--amber-500,#f4a93a)] text-[#0b1733]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-400,#f4a93a)]">
                NECTAR · Onboarding
              </div>
              <h2 className="font-display text-xl font-semibold tracking-tight text-amber-50 sm:text-2xl">
                {allComplete
                  ? `You're set up, ${adminFirstName}.`
                  : `Hi ${adminFirstName}, I'm NECTAR.`}
              </h2>
            </div>
          </div>
          {allComplete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={dismiss}
              className="shrink-0 text-amber-100 hover:bg-white/10 hover:text-amber-50"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="max-w-3xl text-sm leading-relaxed text-amber-100/90">
          {allComplete
            ? `I've read ${orgName}'s governing documents, I know your team and your clients, and I'm ready to help. Ask me anything from the NECTAR panel at any time.`
            : `Before I can help you schedule, document, or audit anything accurately, I need to understand ${orgName}'s authoritative sources: your Scope of Work, your policies, and your operating requirements. Let's get those uploaded first — everything else follows from there.`}
        </p>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-amber-200/80">
            <span>Setup progress</span>
            <span>
              {completedCount} of {steps.length} complete
            </span>
          </div>
          <Progress
            value={(completedCount / steps.length) * 100}
            className="h-2 bg-white/10 [&>div]:bg-[color:var(--amber-400,#f4a93a)]"
          />
        </div>

        {allComplete && (
          <Button
            onClick={dismiss}
            className="self-start bg-[color:var(--amber-500,#f4a93a)] text-[#0b1733] hover:bg-[color:var(--amber-400,#f4a93a)]"
          >
            Dismiss & go to dashboard
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Body */}
      {!allComplete && (
        <div className="relative grid gap-4 px-5 py-5 sm:px-7 lg:grid-cols-[260px_1fr]">
          {/* Checklist rail */}
          <ol className="space-y-1.5">
            {steps.map((s) => {
              const Icon =
                s.key === "sources"
                  ? Upload
                  : s.key === "profile"
                    ? Building2
                    : s.key === "staff"
                      ? Users
                      : s.key === "clients"
                        ? UserSquare2
                        : s.key === "services"
                          ? SettingsIcon
                          : FolderOpen;
              const isActive = activeStep === s.n;
              const cardClass = cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                s.done
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  : isActive
                    ? "border-[color:var(--amber-400,#f4a93a)]/60 bg-amber-400/10 text-amber-50"
                    : s.locked
                      ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-amber-100/40"
                      : "border-white/10 bg-white/[0.03] text-amber-100/80 hover:border-amber-300/30 hover:bg-white/[0.05]",
              );
              const iconBubble = (
                <span
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    s.done
                      ? "bg-emerald-500/20 text-emerald-200"
                      : s.locked
                        ? "bg-white/5 text-amber-100/30"
                        : "bg-[color:var(--amber-500,#f4a93a)]/20 text-[color:var(--amber-400,#f4a93a)]",
                  )}
                >
                  {s.done ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : s.locked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </span>
              );
              const labelBlock = (
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wide opacity-70">
                    Step {s.n}
                  </span>
                  <span className="block text-xs font-medium leading-tight">{s.title}</span>
                  {s.locked && (
                    <span className="mt-0.5 block text-[10px] opacity-60">
                      Complete Step 1 first
                    </span>
                  )}
                </span>
              );
              return (
                <li key={s.key}>
                  {s.locked ? (
                    <button
                      type="button"
                      disabled
                      title="Complete Step 1 first."
                      aria-label={`${s.title} — locked until Step 1 is complete`}
                      className={cardClass}
                    >
                      {iconBubble}
                      {labelBlock}
                    </button>
                  ) : (
                    <Link
                      to={s.href}
                      search={{ from: "onboarding", step: s.n } as never}
                      onClick={() => setActiveStepOverride(s.n)}
                      className={cardClass}
                    >
                      {iconBubble}
                      {labelBlock}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>


          {/* Active step body */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-amber-50/95 backdrop-blur">
            {activeStep === 1 && (
              <Step1Sources
                orgId={orgId}
                counts={c}
                onChanged={() => refetchCounts()}
              />
            )}
            {activeStep === 2 && (
              <Step2Profile
                draft={profileDraft}
                setDraft={setProfileDraft}
                onSave={saveProfile}
                disabled={!step1Complete}
                saved={profileSavedLocal}
              />
            )}
            {activeStep === 3 && (
              <Step3Staff orgId={orgId} memberCount={c.memberCount} disabled={!step1Complete} />
            )}
            {activeStep === 4 && (
              <Step4Clients clientCount={c.clientCount} disabled={!step1Complete} />
            )}
            {activeStep === 5 && (
              <Step5Services
                disabled={!step1Complete}
                visited={servicesVisited}
                onVisit={markServicesVisited}
              />
            )}
            {activeStep === 6 && (
              <Step6Docs docsCount={c.docsCount} disabled={!step1Complete} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------
// Step 1 — Authoritative sources
// --------------------------------------------------------------------------

const DOC_TYPES: Array<{
  kind: "state_sow" | "other" | "provider_contract" | "dspd_requirement" | "dhs_requirement";
  label: string;
  required?: boolean;
  hint: string;
}> = [
  { kind: "state_sow", label: "State Scope of Work (SOW)", required: true, hint: "The most important — start here." },
  { kind: "other", label: "Agency policies & procedures", hint: "Your internal operating policies." },
  { kind: "provider_contract", label: "Provider contract", hint: "Your DSPD provider contract." },
  { kind: "dspd_requirement", label: "DSPD requirement documents", hint: "Any active DSPD requirement memos." },
  { kind: "dhs_requirement", label: "DHS requirement documents", hint: "Licensing and DHS requirement docs." },
];

function Step1Sources({
  orgId,
  counts,
  onChanged,
}: {
  orgId: string;
  counts: { sowCount: number; authSourcesCount: number; attestationCount: number };
  onChanged: () => void;
}) {
  const sowUploaded = counts.sowCount > 0;
  const canAttest = sowUploaded && counts.attestationCount === 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-400,#f4a93a)]">
          Step 1 · Required
        </div>
        <h3 className="mt-0.5 font-display text-lg font-semibold text-amber-50">
          Upload your authoritative sources
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-amber-100/85">
          These are the documents that define what you're required to do and how.
          Once uploaded, I'll read them and use them to guide your scheduling,
          documentation, incident reporting, and billing. Start with your State
          Scope of Work — it's the most important.
        </p>
      </div>

      <AuthoritativeSourceDrop orgId={orgId} onUploaded={onChanged}>
        <ul className="space-y-2">
          {DOC_TYPES.map((dt) => (
            <li key={dt.kind}>
              <Link
                to="/dashboard/authoritative-sources"
                search={{ from: "onboarding", step: 1, type: dt.kind } as never}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-2.5 transition hover:border-[color:var(--amber-400,#f4a93a)]/60 hover:bg-amber-400/10",
                  dt.required && !sowUploaded
                    ? "border-[color:var(--amber-400,#f4a93a)]/50 bg-amber-400/5"
                    : "border-white/10 bg-white/[0.03]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                    dt.kind === "state_sow" && sowUploaded
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "bg-white/10 text-amber-200",
                  )}
                >
                  {dt.kind === "state_sow" && sowUploaded ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-amber-50">{dt.label}</span>
                    {dt.required && (
                      <span className="rounded-full bg-[color:var(--amber-500,#f4a93a)]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--amber-400,#f4a93a)]">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-amber-100/70">{dt.hint}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-amber-100/40" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-amber-100/70">
          Drag any document onto this page to add it — I'll propose a label,
          you confirm, and it joins the source-of-truth set.
        </p>
      </AuthoritativeSourceDrop>


      {sowUploaded && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3 text-sm text-emerald-100">
          <strong className="font-semibold">Got it.</strong> I've read your SOW
          and I'm already using it. Upload more or move on — but first, please
          attest below.
        </div>
      )}

      {sowUploaded && (
        <AttestationBanner
          organizationId={orgId}
          scope="document_upload"
          mode={canAttest ? "confirm" : "nudge"}
          statement="I confirm these documents accurately represent our agency's current governing requirements and that I am authorized to upload them on behalf of this organization."
          onConfirmed={onChanged}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 2 — Company profile
// --------------------------------------------------------------------------

function Step2Profile({
  draft,
  setDraft,
  onSave,
  disabled,
  saved,
}: {
  draft: ProfileDraft;
  setDraft: (d: ProfileDraft) => void;
  onSave: () => void;
  disabled: boolean;
  saved: boolean;
}) {
  if (disabled) return <LockedNotice />;

  const toggleService = (s: Service) => {
    setDraft({
      ...draft,
      services: draft.services.includes(s)
        ? draft.services.filter((x) => x !== s)
        : [...draft.services, s],
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-400,#f4a93a)]">
          Step 2
        </div>
        <h3 className="mt-0.5 font-display text-lg font-semibold text-amber-50">
          Tell me a bit about your operations
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-amber-100/85">
          A few details so I can calibrate my guidance to your agency.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <Label className="text-xs text-amber-100/90">Services you provide</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {SERVICE_OPTIONS.map((s) => {
              const active = draft.services.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleService(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    active
                      ? "border-[color:var(--amber-400,#f4a93a)] bg-[color:var(--amber-500,#f4a93a)] text-[#0b1733]"
                      : "border-white/15 bg-white/[0.04] text-amber-100/80 hover:border-amber-300/40",
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-amber-100/90">Approx. clients served</Label>
            <Input
              inputMode="numeric"
              value={draft.clientCount}
              onChange={(e) => setDraft({ ...draft, clientCount: e.target.value })}
              className="mt-1 border-white/15 bg-white/5 text-amber-50 placeholder:text-amber-100/40"
              placeholder="e.g. 24"
            />
          </div>
          <div>
            <Label className="text-xs text-amber-100/90">Approx. active staff</Label>
            <Input
              inputMode="numeric"
              value={draft.staffCount}
              onChange={(e) => setDraft({ ...draft, staffCount: e.target.value })}
              className="mt-1 border-white/15 bg-white/5 text-amber-50 placeholder:text-amber-100/40"
              placeholder="e.g. 35"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs text-amber-100/90">Service area or counties</Label>
          <Input
            value={draft.serviceArea}
            onChange={(e) => setDraft({ ...draft, serviceArea: e.target.value })}
            className="mt-1 border-white/15 bg-white/5 text-amber-50 placeholder:text-amber-100/40"
            placeholder="e.g. Salt Lake, Davis, Weber"
          />
        </div>

        <div>
          <Label className="text-xs text-amber-100/90">Specializations (optional)</Label>
          <Textarea
            rows={2}
            value={draft.specializations}
            onChange={(e) => setDraft({ ...draft, specializations: e.target.value })}
            className="mt-1 border-white/15 bg-white/5 text-amber-50 placeholder:text-amber-100/40"
            placeholder="Behavioral support, medically complex, dual-diagnosis…"
          />
        </div>

        <div className="flex items-center justify-end pt-1">
          <Button
            onClick={onSave}
            className="bg-[color:var(--amber-500,#f4a93a)] text-[#0b1733] hover:bg-[color:var(--amber-400,#f4a93a)]"
          >
            {saved ? "Update profile" : "Save & continue"}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 3 — Staff
// --------------------------------------------------------------------------

function Step3Staff({
  memberCount,
  disabled,
}: {
  orgId: string;
  memberCount: number;
  disabled: boolean;
}) {
  if (disabled) return <LockedNotice />;
  // memberCount includes the founding admin — show meaningful counts.
  const invited = 0;
  const inProgress = 0;
  const complete = Math.max(0, memberCount);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-400,#f4a93a)]">
          Step 3
        </div>
        <h3 className="mt-0.5 font-display text-lg font-semibold text-amber-50">
          Add your staff
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-amber-100/85">
          Add your staff members here. Once they're in the system, I can help
          you schedule them, track their credentials, and make sure they're
          compliant.
        </p>
      </div>

      <div className="rounded-xl bg-white/[0.04] p-1">
        <OnboardingPipelineCard counts={{ invited, inProgress, complete }} />
      </div>

      <Button asChild className="bg-[color:var(--amber-500,#f4a93a)] text-[#0b1733] hover:bg-[color:var(--amber-400,#f4a93a)]">
        <Link to="/dashboard/employees">
          Go to Employees <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 4 — Clients
// --------------------------------------------------------------------------

function Step4Clients({ clientCount, disabled }: { clientCount: number; disabled: boolean }) {
  if (disabled) return <LockedNotice />;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-400,#f4a93a)]">
          Step 4
        </div>
        <h3 className="mt-0.5 font-display text-lg font-semibold text-amber-50">
          Add your clients
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-amber-100/85">
          Add your clients next. Their profiles, PCSPs, and billing codes are
          what I use to make sure every shift and every medication pass is
          documented correctly.
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-amber-100/85">
        <strong className="font-semibold text-amber-50">{clientCount}</strong>{" "}
        client{clientCount === 1 ? "" : "s"} added so far.
      </div>
      <Button asChild className="bg-[color:var(--amber-500,#f4a93a)] text-[#0b1733] hover:bg-[color:var(--amber-400,#f4a93a)]">
        <Link to="/dashboard/clients">
          Go to Clients <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 5 — Service codes
// --------------------------------------------------------------------------

function Step5Services({
  disabled,
  visited,
  onVisit,
}: {
  disabled: boolean;
  visited: boolean;
  onVisit: () => void;
}) {
  if (disabled) return <LockedNotice />;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-400,#f4a93a)]">
          Step 5
        </div>
        <h3 className="mt-0.5 font-display text-lg font-semibold text-amber-50">
          Configure your service codes
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-amber-100/85">
          Set up the billing codes for the services you provide. This is what
          connects your shifts to Medicaid billing and EVV — I'll flag any
          mismatches automatically.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild onClick={onVisit} className="bg-[color:var(--amber-500,#f4a93a)] text-[#0b1733] hover:bg-[color:var(--amber-400,#f4a93a)]">
          <Link to="/dashboard/settings/service-codes">
            Open service codes <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
        {!visited && (
          <Button variant="outline" onClick={onVisit} className="border-amber-300/40 bg-transparent text-amber-50 hover:bg-white/10">
            Mark as configured
          </Button>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Step 6 — Docs hub
// --------------------------------------------------------------------------

function Step6Docs({ docsCount, disabled }: { docsCount: number; disabled: boolean }) {
  if (disabled) return <LockedNotice />;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-400,#f4a93a)]">
          Step 6
        </div>
        <h3 className="mt-0.5 font-display text-lg font-semibold text-amber-50">
          Company documents hub
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-amber-100/85">
          This is where all your agency documents live — PCSPs, intake records,
          certifications, training records, and everything else. I read every
          document you upload and use it to answer questions and flag
          compliance gaps.
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-amber-100/85">
        <strong className="font-semibold text-amber-50">{docsCount}</strong>{" "}
        document{docsCount === 1 ? "" : "s"} on file (authoritative sources count too).
      </div>
      <Button asChild className="bg-[color:var(--amber-500,#f4a93a)] text-[#0b1733] hover:bg-[color:var(--amber-400,#f4a93a)]">
        <Link to="/dashboard/nectar-docs">
          Open Company Documents <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

function LockedNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-amber-100/70">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium text-amber-50">Complete Step 1 first.</p>
        <p>
          I need to read your authoritative sources before the rest of setup
          unlocks — that's what lets me give accurate guidance everywhere else.
        </p>
      </div>
    </div>
  );
}

// Keep eslint happy when chevron icons aren't used in this file's body
void ChevronDown;
void ChevronUp;
