import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useActiveShift } from "@/hooks/use-active-shift";
import { useGeneralShift } from "@/hooks/use-general-shift";
import { useLivePayPeriod } from "@/hooks/use-nectar-pay-period";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function fmtElapsed(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Persistent "clocked-in" status bar. Surfaces either an EVV client shift
 * (from `evv_timesheets`) or a non-client general work shift (`general_shifts`).
 * Rendered just above the bottom tab bar via the staff mobile shell or the
 * desktop preview frame.
 */
export function ActiveShiftBar({ framed = false }: { framed?: boolean }) {
  const { data: active } = useActiveShift();
  const { shift: general, stop } = useGeneralShift();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stopping, setStopping] = useState(false);

  const live = useLivePayPeriod();

  const isClient = !!active;
  const isGeneral = !active && !!general;
  const showing = isClient || isGeneral;

  useEffect(() => {
    if (!showing) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [showing]);

  if (!showing) return null;

  const startIso = isClient ? active!.clock_in_timestamp : general!.start_iso;
  const elapsed = fmtElapsed(now - new Date(startIso).getTime());
  const title = isClient ? `Clocked in · ${active!.client_name}` : `Clocked in · ${general!.category}`;
  const subtitle = isClient
    ? `${active!.evv_live ? "EVV live" : "EVV pending"} · ${active!.service_type_code}`
    : "Non-client work · no EVV";

  const open = () => {
    if (isClient) {
      // Route to the Clock In/Out tab so the staff completes the punch +
      // paperwork there. The bar itself never finalizes the shift.
      navigate({
        to: "/dashboard/workspace/$clientId",
        params: { clientId: active!.client_id },
        search: { tab: "clock-in" },
      });
    } else {
      navigate({ to: "/dashboard/timeclock" });
    }
  };

  const onClockOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGeneral && general) {
      const note = (general.note ?? "").trim();
      if (note.length < 10) {
        navigate({ to: "/dashboard/timeclock", search: { end: "1" } as never });
        toast.error("Add a shift note, then tap End shift.");
        return;
      }
      setConfirmOpen(true);
      return;
    }
    open();
  };

  const confirmGeneralStop = async () => {
    if (!general) return;
    setStopping(true);
    try {
      const ok = await stop(general.id, { note: (general.note ?? "").trim() });
      if (!ok) {
        toast.error("Could not clock out. Try again.");
        return;
      }
      setConfirmOpen(false);
      toast.success("General shift ended");
    } finally {
      setStopping(false);
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
        onClick={open}
        className="flex w-full items-center gap-3 px-3 py-2 text-left active:bg-[#0f6b48]"
      >
        <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#15a06a] opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#15a06a] ring-2 ring-white/70" />
        </span>

        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold text-white">{title}</p>
          <p className="truncate text-[11px] text-white/80">{subtitle}</p>
        </div>

        <span className="flex shrink-0 flex-col items-end leading-tight">
          <span className="font-mono text-base font-semibold tabular-nums text-white">
            {elapsed}
          </span>
          {isClient && (
            <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--hive-gold)]">
              {fmtUSD(live.liveEarnings)}
            </span>
          )}
        </span>

        <span
          role="button"
          tabIndex={0}
          onClick={onClockOut}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClockOut(e as unknown as React.MouseEvent);
            }
          }}
          className="ml-1 inline-flex min-h-[36px] shrink-0 cursor-pointer items-center gap-1 rounded-md bg-white/15 px-3 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={isGeneral ? "Clock out of non-EVV shift" : "Go to clock-out flow (paperwork required to finalize)"}
          title={isGeneral ? "End this non-EVV / training shift" : "Opens the Clock In/Out tab — paperwork required to finalize"}
        >
          Clock out
        </span>
      </button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End {general?.category ?? "this"} shift?</AlertDialogTitle>
            <AlertDialogDescription>
              This clocks you out of the open non-EVV punch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stopping}>Keep working</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmGeneralStop();
              }}
              disabled={stopping}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {stopping ? "Ending…" : "End shift"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
