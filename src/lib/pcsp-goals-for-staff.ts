/**
 * Clock-out / staff PCSP goal selection.
 *
 * Uploading a PCSP writes goals onto `client_specific_trainings.goals`
 * (and a flat `clients.pcsp_goals` copy). Those rows often have empty
 * `job_codes` — the extractor only fills codes when the PDF lists them.
 * Clock-out used to hide every untagged goal (`is_complete` required a
 * code, then a second filter required that code === the open punch).
 * Staff should see this client's on-file goals without an extra
 * "tag this goal with SLH" step.
 */

export type StaffPcspGoal = {
  id: string;
  goal: string;
  supports: string;
  details: string;
  job_codes: string[];
};

export function flattenPcspGoalRows(raw: unknown): StaffPcspGoal[] {
  if (!Array.isArray(raw)) return [];
  const out: StaffPcspGoal[] = [];
  raw.forEach((item, index) => {
    const goal = String(item ?? "").trim();
    if (!goal) return;
    out.push({
      id: `pcsp-flat-${index}`,
      goal,
      supports: "",
      details: "",
      job_codes: [],
    });
  });
  return out;
}

export function mergeClientGoalSources(
  structured: StaffPcspGoal[],
  flatPcspGoals: unknown,
): StaffPcspGoal[] {
  const fromStructured = structured.filter((g) => g.goal.trim().length > 0);
  if (fromStructured.length > 0) return fromStructured;
  return flattenPcspGoalRows(flatPcspGoals);
}

/**
 * Goals staff may check on clock-out. Honors per-goal visibility.
 * Does not require a matching service/job code.
 */
export function selectGoalsForStaffClockOut<T extends { id: string; goal: string }>(
  goals: T[],
  isGoalVisible: (goalId: string) => boolean,
): T[] {
  return goals.filter((g) => g.goal.trim().length > 0 && isGoalVisible(g.id));
}
