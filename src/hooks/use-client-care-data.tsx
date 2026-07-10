/**
 * useClientCareData — the ONLY client-side entry to a client's care data.
 * Wraps the canonical `getClientCareData` server function.
 *
 * Pass `shiftServiceCode` on staff-facing surfaces (punch pad, shift
 * screen) so `data.visibility.goalsForStaff` returns only the goals
 * matching the active service code. Omit it on admin surfaces (PCSP tab,
 * workspace) to get the full picture.
 */
import { useQuery } from "@tanstack/react-query";
import {
  clientCareDataQueryOptions,
  type ClientCareData,
} from "@/lib/client-care-data.functions";

export function useClientCareData(
  clientId: string | null | undefined,
  shiftServiceCode?: string | null,
) {
  return useQuery<ClientCareData>(
    clientCareDataQueryOptions(clientId, shiftServiceCode),
  );
}

export type { ClientCareData } from "@/lib/client-care-data.functions";
