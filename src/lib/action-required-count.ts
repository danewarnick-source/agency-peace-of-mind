/**
 * Nav / tab badges must not publish a partial Action Required count.
 * The queue is several independent queries (obligations, incidents, HR, …).
 * The first one to land can be 1; the rest can push it to 15. Hold at 0
 * until every source has settled so the badge does not flap.
 */
export function stableActionRequiredCount(isLoading: boolean, rawCount: number): number {
  if (isLoading) return 0;
  return rawCount;
}
