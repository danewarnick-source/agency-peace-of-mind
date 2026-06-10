/**
 * Schedule preview mutations.
 *
 * These mirror the EXACT insert/update/delete shape used inline by the
 * existing scheduler (src/routes/dashboard.scheduling.tsx around line 320,
 * and src/components/scheduling/individual-services-scheduler.tsx), so the
 * preview page writes rows that look identical to ones the legacy
 * scheduler produces. The legacy scheduler does not export a reusable
 * mutation helper — we centralize one here rather than duplicate the
 * same SQL/payload at every call site inside the preview page.
 *
 * Org scoping: every write is filtered by `organization_id` AND the row's
 * id; RLS on scheduled_shifts also enforces this server-side. We never
 * delete by id alone.
 *
 * scheduled_shifts columns (from db): staff_id NOT NULL, client_id NOT NULL,
 * shift_type NOT NULL, job_code NULLABLE, status NOT NULL, published NOT NULL.
 * → There is no "open / unassigned" shift in the data model. The editor
 *   requires a staff member.
 */
import { supabase } from "@/integrations/supabase/client";

export type ShiftDraft = {
  id?: string;
  organization_id: string;
  staff_id: string;
  client_id: string;
  job_code: string;
  shift_type: string;
  starts_at: string; // ISO
  ends_at: string;   // ISO
  notes: string | null;
  status: string;    // e.g. "pending"
  published: boolean;
  created_by: string;
};

export function validateShiftDraft(d: Partial<ShiftDraft>): string | null {
  if (!d.organization_id) return "Missing organization.";
  if (!d.staff_id) return "Select a staff member.";
  if (!d.client_id) return "Select a client.";
  if (!d.job_code) return "Select a billing code.";
  if (!d.starts_at || !d.ends_at) return "Set start and end times.";
  const a = new Date(d.starts_at).getTime();
  const b = new Date(d.ends_at).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return "Invalid date/time.";
  if (b <= a) return "End must be after start.";
  return null;
}

export async function saveShift(draft: ShiftDraft) {
  const err = validateShiftDraft(draft);
  if (err) throw new Error(err);
  const payload: Record<string, unknown> = {
    organization_id: draft.organization_id,
    staff_id: draft.staff_id,
    client_id: draft.client_id,
    job_code: draft.job_code,
    shift_type: draft.shift_type,
    starts_at: draft.starts_at,
    ends_at: draft.ends_at,
    notes: draft.notes?.trim() || null,
    status: draft.status,
    published: draft.published,
    created_by: draft.created_by,
  };
  if (draft.id) {
    const { error } = await (supabase as never as ReturnType<typeof supabase.from>)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;
    const { error: e2 } = await (supabase as any)
      .from("scheduled_shifts")
      .update(payload)
      .eq("id", draft.id)
      .eq("organization_id", draft.organization_id); // org scope guard
    if (e2) throw e2;
    if (error) throw error;
    return draft.id;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("scheduled_shifts")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteShift(id: string, organizationId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("scheduled_shifts")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId); // org scope guard — never delete cross-org
  if (error) throw error;
}
