import { createFileRoute } from "@tanstack/react-router";
import { RequirePermission } from "@/components/rbac-guard";
import { RhsPlanningBoard } from "@/components/clients/rhs-planning-board";

/**
 * CRM Phase B2 — dedicated route for the RHS drag-and-drop planning board.
 * Session-only state lives inside the component; this route is just a thin
 * gated wrapper. view_referrals is the minimum (drag is further gated to
 * manage_referrals inside the component).
 */
export const Route = createFileRoute("/dashboard/clients/rhs-board")({
  head: () => ({ meta: [{ title: "RHS Planning Board — HIVE" }] }),
  component: () => (
    <RequirePermission perm="view_referrals">
      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            RHS Planning Board
          </h2>
          <p className="text-sm text-muted-foreground">
            Drag clients between residential homes to plan re-arrangements.
            Session-only — nothing is saved.
          </p>
        </div>
        <RhsPlanningBoard />
      </div>
    </RequirePermission>
  ),
});
