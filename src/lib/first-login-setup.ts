/**
 * Admin Home first-login checklist — three setup steps, in order.
 * Counts only. Never names, notes, or other PHI.
 */

export const FIRST_LOGIN_STEP_COUNT = 3;

export type FirstLoginCounts = {
  memberCount: number;
  clientCount: number;
  shiftCount: number;
};

export type FirstLoginStepKey = "staff" | "client" | "shift";

export type FirstLoginStep = {
  key: FirstLoginStepKey;
  title: string;
  body: string;
  cta: string;
  href: "/dashboard/hub/employees" | "/dashboard/hub/clients" | "/dashboard/scheduler";
  done: boolean;
};

export function firstLoginSteps(counts: FirstLoginCounts): FirstLoginStep[] {
  return [
    {
      key: "staff",
      title: "Add first staff",
      body: "The people who will show up.",
      cta: "Add first staff",
      href: "/dashboard/hub/employees",
      done: counts.memberCount > 1,
    },
    {
      key: "client",
      title: "Add first client",
      body: "The people you serve.",
      cta: "Add first client",
      href: "/dashboard/hub/clients",
      done: counts.clientCount > 0,
    },
    {
      key: "shift",
      title: "Schedule a shift",
      body: "A name on the week.",
      cta: "Schedule a shift",
      href: "/dashboard/scheduler",
      done: counts.shiftCount > 0,
    },
  ];
}

export function firstLoginProgress(counts: FirstLoginCounts) {
  const steps = firstLoginSteps(counts);
  const completedCount = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done) ?? null;
  return {
    steps,
    completedCount,
    totalSteps: FIRST_LOGIN_STEP_COUNT,
    allComplete: completedCount === FIRST_LOGIN_STEP_COUNT,
    nextKey: next?.key ?? null,
  };
}

export function firstLoginHeadline(completedCount: number, firstName: string): string {
  if (completedCount >= FIRST_LOGIN_STEP_COUNT) {
    return `You're set up, ${firstName}.`;
  }
  if (completedCount === 0) {
    return "Your office is ready.";
  }
  return `You're ${completedCount} of ${FIRST_LOGIN_STEP_COUNT} set up.`;
}

export function firstLoginProgressLabel(completedCount: number): string {
  return `You're ${completedCount} of ${FIRST_LOGIN_STEP_COUNT} set up`;
}
