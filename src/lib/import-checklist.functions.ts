// Thin server fns used by ImportChecklist + NectarAsk. Each one is
// org-scoped via the user's organization_members row for the client.
//
// Honest scope: these fns persist data the admin enters / attaches in the
// done-page checklist. They do NOT perform document extraction — upload
// only attaches the file. Extraction is wired in a later prompt.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function requireAdminForClient(
  sb: Sb,
  userId: string,
  clientId: string,
): Promise<string> {
  const { data: client } = await sb
    .from("clients")
    .select("organization_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) throw new Error("Client not found");
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
  return client.organization_id as string;
}

// ── End-of-life statuses (DNR / POLST / palliative / hospice) ────────────
const EOL_FIELDS = ["dnr_status", "polst_status", "palliative_care_status", "hospice_status"] as const;
type EolField = (typeof EOL_FIELDS)[number];

export const setEndOfLifeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        field: z.enum(EOL_FIELDS),
        status: z.string().min(1).max(80),
        location: z.string().max(200).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await requireAdminForClient(sb, context.userId as string, data.clientId);
    const patch: Record<string, unknown> = { [data.field as EolField]: data.status };
    if (data.field === "dnr_status") {
      patch.dnr_location = data.location ?? null;
    }
    const { error } = await sb.from("clients").update(patch).eq("id", data.clientId);
    if (error) throw error;
    return { ok: true };
  });

// ── Append to clients array fields (allergies, immunizations) ────────────
export const appendClientArrayField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        field: z.enum(["allergies", "immunizations"]),
        value: z.string().min(1).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await requireAdminForClient(sb, context.userId as string, data.clientId);
    const { data: row } = await sb
      .from("clients")
      .select(data.field)
      .eq("id", data.clientId)
      .maybeSingle();
    const current = (row?.[data.field] as string[] | null) ?? [];
    const next = Array.from(new Set([...current, data.value.trim()]));
    const { error } = await sb
      .from("clients")
      .update({ [data.field]: next })
      .eq("id", data.clientId);
    if (error) throw error;
    return { ok: true, count: next.length };
  });

// ── Upsert one client_medications row (manual fill-in path) ──────────────
export const upsertClientMedication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        medicationId: z.string().uuid().optional(),
        medication_name: z.string().min(1).max(200),
        dosage: z.string().max(120).optional().nullable(),
        am_pm: z.string().max(40).optional().nullable(),
        scheduled_time: z.string().max(80).optional().nullable(),
        prescriber: z.string().max(120).optional().nullable(),
        support_level: z.string().max(80).optional().nullable(),
        support_explanation: z.string().max(2000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const orgId = await requireAdminForClient(sb, context.userId as string, data.clientId);
    const row = {
      client_id: data.clientId,
      organization_id: orgId,
      medication_name: data.medication_name,
      dosage: data.dosage ?? null,
      am_pm: data.am_pm ?? null,
      scheduled_time: data.scheduled_time ?? null,
      prescriber: data.prescriber ?? null,
      support_level: data.support_level ?? null,
      support_explanation: data.support_explanation ?? null,
    };
    if (data.medicationId) {
      const { error } = await sb
        .from("client_medications")
        .update(row)
        .eq("id", data.medicationId);
      if (error) throw error;
      return { ok: true, id: data.medicationId };
    }
    const { data: ins, error } = await sb
      .from("client_medications")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: ins.id as string };
  });

// ── Attach an uploaded document to the client profile ────────────────────
// Honest: this records the file. It does NOT extract or interpret it.
export const attachClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        documentType: z.string().min(1).max(80),
        fileName: z.string().min(1).max(300),
        storagePath: z.string().min(1).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const orgId = await requireAdminForClient(sb, context.userId as string, data.clientId);
    const { data: ins, error } = await sb
      .from("client_documents")
      .insert({
        client_id: data.clientId,
        organization_id: orgId,
        document_type: data.documentType,
        file_name: data.fileName,
        file_url: data.storagePath, // signed URLs are created on demand
        storage_path: data.storagePath,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: ins.id as string };
  });
