import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type WorkerType = "w2" | "1099";

/**
 * Current staff member's worker classification + hourly rate. Drives both
 * pay-period boundaries (via the org's W-2 vs 1099 schedule) and earnings
 * estimation on the NECTAR pill and Time Clock.
 */
export function useWorkerProfile() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ["worker-profile", user?.id],
    queryFn: async (): Promise<{ worker_type: WorkerType; hourly_rate: number | null }> => {
      const { data, error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("worker_type, hourly_rate" as any)
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? null) as { worker_type?: string; hourly_rate?: number | string | null } | null;
      const wt = (row?.worker_type === "1099" ? "1099" : "w2") as WorkerType;
      const rate =
        typeof row?.hourly_rate === "number"
          ? row.hourly_rate
          : typeof row?.hourly_rate === "string"
            ? Number(row.hourly_rate) || null
            : null;
      return { worker_type: wt, hourly_rate: rate };
    },
  });
}
