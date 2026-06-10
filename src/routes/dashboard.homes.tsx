import { createFileRoute } from "@tanstack/react-router";
import { HomesTeamsBoard } from "@/components/scheduling/homes-teams-board";

/**
 * Promoted from /dashboard/scheduling?tab=homes so the Homes & Teams board
 * stays reachable independent of the Schedule V2 cut-over.
 *
 * Renders the exact same HomesTeamsBoard component — no logic changes.
 */
export const Route = createFileRoute("/dashboard/homes")({
  head: () => ({ meta: [{ title: "Homes & Teams — HIVE" }] }),
  component: HomesPage,
});

function HomesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Homes &amp; Teams</h2>
        <p className="text-sm text-muted-foreground">
          Manage group homes, day programs, staff designations, and client assignments.
        </p>
      </div>
      <HomesTeamsBoard />
    </div>
  );
}
