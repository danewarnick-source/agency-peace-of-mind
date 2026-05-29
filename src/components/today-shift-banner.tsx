import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Rocket, Clock } from "lucide-react";
import { useTodayShift } from "@/hooks/use-today-shift";

export function TodayShiftBanner() {
  const { shift, active } = useTodayShift();
  if (!shift && !active) return null;

  // If actively clocked in, route them back to that client workspace.
  if (active) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-warning/20 text-warning-foreground">
              <Clock className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">⏱ Shift in progress</p>
              <p className="text-xs text-muted-foreground">
                You are clocked in on <span className="font-mono">{active.service_type_code}</span>. Return to finish your shift.
              </p>
            </div>
          </div>
          <Button asChild size="default" className="shrink-0">
            <Link
              to="/dashboard/workspace/$clientId"
              params={{ clientId: active.client_id }}
              search={{ tab: "clock-in" }}
            >
              Return to Active Shift
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!shift) return null;
  const code = shift.job_code ?? "";
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/20 text-accent">
            <Rocket className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">✨ Start Today&apos;s Shift</p>
            <p className="text-xs text-muted-foreground">
              You are scheduled with <span className="font-semibold text-foreground">{shift.client_name}</span>
              {code ? <> for <span className="font-mono">{code}</span></> : null}.
            </p>
          </div>
        </div>
        <Button asChild size="default" className="shrink-0">
          <Link
            to="/dashboard/workspace/$clientId"
            params={{ clientId: shift.client_id }}
            search={{ tab: "clock-in", ...(code ? { code } : {}) }}
          >
            <Rocket className="h-4 w-4" />
            Start Shift Now
          </Link>
        </Button>
      </div>
    </div>
  );
}
