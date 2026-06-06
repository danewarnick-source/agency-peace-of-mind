/**
 * Dismissible reminder bubble shown on staff dashboard for unfinished
 * "Other Trainings" assignments. Safety-critical items get extra prominence
 * and explicit "required before working alone with a client" copy.
 *
 * Per-session dismissal via sessionStorage; safety-critical items re-surface
 * each new tab/session.
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getMyOtherAssignmentsSummary } from "@/lib/other-assignments.functions";
import { Button } from "@/components/ui/button";
import { AlertTriangle, BookOpen, X, ChevronRight } from "lucide-react";

const DISMISS_KEY = "other-assignments-reminder-dismissed";

export function OtherAssignmentsReminder() {
  const fetch = useServerFn(getMyOtherAssignmentsSummary);
  const { data } = useQuery({
    queryKey: ["my-other-assignments-summary"],
    queryFn: () => fetch(),
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!data || dismissed) return null;
  if (data.open_count === 0) return null;

  const hasSafety = data.safety_critical_open_count > 0;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${
        hasSafety
          ? "border-destructive/40 bg-destructive/5"
          : "border-amber-500/40 bg-amber-500/5"
      }`}
    >
      <button
        aria-label="Dismiss"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-background/60"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            hasSafety
              ? "bg-destructive/15 text-destructive"
              : "bg-amber-500/15 text-amber-600"
          }`}
        >
          {hasSafety ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <BookOpen className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">
            {hasSafety
              ? `${data.safety_critical_open_count} safety-critical training${
                  data.safety_critical_open_count === 1 ? "" : "s"
                } outstanding`
              : `${data.open_count} assigned training${
                  data.open_count === 1 ? "" : "s"
                } outstanding`}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasSafety
              ? "Required before working alone with a client. Please complete as soon as possible."
              : "Items assigned to you beyond the core checklist."}
          </p>
          <div className="mt-3">
            <Button asChild size="sm" variant={hasSafety ? "destructive" : "default"}>
              <Link to="/dashboard/courses/other">
                Open Other Trainings <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
