import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { X, ChevronLeft, ChevronRight, SkipForward, Pause } from "lucide-react";
import { findAnchor } from "@/lib/nectar/tour-anchors";
import type { GuideStep, GuideTask } from "@/lib/nectar-guide.functions";

interface ActiveTour {
  task: GuideTask;
  stepIndex: number;
  onComplete?: () => void;
  onStepChange?: (index: number) => void;
}

interface Ctx {
  start: (task: GuideTask, opts?: { onComplete?: () => void; onStepChange?: (i: number) => void }) => void;
  stop: () => void;
  active: ActiveTour | null;
}

const TourCtx = createContext<Ctx | null>(null);

export function useGuidedTour() {
  const ctx = useContext(TourCtx);
  if (!ctx) throw new Error("useGuidedTour must be used inside GuidedTourProvider");
  return ctx;
}

export function GuidedTourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveTour | null>(null);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const start: Ctx["start"] = useCallback((task, opts) => {
    if (!task.steps || task.steps.length === 0) return;
    setActive({ task, stepIndex: Math.min(task.current_step ?? 0, task.steps.length - 1), onComplete: opts?.onComplete, onStepChange: opts?.onStepChange });
  }, []);

  const stop = useCallback(() => setActive(null), []);

  // navigate when current step requires a different route
  useEffect(() => {
    if (!active) return;
    const step = active.task.steps[active.stepIndex];
    if (!step) return;
    const anchor = findAnchor(step.anchor);
    const route = step.route ?? anchor?.route;
    if (route && route !== pathname) {
      navigate({ to: route });
    }
  }, [active, pathname, navigate]);

  return (
    <TourCtx.Provider value={{ start, stop, active }}>
      {children}
      {active && (
        <TourOverlay
          tour={active}
          onAdvance={() => {
            const next = active.stepIndex + 1;
            if (next >= active.task.steps.length) {
              active.onComplete?.();
              setActive(null);
            } else {
              active.onStepChange?.(next);
              setActive({ ...active, stepIndex: next });
            }
          }}
          onBack={() => {
            if (active.stepIndex === 0) return;
            const prev = active.stepIndex - 1;
            active.onStepChange?.(prev);
            setActive({ ...active, stepIndex: prev });
          }}
          onSkip={() => {
            const next = active.stepIndex + 1;
            if (next >= active.task.steps.length) {
              setActive(null);
            } else {
              setActive({ ...active, stepIndex: next });
            }
          }}
          onClose={() => setActive(null)}
        />
      )}
    </TourCtx.Provider>
  );
}

// --- Overlay ---

interface Rect { top: number; left: number; width: number; height: number }

function TourOverlay({
  tour, onAdvance, onBack, onSkip, onClose,
}: {
  tour: ActiveTour;
  onAdvance: () => void;
  onBack: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const step: GuideStep | undefined = tour.task.steps[tour.stepIndex];
  const [rect, setRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.anchor}"]`) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    // try to scroll into view
    if (r.top < 60 || r.bottom > window.innerHeight - 60) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [step]);

  // poll for anchor (route may not have mounted yet)
  useLayoutEffect(() => {
    measure();
    const t = setInterval(measure, 300);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [measure, pathname]);

  // position tooltip near the rect
  useLayoutEffect(() => {
    if (!rect || !tooltipRef.current) return;
    const tw = tooltipRef.current.offsetWidth;
    const th = tooltipRef.current.offsetHeight;
    let top = rect.top + rect.height + 12;
    let left = rect.left + rect.width / 2 - tw / 2;
    if (top + th > window.innerHeight - 12) top = Math.max(12, rect.top - th - 12);
    left = Math.max(12, Math.min(left, window.innerWidth - tw - 12));
    setTooltipPos({ top, left });
  }, [rect]);

  // Advance on click of the anchor element
  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.anchor}"]`) as HTMLElement | null;
    if (!el) return;
    const handler = () => setTimeout(onAdvance, 200);
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [step, onAdvance, rect]);

  if (typeof window === "undefined") return null;

  const total = tour.task.steps.length;
  const looking = !rect;

  const overlay = (
    <div className="pointer-events-none fixed inset-0 z-[9998]">
      {/* Navy dim overlay with cutout */}
      <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="nectar-tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - 8}
                y={rect.top - 8}
                width={rect.width + 16}
                height={rect.height + 16}
                rx="10"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(15,27,61,0.62)" mask="url(#nectar-tour-mask)" />
      </svg>
      {/* Amber spotlight ring */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-[#d97a1c] shadow-[0_0_0_4px_rgba(217,122,28,0.25)] transition-all duration-200"
          style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      )}
      {/* Tooltip — frosted card */}
      <div
        ref={tooltipRef}
        className="pointer-events-auto absolute max-w-sm rounded-xl border border-[#fed7aa] bg-white/95 p-4 shadow-2xl backdrop-blur-md"
        style={
          tooltipPos
            ? { top: tooltipPos.top, left: tooltipPos.left }
            : { top: 24, left: 24 }
        }
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#0f1b3d]/70">
            NECTAR · Step {tour.stepIndex + 1} of {total}
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Exit tour">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="font-display text-sm font-semibold text-[#0f1b3d]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {tour.task.title}
        </div>
        <p className="mt-1 text-sm text-[#0f1b3d]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {step?.instruction ?? "—"}
        </p>
        {looking && (
          <p className="mt-2 text-[11px] italic text-[#9a3412]">
            Looking for the element… if this persists, the control may not be on this page.
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onBack}
              disabled={tour.stepIndex === 0}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50 hover:bg-muted"
            >
              <ChevronLeft className="h-3 w-3" /> Back
            </button>
            <button
              onClick={onSkip}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              <SkipForward className="h-3 w-3" /> Skip
            </button>
            <button
              onClick={onClose}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              <Pause className="h-3 w-3" /> Pause
            </button>
          </div>
          <button
            onClick={onAdvance}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-[#d97a1c] px-3 py-1 text-xs font-semibold text-white shadow hover:bg-[#b8651a]"
          >
            {tour.stepIndex + 1 === total ? "Finish" : "Next"} <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
