/**
 * Feeling-hero B Home does not start obligation queries, so the layout
 * fan-out no longer waits on Admin Home.
 */
export function useYieldToAdminHomeQueries(
  _orgId: string | null,
  _onAdminHome: boolean,
): boolean {
  return true;
}
