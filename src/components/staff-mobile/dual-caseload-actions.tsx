import { Link } from "@tanstack/react-router";
import { Clock, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Phone-first dual actions for a clockable shift / in-progress punch when
 * that same person also has HHS. Never mount this on the HOST HOME / HHS
 * daily-note card — that card is daily note only (hosts do not clock).
 */
export function DualCaseloadActions({
  clientId,
  fullName,
  punchCode,
  isOnTheClock,
}: {
  clientId: string;
  fullName: string;
  punchCode: string;
  isOnTheClock: boolean;
}) {
  const punchLabel = isOnTheClock ? "Continue Punch pad" : "Open Punch pad";
  return (
    <div className="grid gap-2">
      <Button
        asChild
        size="lg"
        className={[
          "h-12 w-full text-base",
          isOnTheClock ? "bg-[#117a52] text-white shadow-sm hover:bg-[#0f6b48]" : "",
        ].join(" ")}
      >
        <Link
          to="/dashboard/workspace/$clientId"
          params={{ clientId }}
          search={{ tab: "clock-in", ...(punchCode ? { code: punchCode } : {}) }}
          aria-label={`${punchLabel} for ${fullName}${punchCode ? ` (${punchCode})` : ""}`}
        >
          <Clock className="h-4 w-4" />
          {punchLabel}
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="h-12 w-full text-base">
        <Link
          to="/dashboard/hhs-hub/$clientId"
          params={{ clientId }}
          aria-label={`Open daily note for ${fullName}`}
        >
          <Home className="h-4 w-4" />
          Open daily note
        </Link>
      </Button>
    </div>
  );
}
