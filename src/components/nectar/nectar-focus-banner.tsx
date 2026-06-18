import { useEffect, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFocusContent } from "./nectar-focus-content";

/**
 * NECTAR guidance banner shown at the top of a destination page when the
 * operator arrived from a deep link on the admin dashboard
 * (`?focus=<key>`). The banner reads `focus` directly off the route's
 * search params — pages just need to render <NectarFocusBanner /> once at
 * the top of their component tree.
 *
 * Pure presentation: content is curated, never model-generated. Dismissals
 * persist for the session per focus key, so dismissing it on this visit
 * keeps it out of the way without permanently hiding future deep links.
 */
export function NectarFocusBanner() {
  const search = useSearch({ strict: false }) as { focus?: string } | undefined;
  const focus = typeof search?.focus === "string" ? search.focus : undefined;
  const dismissKey = focus ? `nectar_focus_dismissed_${focus}` : "";
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !dismissKey) return;
    setDismissed(window.sessionStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);

  const content = getFocusContent(focus);
  if (!content || dismissed) return null;

  return (
    <div
      role="region"
      aria-label="NECTAR guidance"
      className="relative mb-4 overflow-hidden rounded-2xl border border-[color:var(--amber-400,#f4a93a)]/50 bg-gradient-to-br from-[#0b1733] via-[#0d1a3a] to-[#0b1733] p-4 text-amber-50 shadow-lg sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--amber-500,#f4a93a)] text-[#0b1733]">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-400,#f4a93a)]">
            {content.eyebrow}
          </div>
          <h3 className="mt-0.5 font-display text-base font-semibold text-amber-50">
            {content.title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-amber-100/90">{content.why}</p>
          <ol className="mt-2 space-y-1 text-sm text-amber-100/90">
            {content.steps.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-amber-100"
                >
                  {i + 1}
                </span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (typeof window !== "undefined" && dismissKey) {
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
