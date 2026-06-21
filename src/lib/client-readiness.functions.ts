// Client readiness — proves end-to-end wiring with real queries before
// claiming "live". Used by the client profile and the Smart Import done
// page; never relies on UI flags.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isClockableServiceCode } from "@/lib/service-billing";

export type ReadinessReport = {
  schedulable: boolean;
  hasStaff: boolean;
  evvReady: boolean;
  billable: boolean;
  guardianValid: boolean;
  goalsPresent: boolean;
  isLive: boolean; // schedulable && hasStaff && evvReady
  // Context for the inline "Add codes" question — so NECTAR can state
  // what the client already has and ask the specific missing piece.
  currentCodes: string[];
  clockableCodes: string[];
};

export const clientReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ReadinessReport> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const userId = context.userId as string;

    const { data: client } = await sb
      .from("clients")
      .select("organization_id, home_latitude, home_longitude, is_own_guardian, guardian_name, pcsp_goals, authorized_dspd_codes")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client) throw new Error("Client not found");

    // Admin guard — must be an active admin/manager for this org.
    const { data: membership } = await sb
      .from("organization_members")
      .select("role")
      .eq("organization_id", client.organization_id)
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (!membership) throw new Error("Forbidden");
    const role = String((membership as { role: string }).role ?? "").toLowerCase();
    if (!["admin", "manager", "owner", "super_admin"].includes(role)) {
      throw new Error("Forbidden");
    }

    const [{ data: codes }, { count: staffCount }] = await Promise.all([
      sb
        .from("client_billing_codes")
        .select("service_code, rate_per_unit, annual_unit_authorization")
        .eq("organization_id", client.organization_id)
        .eq("client_id", data.clientId),
      sb
        .from("staff_assignments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", client.organization_id)
        .eq("client_id", data.clientId),
    ]);

    const codeRows = (codes ?? []) as Array<{
      service_code: string | null;
      rate_per_unit: number | null;
      annual_unit_authorization: number | null;
    }>;

    // Union of codes on file: client_billing_codes + clients.authorized_dspd_codes.
    const codeSet = new Set<string>();
    for (const c of codeRows) {
      if (c.service_code?.trim()) codeSet.add(c.service_code.trim().toUpperCase());
    }
    for (const c of (client.authorized_dspd_codes ?? []) as string[]) {
      if (c?.trim()) codeSet.add(c.trim().toUpperCase());
    }
    const currentCodes = Array.from(codeSet).sort();
    const clockableCodes = currentCodes.filter((c) => isClockableServiceCode(c));

    const schedulable = clockableCodes.length > 0;
    const billable = codeRows.some(
      (c) => (c.rate_per_unit ?? 0) > 0 && (c.annual_unit_authorization ?? 0) > 0,
    );
    const hasStaff = (staffCount ?? 0) > 0;
    const evvReady = client.home_latitude != null && client.home_longitude != null;
    const guardianValid =
      client.is_own_guardian === true ||
      (client.is_own_guardian === false && !!client.guardian_name?.trim());
    const goalsPresent =
      Array.isArray(client.pcsp_goals) && (client.pcsp_goals as unknown[]).length > 0;

    return {
      schedulable,
      hasStaff,
      evvReady,
      billable,
      guardianValid,
      goalsPresent,
      isLive: schedulable && hasStaff && evvReady,
      currentCodes,
      clockableCodes,
    };
  });

