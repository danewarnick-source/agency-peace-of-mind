// Recovery utilities for clients whose PCSP billing codes were silently
// filed under client_external_services (mis-classified as another provider)
// during Smart Import. Moves them back into client_billing_codes as pending
// stubs and updates authorized_dspd_codes / job_code accordingly.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDailyServiceCode } from "@/lib/service-billing";

const ReclaimInput = z.object({
  clientId: z.string().uuid(),
  codes: z.array(z.string().min(1)).min(1),
});

export const reclaimExternalCodesAsOurs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof ReclaimInput>) => ReclaimInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const codes = Array.from(new Set(data.codes.map((c) => c.trim().toUpperCase()).filter(Boolean)));
    if (codes.length === 0) return { moved: 0, codes: [] as string[] };

    const { data: client, error: cErr } = await supabase
      .from("clients")
      .select("id, organization_id, authorized_dspd_codes, job_code")
      .eq("id", data.clientId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Client not found");

    // Insert billing-code stubs (pending; admin fills rate/units later).
    const stubs = codes.map((code) => ({
      organization_id: client.organization_id,
      client_id: client.id,
      service_code: code,
      unit_type: isDailyServiceCode(code) ? "day" : "unit",
      annual_unit_authorization: 0,
      rate_per_unit: 0,
      authorization_pending: true,
    }));
    const { error: insErr } = await supabase
      .from("client_billing_codes")
      .upsert(stubs, { onConflict: "organization_id,client_id,service_code", ignoreDuplicates: true });
    if (insErr) throw new Error(insErr.message);

    // Merge into authorized_dspd_codes + job_code.
    const cur = (client.authorized_dspd_codes as string[] | null) ?? [];
    const curJob = (client.job_code as string[] | null) ?? [];
    const nextAuth = Array.from(new Set([...cur, ...codes]));
    const nextJob = Array.from(new Set([...curJob, ...codes]));
    const { error: upErr } = await supabase
      .from("clients")
      .update({ authorized_dspd_codes: nextAuth, job_code: nextJob })
      .eq("id", client.id);
    if (upErr) throw new Error(upErr.message);

    // Remove the misfiled external rows.
    const { error: delErr } = await supabase
      .from("client_external_services")
      .delete()
      .eq("client_id", client.id)
      .in("service_code", codes);
    if (delErr) throw new Error(delErr.message);

    return { moved: codes.length, codes };
  });
