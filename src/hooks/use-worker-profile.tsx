import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type WorkerType = "w2" | "1099";

/**
 * Current staff member's worker classification + pay rates. Hourly rate
 * applies to hourly EVV service codes; daily rate applies to daily-billed
 * codes (HHS, RHS, DSG, room-and-board respite). Drives both pay-period
 * boundaries and earnings estimation.
 */
export function useWorkerProfile() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ["worker-profile", user?.id],
    queryFn: async (): Promise<{
      worker_type: WorkerType;
      hourly_rate: number | null;
      daily_rate: number | null;
    }> => {
      const { data, error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("worker_type, hourly_rate, daily_rate" as any)
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? null) as {
        worker_type?: string;
        hourly_rate?: number | string | null;
        daily_rate?: number | string | null;
      } | null;
      const wt = (row?.worker_type === "1099" ? "1099" : "w2") as WorkerType;
      const toNum = (v: number | string | null | undefined): number | null =>
        typeof v === "number" ? v : typeof v === "string" ? Number(v) || null : null;
      return {
        worker_type: wt,
        hourly_rate: toNum(row?.hourly_rate),
        daily_rate: toNum(row?.daily_rate),
      };
    },
  });
}
