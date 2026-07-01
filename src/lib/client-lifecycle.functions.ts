// Destructive lifecycle actions: discard an uncommitted smart import,
// preview / permanently delete an archived client. Admin-only; every RPC
// re-checks org role server-side via SECURITY DEFINER Postgres functions.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const JobInput = z.object({ jobId: z.string().uuid() });
const ClientInput = z.object({ clientId: z.string().uuid() });

export type ClientDeletionImpact = {
  client_id: string;
  client_name: string;
  archived: boolean;
  medications: number;
  mar_entries: number;
  daily_logs: number;
  incidents: number;
  shifts: number;
  timesheets: number;
  documents: number;
  billing_codes: number;
  emergency_contacts: number;
  progress_summaries: number;
  client_trainings: number;
  staff_assignments: number;
  loans: number;
};

export const discardImportJobHard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => JobInput.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: res, error } = await sb.rpc("discard_import_job_hard", { _job_id: data.jobId });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; job_id: string };
  });

export const getClientDeletionImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ClientInput.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: res, error } = await sb.rpc("client_deletion_impact", { _client_id: data.clientId });
    if (error) throw new Error(error.message);
    return res as ClientDeletionImpact;
  });

export const deleteClientPermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ClientInput.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: res, error } = await sb.rpc("delete_client_hard", { _client_id: data.clientId });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; client_id: string; client_name: string };
  });
