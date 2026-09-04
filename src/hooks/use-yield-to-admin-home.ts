import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ADMIN_HOME_SETUP_KEY,
  adminHomeQueriesStarted,
  adminHomeSetupQueryKey,
  layoutQueriesMayRun,
} from "@/lib/yield-to-admin-home";

const GIVE_UP_MS = 4_000;

/**
 * On Admin Home, hold the layout's obligation fan-out until the setup
 * query finishes so it is not starved on a phone radio. Other routes
 * return true immediately. If Admin Home never starts its query, give up
 * after 4s so the sidebar badge and bell still load.
 */
export function useYieldToAdminHomeQueries(
  orgId: string | null,
  onAdminHome: boolean,
): boolean {
  const qc = useQueryClient();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!onAdminHome) return;
    return qc.getQueryCache().subscribe((event) => {
      const key0 = event.query.queryKey[0];
      if (key0 === ADMIN_HOME_SETUP_KEY) {
        setTick((n) => n + 1);
      }
    });
  }, [qc, onAdminHome]);

  const setupStatus = orgId
    ? qc.getQueryState(adminHomeSetupQueryKey(orgId))?.status
    : undefined;
  const homeStarted = adminHomeQueriesStarted(setupStatus);

  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!onAdminHome) {
      setGaveUp(false);
      return;
    }
    if (homeStarted) {
      setGaveUp(false);
      return;
    }
    const t = window.setTimeout(() => setGaveUp(true), GIVE_UP_MS);
    return () => window.clearTimeout(t);
  }, [onAdminHome, homeStarted]);

  return layoutQueriesMayRun({
    onAdminHome,
    setupStatus,
    gaveUp,
  });
}
