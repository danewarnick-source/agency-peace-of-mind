// Friendly UI-only labels for import_subjects.review_status. The DB CHECK
// constraint still allows only pending|in_progress|ready|approved — these
// labels are never written to the database.

export type PendingSubjectLike = {
  review_status?: string | null;
  committed_at?: string | null;
  discarded_at?: string | null;
  readyToFinalize?: boolean;
};

export function clientPendingStatusLabel(s: PendingSubjectLike): string {
  if (s.discarded_at) return "Discarded";
  if (s.committed_at || s.review_status === "approved") return "Finalized";
  if (s.readyToFinalize) return "Ready to finalize";
  if (s.review_status === "ready") return "Ready to finalize";
  return "Needs review";
}
