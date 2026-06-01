import { X } from "lucide-react";
import { NectarBadge, NectarMark } from "@/components/nectar/nectar-brand";
import type { ActiveCelebration } from "@/lib/celebrations.functions";

export function CelebrationBanner({
  celebration,
  onDismiss,
}: {
  celebration: ActiveCelebration;
  onDismiss: () => void;
}) {
  const meta = describeCelebration(celebration);
  return (
    <div
      role="status"
      className="relative overflow-hidden rounded-2xl border border-[#f4a93a]/40 bg-gradient-to-r from-[#fff8ec] to-[#fef0d6] p-4 shadow-glow"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -bottom-12 h-48 w-48 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(244,169,58,0.22), transparent 70%)" }}
      />
      <div className="relative flex items-start gap-3">
        <NectarMark size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <NectarBadge size="xs" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7a4a0a]">
              Worth celebrating
            </span>
          </div>
          <p className="mt-1 font-display text-base font-semibold text-[#0d112b]">{meta.title}</p>
          <p className="text-sm text-[#4a5168]">{meta.detail}</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#7a4a0a] hover:bg-[#f4a93a]/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function describeCelebration(c: ActiveCelebration): { title: string; detail: string } {
  const key = c.eventKey;
  if (key.startsWith("training.completed")) {
    return { title: "Training complete!", detail: "All assigned modules are done." };
  }
  if (key === "training.org_full_completion") {
    return { title: "Whole team is fully trained.", detail: "Every active staff member finished their assignments." };
  }
  if (key === "onboarding.first_completed") {
    return { title: "First staff member onboarded.", detail: "A milestone moment — congrats on launching." };
  }
  if (key === "compliance.threshold_100") {
    return { title: "100% credential compliance.", detail: "Every staff cert is current. NECTAR is impressed." };
  }
  if (key.startsWith("cert.renewed_early")) {
    return { title: "Certification renewed early.", detail: "Ahead of expiry — clean compliance." };
  }
  if (key.startsWith("streak.")) {
    const days = key.split(".")[1] ?? "";
    return { title: `${days}-day streak.`, detail: "Consistent EVV clock-ins. Sweet." };
  }
  if (key.startsWith("onboarding.completed_quickly")) {
    return { title: "Fast onboarding!", detail: "Up and running in under a week." };
  }
  return { title: "Nice work.", detail: "A new milestone just landed." };
}
