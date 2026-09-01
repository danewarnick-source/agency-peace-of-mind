import type { QueryClient } from "@tanstack/react-query";

/** Refresh Caseload CTAs, Nectar hours, and the read-only timesheet list. */
export function invalidateStaffCaseloadWork(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["evv-active"] }),
    qc.invalidateQueries({ queryKey: ["active-shift"] }),
    qc.invalidateQueries({ queryKey: ["active-timesheet-overview"] }),
    qc.invalidateQueries({ queryKey: ["today-shift"] }),
    qc.invalidateQueries({ queryKey: ["today-shifts-all"] }),
    qc.invalidateQueries({ queryKey: ["nectar-pay-period"] }),
    qc.invalidateQueries({ queryKey: ["client-utilization"] }),
    qc.invalidateQueries({ queryKey: ["staff-completed-punches"] }),
    qc.invalidateQueries({ queryKey: ["staff-my-timesheets"] }),
    qc.invalidateQueries({ queryKey: ["today-daily-notes"] }),
  ]).then(() => undefined);
}
