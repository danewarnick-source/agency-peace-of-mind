// Meal planner mount wrapper — mirror of the chore-chart mount pattern.
//
// Activation-by-setting:
//  - RHS/HHS clients (by authorized DSPD codes OR linked to an RHS/HHS
//    chore_space) → meal support ON by default, planner renders directly.
//  - DSI/SLH/SLN-only clients → gated by MealSupportGate (per-client
//    activation with reason: pcsp_goal | intake_need | manual).
//  - Mixed codes (e.g. DSI + HHS) → on because HHS is present.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClientMealPlannerPanel } from "./client-meal-planner-panel";
import { MealSupportGate } from "./meal-support-activation";

export function ClientMealPlannerMount({
  clientId,
  readOnly,
}: {
  clientId: string;
  readOnly?: boolean;
}) {
  const codesQ = useQuery({
    enabled: !!clientId,
    queryKey: ["client-authorized-codes-for-meal", clientId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("service_code, service_end_date")
        .eq("client_id", clientId);
      if (error) throw error;
      return (data ?? [])
        .filter((r) => !r.service_end_date || r.service_end_date >= today)
        .map((r) => (r.service_code || "").toUpperCase());
    },
  });

  const spacesQ = useQuery({
    enabled: !!clientId,
    queryKey: ["chore-spaces-for-client-meal-check", clientId],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("chore_space_clients")
        .select("space_id")
        .eq("client_id", clientId);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.space_id);
      if (!ids.length) return [] as { space_type: string }[];
      const { data: spaces, error: e2 } = await supabase
        .from("chore_spaces")
        .select("space_type")
        .in("id", ids);
      if (e2) throw e2;
      return (spaces ?? []) as { space_type: string }[];
    },
  });

  if (codesQ.isLoading || spacesQ.isLoading) return null;

  const codes = codesQ.data ?? [];
  const spaces = spacesQ.data ?? [];
  const hasResidentialCode = codes.some((c) => c === "HHS" || c === "RHS");
  const hasResidentialSpace = spaces.some(
    (s) => s.space_type === "hhs" || s.space_type === "rhs",
  );
  const defaultOn = hasResidentialCode || hasResidentialSpace;

  if (defaultOn) {
    return <ClientMealPlannerPanel clientId={clientId} readOnly={readOnly} />;
  }

  return (
    <MealSupportGate clientId={clientId}>
      <ClientMealPlannerPanel clientId={clientId} readOnly={readOnly} />
    </MealSupportGate>
  );
}
