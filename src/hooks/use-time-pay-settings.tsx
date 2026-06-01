import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";
import type { PaySchedule } from "@/lib/pay-periods";

/**
 * Org-level Time & Pay settings + clock-in categories.
 * - Settings have sensible defaults when no row exists yet.
 * - Built-in categories (training/admin/travel/meeting/other) are merged
 *   with org overrides (by code) so admins can disable a built-in or add
 *   custom categories without code changes.
 */

export type CapBehavior = "warn" | "acknowledge" | "auto_clock_out";

export type TimePaySettings = {
  organization_id: string | null;
  allow_non_client_clockins: boolean;
  pay_between_clients: boolean;
  w2_schedule: PaySchedule;
  w2_period_anchor: string;
  contractor_schedule: PaySchedule;
  contractor_period_anchor: string;
  /** What happens when a client's weekly cap is reached. */
  cap_behavior: CapBehavior;
  /** Percent of cap that triggers the early warning modal (default 90). */
  cap_warn_pct: number;
};

export type TimePayCategory = {
  id?: string;
  organization_id?: string;
  code: string;
  label: string;
  enabled: boolean;
  requires_description: boolean;
  is_builtin: boolean;
  sort_order: number;
};

const DEFAULTS: TimePaySettings = {
  organization_id: null,
  allow_non_client_clockins: true,
  pay_between_clients: false,
  w2_schedule: "semi_monthly",
  w2_period_anchor: "1_and_16",
  contractor_schedule: "biweekly",
  contractor_period_anchor: "friday",
  cap_behavior: "acknowledge",
  cap_warn_pct: 90,
};

export const BUILTIN_CATEGORIES: TimePayCategory[] = [
  { code: "training", label: "Training",  enabled: true, requires_description: false, is_builtin: true, sort_order: 10 },
  { code: "admin",    label: "Admin work", enabled: true, requires_description: false, is_builtin: true, sort_order: 20 },
  { code: "travel",   label: "Travel",    enabled: true, requires_description: false, is_builtin: true, sort_order: 30 },
  { code: "meeting",  label: "Meeting",   enabled: true, requires_description: false, is_builtin: true, sort_order: 40 },
  { code: "other",    label: "Other",     enabled: true, requires_description: true,  is_builtin: true, sort_order: 50 },
];

export function useTimePaySettings() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;

  const settingsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["time-pay-settings", orgId],
    queryFn: async (): Promise<TimePaySettings> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("time_pay_settings" as any)
        .select("*")
        .eq("organization_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ...DEFAULTS, organization_id: orgId };
      return { ...DEFAULTS, ...(data as unknown as TimePaySettings), organization_id: orgId };
    },
  });

  const categoriesQ = useQuery({
    enabled: !!orgId,
    queryKey: ["time-pay-categories", orgId],
    queryFn: async (): Promise<TimePayCategory[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("time_pay_categories" as any)
        .select("*")
        .eq("organization_id", orgId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TimePayCategory[];
    },
  });

  const categories = useMemo<TimePayCategory[]>(() => {
    const overrides = new Map(
      (categoriesQ.data ?? []).map((c) => [c.code, c] as const),
    );
    const merged: TimePayCategory[] = [];
    // Built-ins (with overrides applied)
    for (const b of BUILTIN_CATEGORIES) {
      const ov = overrides.get(b.code);
      merged.push(ov ? { ...b, ...ov, is_builtin: true } : b);
      if (ov) overrides.delete(b.code);
    }
    // Customs (everything left)
    for (const c of overrides.values()) merged.push(c);
    merged.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    return merged;
  }, [categoriesQ.data]);

  return {
    settings: settingsQ.data ?? DEFAULTS,
    settingsQuery: settingsQ,
    categories,
    enabledCategories: categories.filter((c) => c.enabled),
    categoriesQuery: categoriesQ,
    orgId,
  };
}
