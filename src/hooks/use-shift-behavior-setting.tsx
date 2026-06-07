import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";

/**
 * Org-level toggle for the post-shift Behavior Observations block on EVV clock-out.
 * Defaults ON when no row exists (DSPD norm: observe + document on every shift).
 */
export function useShiftBehaviorSetting() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;

  return useQuery({
    enabled: !!orgId,
    queryKey: ["org-shift-behavior-setting", orgId],
    queryFn: async (): Promise<{ enabled: boolean }> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("org_shift_behavior_settings" as any)
        .select("enabled")
        .eq("organization_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = data as any;
      return { enabled: row?.enabled ?? true };
    },
  });
}

export function useSetShiftBehaviorSetting() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!orgId) throw new Error("No active organization.");
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("org_shift_behavior_settings" as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ organization_id: orgId, enabled, updated_at: new Date().toISOString() } as any, {
          onConflict: "organization_id",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-shift-behavior-setting", orgId] });
    },
  });
}
