/**
 * Pure visibility rule for the Admin Home welcome banner.
 * Dismissal is org-scoped (`organizations.welcome_dismissed_at`).
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldShowWelcome(input: {
  orgCreatedAt: string;
  now: Date;
  welcomeDismissedAt: string | null;
  memberCount: number;
  clientCount: number;
  documentedShiftCount: number;
  welcomeFlag: boolean;
}): boolean {
  if (input.welcomeDismissedAt != null) return false;

  const createdMs = Date.parse(input.orgCreatedAt);
  const ageMs = Number.isFinite(createdMs) ? input.now.getTime() - createdMs : 0;
  const young = ageMs < SEVEN_DAYS_MS;
  const setupIncomplete =
    input.memberCount < 2 || input.clientCount < 1 || input.documentedShiftCount < 1;

  return input.welcomeFlag || young || setupIncomplete;
}

export function welcomeSetupProgress(input: {
  memberCount: number;
  clientCount: number;
  documentedShiftCount: number;
}) {
  const inviteStaff = input.memberCount >= 2;
  const addClient = input.clientCount >= 1;
  const documentShift = input.documentedShiftCount >= 1;
  return {
    inviteStaff,
    addClient,
    documentShift,
    allDone: inviteStaff && addClient && documentShift,
  };
}
