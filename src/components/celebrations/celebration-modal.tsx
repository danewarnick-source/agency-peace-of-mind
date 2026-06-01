import { useEffect } from "react";
import { X } from "lucide-react";
import { HexBurst } from "./hex-burst";
import { NectarBadge, NectarButton } from "@/components/nectar/nectar-brand";
import type { ActiveCelebration } from "@/lib/celebrations.functions";
import { describeCelebration } from "./celebration-banner";

export function CelebrationModal({
  celebration,
  onClose,
}: {
  celebration: ActiveCelebration;
  onClose: () => void;
}) {
  const meta = describeCelebration(celebration);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nectar-celebration-title"
      className="fixed inset-0 z-[100] grid place-items-center bg-[#0d112b]/60 px-4"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-[#f4a93a]/40">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32"
          style={{ background: "radial-gradient(closest-side, rgba(244,169,58,0.25), transparent 70%)" }}
        />
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#7a4a0a] hover:bg-[#f4a93a]/15"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="relative grid place-items-center p-8 text-center">
          <HexBurst size={112} />
          <div className="mt-4 flex items-center justify-center gap-2">
            <NectarBadge size="sm" live />
          </div>
          <h2 id="nectar-celebration-title" className="mt-3 font-display text-2xl font-bold text-[#0d112b]">
            {meta.title}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-[#4a5168]">{meta.detail}</p>
          <div className="mt-6">
            <NectarButton variant="amber" onClick={onClose}>
              Sweet
            </NectarButton>
          </div>
        </div>
      </div>
    </div>
  );
}
