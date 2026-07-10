/**
 * Setter for client_staff_visibility. Admin/manager only.
 * Merges either a section patch or a field patch onto the existing row,
 * upserting on client_id.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const setClientStaffVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      clientId: string;
      sectionPatch?: Record<string, boolean> | null;
      fieldPatch?: Record<string, boolean | null> | null;
    }) => {
      if (!input?.clientId || typeof input.clientId !== "string") {
        throw new Error("clientId is required");
      }
      return {
        clientId: input.clientId,
        sectionPatch: input.sectionPatch ?? null,
        fieldPatch: input.fieldPatch ?? null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { clientId, sectionPatch, fieldPatch } = data;

    // Look up organization for the client + existing row (RLS enforces
    // admin/manager on the write below).
    const [clientRes, curRes] = await Promise.all([
      supabase
        .from("clients")
        .select("organization_id")
        .eq("id", clientId)
        .maybeSingle(),
      supabase
        .from("client_staff_visibility")
        .select("sections, fields")
        .eq("client_id", clientId)
        .maybeSingle(),
    ]);
    if (clientRes.error) throw clientRes.error;
    if (!clientRes.data) throw new Error("Client not found");
    const organizationId = (clientRes.data as { organization_id: string }).organization_id;

    const curSections: Record<string, boolean> =
      (curRes?.data?.sections as Record<string, boolean> | null) ?? {};
    const curFields: Record<string, boolean> =
      (curRes?.data?.fields as Record<string, boolean> | null) ?? {};

    const nextSections = { ...curSections };
    if (sectionPatch) {
      for (const [k, v] of Object.entries(sectionPatch)) {
        if (typeof v === "boolean") nextSections[k] = v;
      }
    }

    const nextFields = { ...curFields };
    if (fieldPatch) {
      for (const [k, v] of Object.entries(fieldPatch)) {
        // `null` erases the override, letting the default (visible) apply.
        if (v === null) delete nextFields[k];
        else if (typeof v === "boolean") nextFields[k] = v;
      }
    }

    const { error } = await supabase
      .from("client_staff_visibility")
      .upsert(
        {
          client_id: clientId,
          organization_id: organizationId,
          sections: nextSections,
          fields: nextFields,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        },
        { onConflict: "client_id" },
      );
    if (error) throw error;
    return { ok: true as const };
  });
