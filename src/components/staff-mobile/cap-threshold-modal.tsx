import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useActiveShift } from "@/hooks/use-active-shift";
import { useClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { useClientUtilization, getUsage } from "@/hooks/use-client-utilization";
import { useTimePaySettings } from "@/hooks/use-time-pay-settings";
import { useMobileShellContainer } from "@/components/staff-mobile/mobile-shell-context";
import { isDailyServiceCode } from "@/lib/service-billing";
import { unitsToHours, fmtHours } from "@/lib/billing-units";

/**
 * Threshold engine: while a staff member is clocked in, watches the
 * client's weekly cap for the active service code. At warn% shows an
 * acknowledge-only modal; at 100% follows the org's `cap_behavior`
 * setting (warn / acknowledge / auto_clock_out).
 */
export function CapThresholdModal() {
  const { data: active, refetch: refetchActive } = useActiveShift();
  const clientId = active?.client_id;
  const code = active?.service_type_code;
  const { data: billing } = useClientBillingCodes(clientId);
  const { data: usage } = useClientUtilization();
  const { settings } = useTimePaySettings();
  const container = useMobileShellContainer();
  const navigate = useNavigate();

  const ackedRef = useRef<Set<string>>(new Set());
  const [open, setOpen] = useState<null | { level: "warn" | "cap"; pct: number; tick: number }>(null);
  const [busy, setBusy] = useState(false);

  // live-tick so the bar/usage feel responsive while clocked in
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [active]);

  const config = useMemo(() => {
    if (!active || !clientId || !code) return null;
    if (isDailyServiceCode(code)) return null; // caps don't tick during daily shifts
    const b = billing?.find((r) => r.service_code === code);
    if (!b) return null;
    const capUnits = b.weekly_cap_units ?? 0;
    if (!capUnits) return null;
    const capHours = unitsToHours(capUnits);
    const u = getUsage(usage, clientId, code);
    const baseHours = u?.all_staff_hours ?? 0;
    const liveHours = Math.max(
      0,
      (Date.now() - new Date(active.clock_in_timestamp).getTime()) / 3_600_000,
    );
    const totalHours = baseHours + liveHours;
    const pct = capHours > 0 ? (totalHours / capHours) * 100 : 0;
    return { capHours, totalHours, pct, behavior: settings.cap_behavior, warnPct: settings.cap_warn_pct };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, billing, usage, settings, tick, code, clientId]);

  // Decide when to surface the modal
  useEffect(() => {
    if (!config || !active) {
      setOpen(null);
      return;
    }
    const { pct, behavior, warnPct } = config;
    const warnKey = `${active.id}|warn`;
    const capKey = `${active.id}|cap`;

    if (pct >= 100) {
      if (behavior === "auto_clock_out") {
        // Auto-finalize the shift right here.
        if (!busy) {
          setBusy(true);
          (async () => {
            const { error } = await supabase
              .from("evv_timesheets")
              .update({ clock_out_timestamp: new Date().toISOString() })
              .eq("id", active.id);
            setBusy(false);
            if (error) toast.error("Auto clock-out failed: " + error.message);
            else {
              toast.warning("Weekly cap reached — you've been automatically clocked out.");
              refetchActive();
            }
          })();
        }
        return;
      }
      if (behavior === "acknowledge" && !ackedRef.current.has(capKey)) {
        setOpen({ level: "cap", pct, tick });
        return;
      }
      // warn-only or already acknowledged → don't reopen
      setOpen((prev) => (prev?.level === "cap" ? prev : null));
      return;
    }

    if (pct >= warnPct && !ackedRef.current.has(warnKey)) {
      setOpen({ level: "warn", pct, tick });
      return;
    }
  }, [config, active, busy, refetchActive, tick]);

  if (!open || !active || !config || !container) return null;

  const isCap = open.level === "cap";
  const onAck = () => {
    ackedRef.current.add(`${active.id}|${open.level}`);
    setOpen(null);
  };
  const onClockOutNow = () => {
    setOpen(null);
    navigate({
      to: "/dashboard/workspace/$clientId",
      params: { clientId: active.client_id },
      search: { tab: "clock-in" },
    });
  };

  const node = (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cap-modal-title"
      className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 px-3 pb-3 pt-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#f59324]/40 bg-white shadow-xl">
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              isCap ? "bg-[#fde2e2] text-[#991b1b]" : "bg-[#fde9c8] text-[#7a4308]"
            }`}
            aria-hidden
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p
              id="cap-modal-title"
              className="text-sm font-semibold text-[color:var(--navy-900,#0d112b)]"
            >
              {isCap ? "Weekly cap reached" : "Approaching weekly cap"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {active.client_name} · {code} · {fmtHours(config.totalHours)} of {fmtHours(config.capHours)} hrs
              ({Math.round(open.pct)}%)
            </p>
          </div>
        </div>
        <div className="px-4 py-3 text-sm text-[color:var(--navy-900,#0d112b)]">
          {isCap
            ? "This client's authorized weekly hours for this service code are exhausted. Continuing may result in unpaid time. Tap Acknowledge to keep working, or finalize your shift now."
            : "You are nearing the client's authorized weekly hours for this service code. Tap Acknowledge to continue."}
        </div>
        <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onAck}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[image:var(--gradient-amber)] px-4 text-sm font-bold text-[#412402] shadow-sm active:scale-[0.98]"
          >
            Acknowledge
          </button>
          {isCap && (
            <button
              type="button"
              onClick={onClockOutNow}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground active:scale-[0.98]"
            >
              Go to Clock-Out
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(node, container);
}
