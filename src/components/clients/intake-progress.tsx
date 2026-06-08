import { Link } from "@tanstack/react-router";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useClientIntakeProgress } from "@/hooks/use-client-intake-progress";

/**
 * Read-only intake progress bar driven by the existing intake checklist.
 * Optionally renders a "Continue intake" link when intake is incomplete.
 *
 * `intakeStatus` is the client's stored `intake_status`. We treat intake as
 * "done" only when BOTH the checklist is fully satisfied AND status is
 * `complete` — otherwise the continue affordance shows.
 */
export function IntakeProgress({
  organizationId,
  clientId,
  intakeStatus,
  size = "sm",
  showContinue = true,
  className,
}: {
  organizationId: string | undefined;
  clientId: string;
  intakeStatus: string | null | undefined;
  size?: "sm" | "md";
  showContinue?: boolean;
  className?: string;
}) {
  const { isLoading, error, hasItems, required, satisfied, isComplete, pct } =
    useClientIntakeProgress(organizationId, clientId);

  const statusComplete = intakeStatus === "complete";
  const allDone = isComplete && statusComplete;

  const wrap = size === "md" ? "space-y-1.5" : "space-y-1";
  const barH = size === "md" ? "h-2" : "h-1.5";
  const labelCls = size === "md" ? "text-xs" : "text-[10px]";

  if (isLoading) {
    return (
      <div className={`${wrap} ${className ?? ""}`}>
        <div className={`flex items-center gap-1.5 ${labelCls} text-muted-foreground`}>
          <Loader2 className="h-3 w-3 animate-spin" /> Loading intake…
        </div>
      </div>
    );
  }

  if (error) {
    // No access (gate denied) — render nothing rather than a noisy error.
    return null;
  }

  if (!hasItems) {
    return (
      <div className={`${wrap} ${className ?? ""}`}>
        <Progress value={0} className={barH} />
        <div className={`flex items-center justify-between gap-2 ${labelCls} text-muted-foreground`}>
          <span>Intake not started — no checklist items</span>
          {showContinue && !statusComplete && (
            <ContinueLink clientId={clientId} size={size} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${wrap} ${className ?? ""}`}>
      <Progress value={pct} className={barH} />
      <div className={`flex items-center justify-between gap-2 ${labelCls}`}>
        {allDone ? (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Intake complete
          </span>
        ) : (
          <span className="text-muted-foreground tabular-nums">
            {satisfied} / {required} required
          </span>
        )}
        {showContinue && !allDone && <ContinueLink clientId={clientId} size={size} />}
      </div>
    </div>
  );
}

function ContinueLink({ clientId, size }: { clientId: string; size: "sm" | "md" }) {
  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className={size === "md" ? "h-7 gap-1 text-xs" : "h-6 gap-1 px-2 text-[10px]"}
      onClick={(e) => e.stopPropagation()}
    >
      <Link to="/dashboard/client-intake/$clientId" params={{ clientId }}>
        Continue intake <ArrowRight className="h-3 w-3" />
      </Link>
    </Button>
  );
}
