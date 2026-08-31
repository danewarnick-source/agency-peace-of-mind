/**
 * Completion-card status for CPR / Mandt class rosters.
 * Admin uploads the card; that closes the staff obligation.
 */

export type RosterCardStatus = "in" | "missing";

export type RosterCardView = {
  rosterId: string;
  name: string;
  email: string;
  phone: string;
  staffUserId: string | null;
  cardStatus: RosterCardStatus;
  cardFilename: string | null;
  cardUploadedAt: string | null;
};

export function rosterCardStatus(row: {
  cardUploadedAt?: string | null;
  cardPath?: string | null;
  cardFilename?: string | null;
}): RosterCardStatus {
  if (row.cardUploadedAt || row.cardPath || row.cardFilename) return "in";
  return "missing";
}

export function classCardSummary(roster: Array<{ cardStatus: RosterCardStatus }>): {
  inCount: number;
  missingCount: number;
  allIn: boolean;
} {
  const inCount = roster.filter((r) => r.cardStatus === "in").length;
  const missingCount = roster.length - inCount;
  return { inCount, missingCount, allIn: roster.length > 0 && missingCount === 0 };
}

export function classCardLabel(summary: { inCount: number; missingCount: number; allIn: boolean }): string {
  if (summary.allIn) return "Card in";
  if (summary.inCount === 0) return "Card not in";
  return `${summary.inCount} of ${summary.inCount + summary.missingCount} cards in`;
}
