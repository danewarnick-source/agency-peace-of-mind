import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useCurrentOrg } from "./use-org";
import type { AssignmentMap } from "@/lib/assignment-codes";

export {
  allowedCodesFor,
  clientAuthorizedCodes,
  defaultCaseloadCode,
  firstClockableCode,
  hasHhsCode,
  hasHostHomeDailyCode,
  isDualHhsAndClockable,
  isHostHomeOnlyAssignment,
  type AssignmentMap,
} from "@/lib/assignment-codes";

/**
 * Per-staff caseload assignments scoped to specific service codes.
 *
 * Each row in `staff_assignments` may include a `service_codes` array that
 * limits the assignment to those codes. A null/empty `service_codes` means
 * "all codes on the client" (legacy back-compat). The hook returns a map
 * keyed by client_id whose value is either the explicit code allow-list
 * (Set) or `null` meaning "all codes".
 */
export function useMyAssignments() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  return useQuery({
    enabled: !!user?.id && !!org?.organization_id,
    queryKey: ["my-assignments", org?.organization_id, user?.id],
    queryFn: async (): Promise<AssignmentMap> => {
      const { data, error } = await supabase
        .from("staff_assignments")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("client_id, service_codes" as any)
        .eq("organization_id", org!.organization_id)
        .eq("staff_id", user!.id);
      if (error) throw error;
      const map: AssignmentMap = new Map();
      for (const r of ((data ?? []) as unknown) as Array<{
        client_id: string;
        service_codes: string[] | null;
      }>) {
        const codes = Array.isArray(r.service_codes) && r.service_codes.length
          ? new Set(r.service_codes)
          : null;
        const prev = map.get(r.client_id);
        if (prev === undefined) {
          map.set(r.client_id, codes);
        } else if (prev === null || codes === null) {
          map.set(r.client_id, null);
        } else {
          codes.forEach((c) => prev.add(c));
        }
      }
      return map;
    },
  });
}
