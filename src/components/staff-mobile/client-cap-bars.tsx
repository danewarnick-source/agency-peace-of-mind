import { Clock, CalendarDays } from "lucide-react";
import { useClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { useClientUtilization, getUsage } from "@/hooks/use-client-utilization";
import { useTimePaySettings } from "@/hooks/use-time-pay-settings";
import { isDailyServiceCode } from "@/lib/service-billing";
import { capTone, unitsToHours, fmtHours, fmtUnits } from "@/lib/billing-units";

function toneClasses(tone: "ok" | "warn" | "over") {
  if (tone === "over") return { bar: "bg-[#dc2626]", chip: "bg-[#fde2e2] text-[#991b1b]" };
  if (tone === "warn") return { bar: "bg-[#f59324]", chip: "bg-[#fde9c8] text-[#7a4308]" };
  return { bar: "bg-[#15a06a]", chip: "bg-[#dff5e8] text-[#0d5c3d]" };
}

/**
 * Per-code utilization bars on the caseload card. Shows the client's
 * weekly hourly cap or monthly daily-attendance cap with the staff
 * member's own share called out. Only renders codes this staff is
 * actually assigned for the client.
 */
export function ClientCapBars({
  clientId,
  codes,
}: {
  clientId: string;
  codes: string[];
}) {
  const { data: billing } = useClientBillingCodes(clientId);
  const { data: usage } = useClientUtilization();
  const { settings } = useTimePaySettings();
  const warnPct = settings.cap_warn_pct ?? 90;

  if (!codes.length) return null;
  const rows = codes
    .map((code) => billing?.find((b) => b.service_code === code))
    .filter((b): b is NonNullable<typeof b> => !!b);
  if (!rows.length) return null;

  return (
    <ul className="mt-3 flex flex-col gap-2">
      {rows.map((b) => {
        const u = getUsage(usage, clientId, b.service_code);
        const isDaily = isDailyServiceCode(b.service_code);

        if (isDaily) {
          const cap = b.monthly_max_units ?? 0; // monthly_max_units holds day count for daily codes
          const used = u?.all_staff_days ?? 0;
          const mine = u?.my_days ?? 0;
          const pct = cap > 0 ? Math.min(200, (used / cap) * 100) : 0;
          const tone = capTone(pct, warnPct);
          const t = toneClasses(tone);
          const left = Math.max(0, cap - used);
          return (
            <li key={b.service_code} className="rounded-lg border border-border bg-background/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                  <CalendarDays className="h-3.5 w-3.5 text-[color:var(--amber-700,#d97a1c)]" />
                  {b.service_code}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${t.chip}`}>
                  {used} / {cap || "—"} days
                </span>
              </div>
              {cap > 0 && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full ${t.bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              )}
              <p className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
                <span>You: <span className="font-mono font-semibold text-foreground">{mine}</span> days</span>
                <span>{cap > 0 ? `${left} day${left === 1 ? "" : "s"} left this month` : "No cap set"}</span>
              </p>
            </li>
          );
        }

        // Hourly code — weekly cap (units → hours)
        const capUnits = b.weekly_cap_units ?? 0;
        const capHours = unitsToHours(capUnits);
        const used = u?.all_staff_hours ?? 0;
        const mine = u?.my_hours ?? 0;
        const pct = capHours > 0 ? Math.min(200, (used / capHours) * 100) : 0;
        const tone = capTone(pct, warnPct);
        const t = toneClasses(tone);
        const left = Math.max(0, capHours - used);
        return (
          <li key={b.service_code} className="rounded-lg border border-border bg-background/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                <Clock className="h-3.5 w-3.5 text-[color:var(--amber-700,#d97a1c)]" />
                {b.service_code}
              </span>
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${t.chip}`}>
                {fmtHours(used)} / {capHours > 0 ? fmtHours(capHours) : "—"} hrs
              </span>
            </div>
            {capHours > 0 && (
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${t.bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            )}
            <p className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
              <span>You: <span className="font-mono font-semibold text-foreground">{fmtHours(mine)}</span> hrs</span>
              <span>
                {capHours > 0
                  ? `${fmtHours(left)} hrs left · ${fmtUnits(capUnits)} u/wk cap`
                  : "No weekly cap set"}
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
