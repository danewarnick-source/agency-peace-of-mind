/**
 * NECTAR fit-scoring INPUTS for the consolidated whiteboard.
 *
 * Pulls the raw signals the client-side scorer (`whiteboard-scoring.ts`)
 * needs to score every container: PCSP fields per client, active billing
 * codes per client, all whiteboard notes for the org, and a per-staff
 * "does this staffer have ANY active credentials" snapshot.
 *
 * All heuristic interpretation lives in the pure scorer. This module only
 * reads. No fabrication: rows that don't exist stay missing so the scorer
 * can honestly surface "no signal."
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyPermission } from "@/lib/require-permission";

export type PcspRow = {
  client_id: string;
  pcsp_goals: string | null;
  special_directions: string | null;
  pertinent_health_notes: string | null;
  preferred_living: string | null;
  preferred_activities: string | null;
};

export type BillingCodeRow = {
  client_id: string;
  service_code: string;
  unit_type: string | null;
  weekly_cap_units: number | null;
  monthly_max_units: number | null;
};

export type StaffCredentialSummary = {
  staff_id: string;
  active_count: number;
  /** Lower-cased credential/training keys — the scorer can text-match. */
  active_keys: string[];
};

export type NoteRow = {
  subject_type: "client" | "staff";
  subject_id: string;
  note_text: string;
};

export type BoardScoringInputs = {
  pcsp: PcspRow[];
  billing_codes: BillingCodeRow[];
  staff_credentials: StaffCredentialSummary[];
  notes: NoteRow[];
};

const orgOnly = z.object({ organization_id: z.string().uuid() });

export const getBoardScoringInputs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }): Promise<BoardScoringInputs> => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);

    const today = new Date().toISOString().slice(0, 10);

    const [pcspQ, codesQ, memQ, notesQ] = await Promise.all([
      supabase
        .from("clients")
        .select(
          "id, pcsp_goals, special_directions, pertinent_health_notes, preferred_living, preferred_activities",
        )
        .eq("organization_id", data.organization_id)
        .eq("account_status", "active"),
      supabase
        .from("client_billing_codes")
        .select("client_id, service_code, unit_type, weekly_cap_units, monthly_max_units, service_start_date, service_end_date")
        .eq("organization_id", data.organization_id)
        .lte("service_start_date", today),
      supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", data.organization_id)
        .eq("active", true),
      supabase
        .from("whiteboard_notes")
        .select("subject_type, subject_id, note_text")
        .eq("organization_id", data.organization_id),
    ]);
    for (const q of [pcspQ, codesQ, memQ, notesQ]) {
      if (q.error) throw new Error(q.error.message);
    }

    const pcsp: PcspRow[] = ((pcspQ.data ?? []) as Array<{
      id: string;
      pcsp_goals: string | null;
      special_directions: string | null;
      pertinent_health_notes: string | null;
      preferred_living: string | null;
      preferred_activities: string | null;
    }>).map((r) => ({
      client_id: r.id,
      pcsp_goals: r.pcsp_goals,
      special_directions: r.special_directions,
      pertinent_health_notes: r.pertinent_health_notes,
      preferred_living: r.preferred_living,
      preferred_activities: r.preferred_activities,
    }));

    const billing_codes: BillingCodeRow[] = ((codesQ.data ?? []) as Array<{
      client_id: string;
      service_code: string;
      unit_type: string | null;
      weekly_cap_units: number | null;
      monthly_max_units: number | null;
      service_start_date: string | null;
      service_end_date: string | null;
    }>)
      .filter((r) => !r.service_end_date || r.service_end_date >= today)
      .map((r) => ({
        client_id: r.client_id,
        service_code: r.service_code,
        unit_type: r.unit_type,
        weekly_cap_units: r.weekly_cap_units,
        monthly_max_units: r.monthly_max_units,
      }));

    const staffIds = ((memQ.data ?? []) as Array<{ user_id: string }>).map(
      (r) => r.user_id,
    );

    let staff_credentials: StaffCredentialSummary[] = [];
    if (staffIds.length > 0) {
      const [baseQ, certQ] = await Promise.all([
        supabase
          .from("staff_baseline_training_completions")
          .select("staff_id, training_key, expires_at, completed_date")
          .eq("organization_id", data.organization_id)
          .in("staff_id", staffIds),
        supabase
          .from("external_certifications")
          .select("user_id, cert_type, expires_at, status")
          .in("user_id", staffIds)
          .eq("status", "approved"),
      ]);
      const now = new Date().toISOString();
      const bag = new Map<string, Set<string>>();
      for (const id of staffIds) bag.set(id, new Set());
      for (const r of ((baseQ.data ?? []) as Array<{
        staff_id: string;
        training_key: string | null;
        expires_at: string | null;
        completed_date: string | null;
      }>)) {
        if (!r.training_key || !r.completed_date) continue;
        if (r.expires_at && r.expires_at <= now) continue;
        bag.get(r.staff_id)?.add(r.training_key.toLowerCase());
      }
      for (const r of ((certQ.data ?? []) as Array<{
        user_id: string;
        cert_type: string | null;
        expires_at: string | null;
      }>)) {
        if (!r.cert_type) continue;
        if (r.expires_at && r.expires_at <= now) continue;
        bag.get(r.user_id)?.add(r.cert_type.toLowerCase());
      }
      staff_credentials = staffIds.map((id) => {
        const s = bag.get(id) ?? new Set<string>();
        return {
          staff_id: id,
          active_count: s.size,
          active_keys: Array.from(s).sort(),
        };
      });
    }

    const notes: NoteRow[] = ((notesQ.data ?? []) as Array<{
      subject_type: "client" | "staff";
      subject_id: string;
      note_text: string;
    }>).map((n) => ({
      subject_type: n.subject_type,
      subject_id: n.subject_id,
      note_text: n.note_text,
    }));

    return { pcsp, billing_codes, staff_credentials, notes };
  });
