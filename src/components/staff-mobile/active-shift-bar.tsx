import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useActiveShift } from "@/hooks/use-active-shift";

function fmtElapsed(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Persistent "clocked-in" status bar. Renders only while an EVV shift is
 * active. Anchored above the bottom tab bar via its parent shell (no fixed
 * positioning here), so page content scrolls above it naturally.
 */
export function ActiveShiftBar({ framed = false }: { framed?: boolean }) {
  const { data: active } = useActiveShift();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);

  if (!active) return null;

  const elapsed = fmtElapsed(now - new Date(active.clock_in_timestamp).getTime());

  const openTimeClock = () =>
    navigate({
      to: "/dashboard/workspace/$clientId",
      params: { clientId: active.client_id },
    });

  const handleClockOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`End shift for ${active.client_name}?`)) {
      // The real clock-out flow (GPS + narrative + compliance) lives on the
      // Time Clock screen. Route the user there to complete the punch-out.
      openTimeClock();
    }
  };

  const positioning = framed
    ? "absolute inset-x-0 bottom-[56px] z-40"
    : "fixed inset-x-0 z-40 md:hidden";

  return (
    <div
      className={[
        positioning,
        "select-none text-white",
        "bg-[#117a52] border-t border-[#0d5c3d] shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.35)]",
      ].join(" ")}
      style={
        framed
          ? undefined
          : { bottom: "calc(env(safe-area-inset-bottom) + 56px)" }
      }
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={openTimeClock}
        className="flex w-full items-center gap-3 px-3 py-2 text-left active:bg-[#0f6b48]"
      >
        {/* Pulsing live dot */}
        <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#15a06a] opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#15a06a] ring-2 ring-white/70" />
        </span>

        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold">
            Clocked in · {active.client_name}
          </p>
          <p className="truncate text-[11px] text-white/80">
            {active.evv_live ? "EVV live" : "EVV pending"} · {active.service_type_code}
          </p>
        </div>

        <span className="shrink-0 font-mono text-base font-semibold tabular-nums">
          {elapsed}
        </span>

        <span
          role="button"
          tabIndex={0}
          onClick={handleClockOut}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleClockOut(e as unknown as React.MouseEvent);
            }
          }}
          className="ml-1 inline-flex min-h-[36px] shrink-0 cursor-pointer items-center rounded-md bg-white/15 px-3 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={`Clock out of shift for ${active.client_name}`}
        >
          Clock out
        </span>
      </button>
    </div>
  );
}
