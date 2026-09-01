/**
 * useClientCareData — the ONLY client-side entry to a client's care data.
 * Wraps the canonical `getClientCareData` server function.
 *
 * Pass `shiftServiceCode` on staff-facing surfaces (punch pad, shift
 * screen) so the query key follows the open punch. Clock-out still
 * returns every visible on-file PCSP goal — untagged included. Omit the
 * code on admin surfaces (PCSP tab, workspace) for the same full list.
 */
import { useQuery } from "@tanstack/react-query";
import { clientCareDataQueryOptions } from "@/lib/client-care-data.functions";

export function useClientCareData(
  clientId: string | null | undefined,
  shiftServiceCode?: string | null,
) {
  return useQuery(clientCareDataQueryOptions(clientId, shiftServiceCode));
}

export type { ClientCareData } from "@/lib/client-care-data.functions";
