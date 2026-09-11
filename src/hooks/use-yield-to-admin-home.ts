import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ADMIN_HOME_CLIENTS_KEY,
  ADMIN_HOME_INSTANCES_KEY,
  adminHomeClientsQueryKey,
  adminHomeInstancesQueryKey,
  adminHomeQueriesStarted,
  layoutQueriesMayRun,
} from "@/lib/yield-to-admin-home";

const GIVE_UP_MS = 4_000;

/**
 * Layout fan-out yield. Home greeting no longer starts instance/client KPI
 * queries, so an unset pair is allowed immediately. If those keys still
 * appear (other callers), wait until they settle; give up after 4s.
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
      if (key0 === ADMIN_HOME_INSTANCES_KEY || key0 === ADMIN_HOME_CLIENTS_KEY) {
        setTick((n) => n + 1);
      }
    });
  }, [qc, onAdminHome]);

  const instancesStatus = orgId
    ? qc.getQueryState(adminHomeInstancesQueryKey(orgId))?.status
    : undefined;
  const clientsStatus = orgId
    ? qc.getQueryState(adminHomeClientsQueryKey(orgId))?.status
    : undefined;
  const homeStarted = adminHomeQueriesStarted(instancesStatus, clientsStatus);

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
    instancesStatus,
    clientsStatus,
    gaveUp,
  });
}
