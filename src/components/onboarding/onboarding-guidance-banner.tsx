import { useEffect, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const COPY: Record<number, { title: string; body: string }> = {
  1: {
    title: "Upload your governing documents",
    body:
      "Upload your governing documents here. Start with your State Scope of Work — it's the most important. Drag and drop or browse for each file, choose its document type, and I'll read it and start using it to guide your compliance. Once your SOW is uploaded and you've signed off, your other setup steps unlock.",
  },
  2: {
    title: "Tell me about your operations",
    body:
      "Tell me about your operations — the services you provide, how many clients and staff you have, and any specializations. This calibrates how I guide your scheduling, documentation, and compliance.",
  },
  3: {
    title: "Add your staff members",
    body:
      "Add your staff members here. You can add them one at a time or invite them to complete their own profiles. Once they're in the system, I can help you schedule them and track their credentials.",
  },
  4: {
    title: "Add your clients",
    body:
      "Add your clients here. Their profiles, PCSPs, and service authorizations are what I use to make sure every shift and medication pass is documented correctly.",
  },
  5: {
    title: "Configure your service codes",
    body:
      "Set up the billing codes for the services you provide. This connects your shifts to Medicaid billing and EVV, and lets me flag mismatches automatically.",
  },
  6: {
    title: "Your company documents hub",
    body:
      "This is where all your agency documents live. I read everything you upload and use it to answer questions and flag compliance gaps.",
  },
};

/**
 * Amber NECTAR guidance banner shown at the top of a destination page when
 * the user arrived from the onboarding flow (?from=onboarding&step=N).
 * Dismissible per-step via sessionStorage so it stays out of the way once
 * the operator has read it for that visit.
 */
export function OnboardingGuidanceBanner({ step }: { step: number }) {
  const search = useSearch({ strict: false }) as
    | { from?: string; step?: string | number }
    | undefined;
  const fromOnboarding = search?.from === "onboarding";
  const stepInUrl = search?.step != null ? Number(search.step) : step;
  const dismissKey = `nectar_guidance_dismissed_step_${step}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDismissed = window.sessionStorage.getItem(dismissKey) === "1";
    setDismissed(isDismissed);
  }, [dismissKey]);

  if (!fromOnboarding || stepInUrl !== step || dismissed) return null;
  const copy = COPY[step];
  if (!copy) return null;

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-[color:var(--amber-400,#f4a93a)]/50 bg-gradient-to-br from-[#0b1733] via-[#0d1a3a] to-[#0b1733] p-4 text-amber-50 shadow-lg sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--amber-500,#f4a93a)] text-[#0b1733]">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-400,#f4a93a)]">
            NECTAR · Setup step {step}
          </div>
          <h3 className="mt-0.5 font-display text-base font-semibold text-amber-50">
            {copy.title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-amber-100/90">
            {copy.body}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem(dismissKey, "1");
            }
            setDismissed(true);
          }}
          className="shrink-0 text-amber-100 hover:bg-white/10 hover:text-amber-50"
          aria-label="Dismiss NECTAR guidance"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
