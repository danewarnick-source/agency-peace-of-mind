/**
 * CRM Phase B3 — Client Whiteboard tab.
 *
 * Now hosts the CONSOLIDATED drag-and-drop planning board (RHS + HHS +
 * Direct Support) as a single interactive surface. Absorbs the standalone
 * /dashboard/clients/rhs-board route, which now redirects here.
 *
 * SESSION-ONLY. Nothing on this tab writes to real placements — see
 * <WhiteboardPlanningBoard /> for the drag mechanics.
 */
import { WhiteboardPlanningBoard } from "./planning-board";

export function ClientWhiteboardTab() {
  return <WhiteboardPlanningBoard />;
}
