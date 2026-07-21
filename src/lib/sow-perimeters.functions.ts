/**
 * SOW perimeter checks — R1 through R5.
 *
 * AUDIT-context: every rule is conservative. Unconfirmed = flagged; never
 * silently assumed satisfied. Numbers (e.g. 24h incident deadline) come from
 * the database (`state_submission_deadline`) — NOT hardcoded here.
 *
 * R1 — ABI training       — profiles.requires_abi (explicit provider setting) + no current "abi" training
 * R2 — De-escalation cert — profiles.requires_deescalation (explicit provider setting) + no current "deescalation" training
 * R3 — 30-day training    — active org member + no current "thirty_day" training
 * R4 — Incident timeframe — incident_reports past state_submission_deadline
 * R5 — Generic SOW        — nectar_requirements with unmet tracking cadence
 *
 * NOTE: R1/R2 used to also auto-detect from client caseload (ABI disability
 * category / behavior_support_client assignment). That's gone — de-escalation
 * and ABI training are now a plain Required/Exempt setting the provider sets
 * per staff member (onboarding + employee profile), so these alerts follow
 * whatever the provider explicitly decided, nothing more.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeRequirementDueState } from "@/lib/requirement-tracking";

/** Training key constants — shared with callers so the strings aren't scattered. */
export const SOW_TRAINING_KEYS = {
  THIRTY_DAY: "thirty_day",
  ABI: "abi",
  DEESCALATION: "deescalation",
} as const;

export interface SowAlert {
  key: string;
  title: string;
  subject: string;
  subjectKind: "client" | "staff" | "agency";
  /** ISO-8601 string — convert to Date in the consuming hook. */
  dueAt: string;
  href?: string;
  staffId?: string;
  clientId?: string;
  incidentId?: string;
}

type TrainingRow = {
  staff_id: string;
  training_key: string;
  completed_date: string | null;
  expires_at: string | null;
};

/**
 * Pure helper (safe to import anywhere): is a given training key current for a staff member?
 * "Current" = has a completed_date AND (no expires_at OR expires_at >= today).
 */
export function isTrainingCurrent(
  trainings: TrainingRow[],
  staffId: string,
  key: string,
  today: string,
): boolean {
  const row = trainings.find((t) => t.staff_id === staffId && t.training_key === key);
  if (!row || !row.completed_date) return false;
  if (row.expires_at && row.expires_at < today) return false;
  return true;
}

/** Returns all SOW perimeter alerts for an org (R1–R5). */
export const computeSowAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const orgId = data.organizationId;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const overdueIso = new Date(now.getTime() - 60_000).toISOString();
    const alerts: SowAlert[] = [];

    // Step 1: resolve org member IDs (profiles has no FK to org, per CLAUDE.md)
    const { data: memberRows } = await sb
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId);
    const memberIds: string[] = (memberRows ?? [])
      .map((m: { user_id: string | null }) => m.user_id)
      .filter((x: string | null): x is string => !!x);

    if (memberIds.length === 0) return { alerts };

    // Step 2: load all data in parallel
    const [
      profilesRes,
      trainingsRes,
      incidentsRes,
      requirementsRes,
      clientsRes,
    ] = await Promise.all([
      sb.from("profiles")
        .select("id, full_name, requires_abi, requires_deescalation, is_active")
        .in("id", memberIds),
      sb.from("staff_baseline_training_completions")
        .select("staff_id, training_key, completed_date, expires_at")
        .eq("organization_id", orgId),
      sb.from("incident_reports")
        .select("id, report_number, client_id, state_submission_deadline, status")
        .eq("organization_id", orgId)
        .neq("status", "State_Confirmed")
        .not("state_submission_deadline", "is", null)
        .lt("state_submission_deadline", now.toISOString()),
      sb.from("nectar_requirements")
        .select("id, title, review_status, metadata")
        .eq("organization_id", orgId),
      sb.from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId),
    ]);

    type Profile = { id: string; full_name: string | null; requires_abi: boolean; requires_deescalation: boolean; is_active: boolean };
    type Incident = { id: string; report_number: string; client_id: string; state_submission_deadline: string };
    type Requirement = { id: string; title: string; review_status: string | null; metadata: Record<string, unknown> | null };
    type ClientRow = { id: string; first_name: string; last_name: string };

    const profiles = ((profilesRes.data ?? []) as Profile[]).filter((p) => p.is_active);
    const trainings = (trainingsRes.data ?? []) as TrainingRow[];
    const incidents = (incidentsRes.data ?? []) as Incident[];
    const requirements = (requirementsRes.data ?? []) as Requirement[];
    const clientList = (clientsRes.data ?? []) as ClientRow[];

    const staffName = (id: string) =>
      profiles.find((p) => p.id === id)?.full_name ?? "Unknown staff";
    const clientName = (id: string) => {
      const c = clientList.find((x) => x.id === id);
      return c ? `${c.first_name} ${c.last_name}` : "Unknown client";
    };

    // ── R1 — ABI training ────────────────────────────────────────────────────
    // Staff needs ABI training when the provider has explicitly set
    // requires_abi on their profile — no client-caseload auto-detection.
    const staffNeedingAbi = new Set<string>(
      profiles.filter((p) => p.requires_abi).map((p) => p.id),
    );
    for (const staffId of staffNeedingAbi) {
      if (!isTrainingCurrent(trainings, staffId, SOW_TRAINING_KEYS.ABI, today)) {
        const name = staffName(staffId);
        alerts.push({
          key: `sow:r1:${staffId}`,
          title: `${name} works with an ABI client but has no ABI training on file.`,
          subject: name,
          subjectKind: "staff",
          dueAt: overdueIso,
          href: `/dashboard/employees/${staffId}`,
          staffId,
        });
      }
    }

    // ── R2 — De-escalation cert ──────────────────────────────────────────────
    // Explicit provider setting only — no client-caseload auto-detection.
    const staffNeedingDeesc = new Set<string>(
      profiles.filter((p) => p.requires_deescalation).map((p) => p.id),
    );
    for (const staffId of staffNeedingDeesc) {
      if (!isTrainingCurrent(trainings, staffId, SOW_TRAINING_KEYS.DEESCALATION, today)) {
        const name = staffName(staffId);
        alerts.push({
          key: `sow:r2:${staffId}`,
          title: `${name} works with a behavior-plan client but has no current de-escalation certification.`,
          subject: name,
          subjectKind: "staff",
          dueAt: overdueIso,
          href: `/dashboard/employees/${staffId}`,
          staffId,
        });
      }
    }

    // ── R3 — 30-day training ─────────────────────────────────────────────────
    for (const p of profiles) {
      if (!isTrainingCurrent(trainings, p.id, SOW_TRAINING_KEYS.THIRTY_DAY, today)) {
        const name = p.full_name ?? "Staff";
        alerts.push({
          key: `sow:r3:${p.id}`,
          title: `${name} is scheduled but has not completed 30-day training (required before working alone).`,
          subject: name,
          subjectKind: "staff",
          dueAt: overdueIso,
          href: `/dashboard/employees/${p.id}`,
          staffId: p.id,
        });
      }
    }

    // ── R4 — Incident timeframe ──────────────────────────────────────────────
    // state_submission_deadline is computed by the DB as filed_at + 24h.
    // We do NOT override this value — we only check if it's already past.
    for (const inc of incidents) {
      const deadline = new Date(inc.state_submission_deadline);
      const name = clientName(inc.client_id);
      alerts.push({
        key: `sow:r4:${inc.id}`,
        title: `Incident for ${name} is past its 24-hour reporting deadline.`,
        subject: name,
        subjectKind: "client",
        dueAt: deadline.toISOString(),
        href: `/dashboard/hub/documentation?tab=incidents`,
        incidentId: inc.id,
        clientId: inc.client_id,
      });
    }

    // ── R5 — Generic unmet/untraced requirements from nectar_requirements ────
    for (const req of requirements) {
      if (req.review_status === "accepted") continue;
      const ds = computeRequirementDueState(req.metadata);
      if (ds.state === "not_applicable" || ds.state === "ok") continue;
      const isUntraced = !req.review_status || req.review_status === "draft";
      const dueAt = ds.dueOn
        ? new Date(`${ds.dueOn}T23:59:59Z`).toISOString()
        : overdueIso;
      alerts.push({
        key: `sow:r5:${req.id}`,
        title: isUntraced ? `[Untraced] ${req.title}` : req.title,
        subject: "Agency",
        subjectKind: "agency",
        dueAt,
        href: `/dashboard/authoritative-sources`,
      });
    }

    return { alerts };
  });

/**
 * Lightweight server function for the scheduler:
 * returns IDs of active org members who have NOT completed 30-day training.
 * Exported so the scheduler can show the warning without duplicating R3 logic.
 */
export const getMissingThirtyDayStaffIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const orgId = data.organizationId;
    const today = new Date().toISOString().slice(0, 10);

    const { data: memberRows } = await sb
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId);
    const memberIds: string[] = (memberRows ?? [])
      .map((m: { user_id: string | null }) => m.user_id)
      .filter((x: string | null): x is string => !!x);

    if (memberIds.length === 0) return { missingIds: [] as string[] };

    const [profilesRes, trainingsRes] = await Promise.all([
      sb.from("profiles")
        .select("id, is_active")
        .in("id", memberIds),
      sb.from("staff_baseline_training_completions")
        .select("staff_id, completed_date, expires_at")
        .eq("organization_id", orgId)
        .eq("training_key", SOW_TRAINING_KEYS.THIRTY_DAY),
    ]);

    const activeIds = ((profilesRes.data ?? []) as Array<{ id: string; is_active: boolean }>)
      .filter((p) => p.is_active)
      .map((p) => p.id);

    const trainings = (trainingsRes.data ?? []) as Array<{
      staff_id: string;
      completed_date: string | null;
      expires_at: string | null;
    }>;

    const missingIds = activeIds.filter(
      (id) => !isTrainingCurrent(trainings.map((t) => ({ ...t, training_key: SOW_TRAINING_KEYS.THIRTY_DAY })), id, SOW_TRAINING_KEYS.THIRTY_DAY, today),
    );

    return { missingIds };
  });
