import { Link } from "@tanstack/react-router";
import { Clock, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { caseloadDailyNoteLabel, caseloadTimeClockLabel } from "@/lib/assignment-codes";

/**
 * Caseload card actions. Daily note is always available for HHS/host-home.
 * Time clock is only the return path for an already-open punch — never a
 * start-punch / Open Punch pad control.
 */
export function DualCaseloadActions({
  clientId,
  fullName,
  punchCode,
  isOnTheClock,
  dailyNoteCode,
  dailyNoteDone = false,
}: {
  clientId: string;
  fullName: string;
  punchCode?: string | null;
  isOnTheClock: boolean;
  dailyNoteCode?: string | null;
  dailyNoteDone?: boolean;
}) {
  const noteCode = dailyNoteCode ? String(dailyNoteCode).trim() : "";
  const clockCode = isOnTheClock ? String(punchCode ?? "").trim() : "";
  const noteLabel = noteCode
    ? caseloadDailyNoteLabel({ code: noteCode, alreadyDoneToday: dailyNoteDone })
    : "";
  const clockLabel = clockCode ? caseloadTimeClockLabel(clockCode) : "";

  if (!noteLabel && !clockLabel) return null;

  return (
    <div className="grid gap-2">
      {noteLabel ? (
        <Button asChild size="lg" variant="outline" className="h-12 w-full text-base">
          <Link
            to="/dashboard/hhs-hub/$clientId"
            params={{ clientId }}
            aria-label={`${noteLabel} for ${fullName}`}
          >
            <Home className="h-4 w-4" />
            {noteLabel}
          </Link>
        </Button>
      ) : null}
      {clockLabel ? (
        <Button
          asChild
          size="lg"
          className="h-12 w-full bg-[#117a52] text-base text-white shadow-sm hover:bg-[#0f6b48]"
        >
          <Link
            to="/dashboard/workspace/$clientId"
            params={{ clientId }}
            search={{ tab: "clock-in", ...(clockCode ? { code: clockCode } : {}) }}
            aria-label={`${clockLabel} for ${fullName}`}
          >
            <Clock className="h-4 w-4" />
            {clockLabel}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
