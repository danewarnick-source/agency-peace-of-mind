/**
 * Agency audit-readiness health — DSPD SOW documentation posture.
 *
 * Returns up to 14 gated metrics with a weight-redistributed overall score.
 * Does NOT query external_certifications (retired / empty).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { z } from "zod";

const Input = z.object({ organizationId: z.string().uuid() });

export type HealthMetricKey =
  | "staff_obligations"
  | "evv_documentation"
  | "daily_progress_notes"
  | "medication_records"
  | "incident_documentation"
  | "upi_attestations"
  | "hrc_documentation"
  | "behavior_support"
  | "client_record_completeness"
  | "client_specific_training"
  | "policy_acknowledgments"
  | "hhs_host_home"
  | "billing_accuracy"
  | "hr_document_currency";

export type HealthMetric = {
  key: HealthMetricKey;
  label: string;
  score: number;
  passing: number;
  total: number;
  link: string;
  applicable: boolean;
  /** Base weight before redistribution (0 when not applicable). */
  weight: number;
};

export type AgencyHealthSnapshot = {
  overall: number;
  metrics: HealthMetric[];
  activeCodes: string[];
  /** Staff with ≥1 overdue SOW obligation instance. */
  staffWithOverdueObligations: number;
};

const BASE_WEIGHTS: Record<HealthMetricKey, number> = {
  staff_obligations: 20,
  evv_documentation: 15,
  daily_progress_notes: 12,
  medication_records: 10,
  incident_documentation: 8,
  upi_attestations: 8,
  client_specific_training: 7,
  hrc_documentation: 6,
  behavior_support: 6,
  client_record_completeness: 5,
  hhs_host_home: 5,
  policy_acknowledgments: 4,
  hr_document_currency: 3,
  billing_accuracy: 2,
};

const LINKS: Record<HealthMetricKey, string> = {
  staff_obligations: "/dashboard/company-obligations",
  evv_documentation: "/dashboard/compliance-desk",
  daily_progress_notes: "/dashboard/hub/documentation",
  medication_records: "/dashboard/hub/documentation?tab=medications",
  incident_documentation: "/dashboard/hub/documentation?tab=incidents",
  upi_attestations: "/dashboard/company-obligations?tab=action-required",
  hrc_documentation: "/dashboard/hub/documentation?tab=hrc",
  behavior_support: "/dashboard/hub/documentation?tab=behavior",
  client_record_completeness: "/dashboard/hub/clients",
  client_specific_training: "/dashboard/company-obligations",
  policy_acknowledgments: "/dashboard/settings",
  hhs_host_home: "/dashboard/hub/documentation?tab=hhs",
  billing_accuracy: "/dashboard/hub/documentation?tab=billing",
  hr_document_currency: "/dashboard/hub/employees",
};

const LABELS: Record<HealthMetricKey, string> = {
  staff_obligations: "Staff Obligations Compliance",
  evv_documentation: "EVV Documentation Completeness",
  daily_progress_notes: "Daily Progress Notes",
  medication_records: "Medication Administration Records",
  incident_documentation: "Incident Report Documentation",
  upi_attestations: "UPI Attestations Current",
  hrc_documentation: "Human Rights Committee Documentation",
  behavior_support: "Behavior Support Documentation",
  client_record_completeness: "Client Record Completeness",
  client_specific_training: "Client-Specific Training Completion",
  policy_acknowledgments: "Policy Acknowledgments",
  hhs_host_home: "HHS Host Home Documentation",
  billing_accuracy: "Billing Submission Accuracy",
  hr_document_currency: "HR Document Currency",
};

function pct(passing: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((passing / total) * 100);
}

function metric(
  key: HealthMetricKey,
  passing: number,
  total: number,
  applicable: boolean,
  scoreOverride?: number,
): HealthMetric {
  const score = applicable
    ? scoreOverride !== undefined
      ? scoreOverride
      : pct(passing, total)
    : 0;
  return {
    key,
    label: LABELS[key],
    score,
    passing,
    total,
    link: LINKS[key],
    applicable,
    weight: applicable ? BASE_WEIGHTS[key] : 0,
  };
}

function weightedOverall(metrics: HealthMetric[]): number {
  const applicable = metrics.filter((m) => m.applicable);
  const weightSum = applicable.reduce((s, m) => s + m.weight, 0);
  if (weightSum <= 0) return 0;
  const raw = applicable.reduce((s, m) => s + m.score * (m.weight / weightSum), 0);
  return Math.round(raw);
}

function monthLabel(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function quarterBounds(d: Date): { start: string; end: string; label: string } {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3); // 0-3
  const startMonth = q * 3;
  const start = new Date(Date.UTC(y, startMonth, 1));
  const end = new Date(Date.UTC(y, startMonth + 3, 0, 23, 59, 59));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: `${y}-Q${q + 1}`,
  };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function narrativeLen(parts: Array<string | null | undefined>): number {
  return parts.map((p) => (p ?? "").trim()).join(" ").length;
}

function isAiFlagged(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "flagged";
}

function emptySnapshot(): AgencyHealthSnapshot {
  return {
    overall: 0,
    metrics: (Object.keys(BASE_WEIGHTS) as HealthMetricKey[]).map((key) =>
      metric(key, 0, 0, false),
    ),
    activeCodes: [],
    staffWithOverdueObligations: 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export const getAgencyHealthSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }): Promise<AgencyHealthSnapshot> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return emptySnapshot();

    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const orgId = data.organizationId;
    const since30 = isoDaysAgo(30);
    const today = todayISO();
    const now = new Date();
    const currentMonth = monthLabel(now);
    const quarter = quarterBounds(now);
    const monthStart = `${currentMonth}-01`;

    // ── Active service codes (gate conditional metrics) ─────────────────────
    const activeClientIds = await safe(async () => {
      const { data: rows } = await sb
        .from("clients")
        .select("id")
        .eq("organization_id", orgId)
        .neq("account_status", "archived");
      return ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
    }, [] as string[]);

    const activeCodes = await safe(async () => {
      if (!activeClientIds.length) return [] as string[];
      const { data: rows } = await sb
        .from("client_billing_codes")
        .select("service_code, service_end_date, service_start_date, authorization_pending, client_id")
        .eq("organization_id", orgId)
        .in("client_id", activeClientIds);
      const set = new Set<string>();
      for (const r of (rows ?? []) as Array<{
        service_code: string;
        service_end_date: string | null;
        service_start_date: string | null;
        authorization_pending: boolean | null;
      }>) {
        if (r.authorization_pending) continue;
        if (r.service_start_date && r.service_start_date > today) continue;
        if (r.service_end_date && r.service_end_date < today) continue;
        if (r.service_code) set.add(r.service_code.toUpperCase());
      }
      return Array.from(set).sort();
    }, [] as string[]);

    const hasBehavior = ["BC1", "BC2", "BC3"].some((c) => activeCodes.includes(c));
    const hasHhs = activeCodes.includes("HHS");
    const hasUpi = ["SEI", "SJD", "CMP", "CMS"].some((c) => activeCodes.includes(c));

    // ── 1. Staff Obligations (SOW source) ───────────────────────────────────
    const staffObligations = await safe(async () => {
      const { data: obs } = await sb
        .from("company_obligations")
        .select("id")
        .eq("organization_id", orgId)
        .eq("source", "sow")
        .eq("active", true);
      const ids = ((obs ?? []) as Array<{ id: string }>).map((o) => o.id);
      if (!ids.length) return { passing: 0, total: 0, overdueStaff: 0 };

      const { data: instances } = await sb
        .from("company_obligation_instances")
        .select("id, status, assignee_staff_id")
        .eq("organization_id", orgId)
        .in("obligation_id", ids);
      const rows = (instances ?? []) as Array<{
        id: string;
        status: string;
        assignee_staff_id: string | null;
      }>;
      const total = rows.length;
      const passing = rows.filter((r) => r.status === "completed" || r.status === "waived").length;
      const overdueStaff = new Set(
        rows
          .filter((r) => r.status === "overdue" && r.assignee_staff_id)
          .map((r) => r.assignee_staff_id as string),
      );
      // Also count assignees table for multi-assignee instances
      const overdueIds = rows.filter((r) => r.status === "overdue").map((r) => r.id);
      if (overdueIds.length) {
        const { data: assignees } = await sb
          .from("company_obligation_instance_assignees")
          .select("staff_id")
          .in("instance_id", overdueIds);
        for (const a of (assignees ?? []) as Array<{ staff_id: string }>) {
          if (a.staff_id) overdueStaff.add(a.staff_id);
        }
      }
      return { passing, total, overdueStaff: overdueStaff.size };
    }, { passing: 0, total: 0, overdueStaff: 0 });

    // ── 2. EVV Documentation Completeness ───────────────────────────────────
    const evv = await safe(async () => {
      const { data: rows } = await sb
        .from("evv_timesheets")
        .select("shift_note_text, attested_at, ai_compliance_status, clock_out_timestamp")
        .eq("organization_id", orgId)
        .not("clock_out_timestamp", "is", null)
        .gte("clock_out_timestamp", since30);
      const list = (rows ?? []) as Array<{
        shift_note_text: string | null;
        attested_at: string | null;
        ai_compliance_status: string | null;
      }>;
      const total = list.length;
      const passing = list.filter((r) => {
        const note = (r.shift_note_text ?? "").trim();
        return note.length > 50 && !!r.attested_at && !isAiFlagged(r.ai_compliance_status);
      }).length;
      return { passing, total };
    }, { passing: 0, total: 0 });

    // ── 3. Daily Progress Notes ─────────────────────────────────────────────
    const dailyNotes = await safe(async () => {
      const { data: rows } = await sb
        .from("daily_logs")
        .select("status, narrative, submitted_at, log_date")
        .eq("organization_id", orgId)
        .gte("log_date", since30.slice(0, 10));
      const list = (rows ?? []) as Array<{ status: string; narrative: string | null }>;
      const total = list.length;
      const passing = list.filter(
        (r) => r.status === "approved" && (r.narrative ?? "").trim().length >= 50,
      ).length;
      return { passing, total };
    }, { passing: 0, total: 0 });

    // ── 4. Medication Administration Records ────────────────────────────────
    const medication = await safe(async () => {
      const { data: emar } = await sb
        .from("emar_logs")
        .select("status, signature_attestation, administered_at, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", since30);
      const emarRows = (emar ?? []) as Array<{
        status: string;
        signature_attestation: string | null;
        administered_at: string | null;
      }>;
      const emarPassing = emarRows.filter((r) => {
        const st = (r.status ?? "").toLowerCase();
        const given = st === "given" || st === "administered" || st === "self_administered";
        return given && !!r.signature_attestation && !!r.administered_at;
      }).length;

      const { data: counts } = await sb
        .from("controlled_med_counts")
        .select("signature_data_url, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", since30);
      const countRows = (counts ?? []) as Array<{ signature_data_url: string | null }>;
      const countPassing = countRows.filter((r) => !!r.signature_data_url).length;

      const total = emarRows.length + countRows.length;
      const passing = emarPassing + countPassing;
      return { passing, total };
    }, { passing: 0, total: 0 });

    // ── 5. Incident Report Documentation ────────────────────────────────────
    const incidents = await safe(async () => {
      const { data: ir } = await sb
        .from("incident_reports")
        .select("status, narrative_before, narrative_during, narrative_after, description, filed_at, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", since30);
      const irRows = (ir ?? []) as Array<{
        status: string;
        narrative_before: string | null;
        narrative_during: string | null;
        narrative_after: string | null;
        description: string | null;
      }>;
      const irPass = irRows.filter((r) => {
        const st = (r.status ?? "").toLowerCase();
        const documented =
          st === "submitted_to_state" ||
          st === "state_confirmed" ||
          st === "submitted" ||
          st === "closed";
        const len = narrativeLen([
          r.narrative_before,
          r.narrative_during,
          r.narrative_after,
          r.description,
        ]);
        return documented && len >= 100;
      }).length;

      const { data: hir } = await sb
        .from("hhs_incident_reports")
        .select("status, narrative_before, narrative_during, narrative_after, description, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", since30);
      const hirRows = (hir ?? []) as Array<{
        status: string;
        narrative_before: string | null;
        narrative_during: string | null;
        narrative_after: string | null;
        description: string | null;
      }>;
      const hirPass = hirRows.filter((r) => {
        const st = (r.status ?? "").toLowerCase();
        const documented =
          st === "upi_filed" || st === "submitted" || st === "closed" || st === "submitted_to_state";
        const len = narrativeLen([
          r.narrative_before,
          r.narrative_during,
          r.narrative_after,
          r.description,
        ]);
        return documented && len >= 100;
      }).length;

      return {
        passing: irPass + hirPass,
        total: irRows.length + hirRows.length,
      };
    }, { passing: 0, total: 0 });

    // ── 6. UPI Attestations (SEI / SJD / CMP / CMS) ─────────────────────────
    const upi = await safe(async () => {
      if (!hasUpi || !activeClientIds.length) return { passing: 0, total: 0, applicable: false };

      const { data: codeRows } = await sb
        .from("client_billing_codes")
        .select("client_id, service_code, service_end_date, service_start_date, authorization_pending")
        .eq("organization_id", orgId)
        .in("client_id", activeClientIds);
      const upiClients = new Set<string>();
      for (const r of (codeRows ?? []) as Array<{
        client_id: string;
        service_code: string;
        service_end_date: string | null;
        service_start_date: string | null;
        authorization_pending: boolean | null;
      }>) {
        const code = (r.service_code ?? "").toUpperCase();
        if (!["SEI", "SJD", "CMP", "CMS"].includes(code)) continue;
        if (r.authorization_pending) continue;
        if (r.service_start_date && r.service_start_date > today) continue;
        if (r.service_end_date && r.service_end_date < today) continue;
        upiClients.add(r.client_id);
      }
      const total = upiClients.size;
      if (!total) return { passing: 0, total: 0, applicable: false };

      const { data: atts } = await sb
        .from("upi_attestations")
        .select("client_id, period_label")
        .eq("organization_id", orgId)
        .in("client_id", Array.from(upiClients));
      const current = new Set<string>();
      for (const a of (atts ?? []) as Array<{ client_id: string; period_label: string }>) {
        const label = a.period_label ?? "";
        if (
          label === currentMonth ||
          label.startsWith(currentMonth) ||
          label === "current month"
        ) {
          current.add(a.client_id);
        }
      }
      let passing = 0;
      for (const id of upiClients) if (current.has(id)) passing += 1;
      return { passing, total, applicable: true };
    }, { passing: 0, total: 0, applicable: hasUpi });

    // ── 7. HRC Documentation ────────────────────────────────────────────────
    const hrc = await safe(async () => {
      const { data: restrictions } = await sb
        .from("hrc_restriction_records")
        .select("id, client_id, active")
        .eq("organization_id", orgId)
        .eq("active", true);
      const activeRestrictions = (restrictions ?? []) as Array<{ id: string; client_id: string }>;
      if (!activeRestrictions.length) {
        // No restrictions to track = compliant (do not count against).
        return { passing: 0, total: 0, score: 100, applicable: true };
      }

      const { data: meetings } = await sb
        .from("hrc_meetings")
        .select("id, meeting_date")
        .eq("organization_id", orgId)
        .gte("meeting_date", quarter.start.slice(0, 10))
        .lte("meeting_date", quarter.end.slice(0, 10));
      const hasMeeting = ((meetings ?? []) as unknown[]).length > 0;

      const { data: reviews } = await sb
        .from("hrc_reviews")
        .select("id, client_id, status, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", quarter.start);
      const approvedByClient = new Set<string>();
      for (const r of (reviews ?? []) as Array<{ client_id: string | null; status: string }>) {
        const st = (r.status ?? "").toLowerCase();
        if ((st === "approved" || st === "closed") && r.client_id) {
          approvedByClient.add(r.client_id);
        }
      }

      // Restriction passes when an approved review exists for its client AND
      // the org held at least one HRC meeting this quarter.
      let passing = 0;
      if (hasMeeting) {
        for (const r of activeRestrictions) {
          if (approvedByClient.has(r.client_id)) passing += 1;
        }
      }
      return {
        passing,
        total: activeRestrictions.length,
        score: pct(passing, activeRestrictions.length),
        applicable: true,
      };
    }, { passing: 0, total: 0, score: 0, applicable: true });

    // ── 8. Behavior Support (BC1/BC2/BC3) ───────────────────────────────────
    const behavior = await safe(async () => {
      if (!hasBehavior) return { passing: 0, total: 0, applicable: false };
      const { data: entries } = await sb
        .from("bc_data_entries")
        .select("note, staff_user_id, occurred_at")
        .eq("organization_id", orgId)
        .gte("occurred_at", since30);
      const entryRows = (entries ?? []) as Array<{
        note: string | null;
        staff_user_id: string | null;
      }>;
      const entryPass = entryRows.filter(
        (r) => (r.note ?? "").trim().length >= 20 && !!r.staff_user_id,
      ).length;

      const { data: reviews } = await sb
        .from("bc_review_notes")
        .select("body, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", since30);
      const reviewRows = (reviews ?? []) as Array<{ body: string | null }>;
      const reviewPass = reviewRows.filter((r) => (r.body ?? "").trim().length >= 50).length;

      return {
        passing: entryPass + reviewPass,
        total: entryRows.length + reviewRows.length,
        applicable: true,
      };
    }, { passing: 0, total: 0, applicable: hasBehavior });

    // ── 9. Client Record Completeness ───────────────────────────────────────
    const clientRecords = await safe(async () => {
      const { data: rows } = await sb
        .from("clients")
        .select("id, intake_status")
        .eq("organization_id", orgId)
        .neq("account_status", "archived");
      const list = (rows ?? []) as Array<{ intake_status: string | null }>;
      const total = list.length;
      const passing = list.filter((r) => r.intake_status === "complete").length;
      return { passing, total };
    }, { passing: 0, total: 0 });

    // ── 10. Client-Specific Training Completion ─────────────────────────────
    const cst = await safe(async () => {
      const { data: assignments } = await sb
        .from("staff_assignments")
        .select("staff_id, client_id")
        .eq("organization_id", orgId);
      const pairs = (assignments ?? []) as Array<{ staff_id: string; client_id: string }>;
      const total = pairs.length;
      if (!total) return { passing: 0, total: 0 };

      const clientIds = Array.from(new Set(pairs.map((p) => p.client_id)));
      const { data: trainings } = await sb
        .from("client_specific_trainings")
        .select("id, client_id, status")
        .eq("organization_id", orgId)
        .in("client_id", clientIds);
      const publishedByClient = new Map<string, string[]>();
      for (const t of (trainings ?? []) as Array<{ id: string; client_id: string; status: string }>) {
        if (t.status !== "published" && t.status !== "approved") continue;
        const arr = publishedByClient.get(t.client_id) ?? [];
        arr.push(t.id);
        publishedByClient.set(t.client_id, arr);
      }
      const allTrainingIds = Array.from(publishedByClient.values()).flat();
      const staffIds = Array.from(new Set(pairs.map((p) => p.staff_id)));
      const completed = new Map<string, Set<string>>();
      if (allTrainingIds.length && staffIds.length) {
        const { data: comps } = await sb
          .from("training_completions")
          .select("user_id, ref_id")
          .eq("topic_kind", "person")
          .eq("is_current", true)
          .in("user_id", staffIds)
          .in("ref_id", allTrainingIds);
        for (const c of (comps ?? []) as Array<{ user_id: string; ref_id: string }>) {
          const set = completed.get(c.user_id) ?? new Set<string>();
          set.add(c.ref_id);
          completed.set(c.user_id, set);
        }
      }

      let passing = 0;
      for (const p of pairs) {
        const ids = publishedByClient.get(p.client_id) ?? [];
        if (!ids.length) continue;
        const done = completed.get(p.staff_id) ?? new Set();
        if (ids.some((id) => done.has(id))) passing += 1;
      }
      return { passing, total };
    }, { passing: 0, total: 0 });

    // ── 11. Policy Acknowledgments ──────────────────────────────────────────
    const policies = await safe(async () => {
      const { data: docs } = await sb
        .from("nectar_documents")
        .select("id, requires_acknowledgment, is_current, status")
        .eq("organization_id", orgId);
      const activePolicies = ((docs ?? []) as Array<{
        id: string;
        requires_acknowledgment: boolean | null;
        is_current: boolean | null;
        status: string | null;
      }>).filter(
        (d) =>
          !!d.requires_acknowledgment &&
          (d.is_current === true || d.status === "current"),
      );
      const { data: members } = await sb
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("active", true);
      const staffIds = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
      const policyCount = activePolicies.length;
      const staffCount = staffIds.length;
      const total = policyCount * staffCount;
      if (!total) return { passing: 0, total: 0 };

      const docIds = activePolicies.map((d) => d.id);
      const { data: sigs } = await sb
        .from("policy_signatures")
        .select("document_id, user_id, is_current")
        .in("document_id", docIds)
        .eq("is_current", true)
        .in("user_id", staffIds);
      const sigSet = new Set(
        ((sigs ?? []) as Array<{ document_id: string; user_id: string }>).map(
          (s) => `${s.document_id}:${s.user_id}`,
        ),
      );
      let passing = 0;
      for (const d of docIds) {
        for (const u of staffIds) {
          if (sigSet.has(`${d}:${u}`)) passing += 1;
        }
      }
      return { passing, total };
    }, { passing: 0, total: 0 });

    // ── 12. HHS Host Home Documentation ─────────────────────────────────────
    const hhs = await safe(async () => {
      if (!hasHhs) return { passing: 0, total: 0, applicable: false };

      const { data: attendance } = await sb
        .from("hhs_monthly_attendance")
        .select("staff_initials_signature, attestation_accepted, record_date, presence_status")
        .eq("organization_id", orgId)
        .gte("record_date", monthStart);
      const attRows = (attendance ?? []) as Array<{
        staff_initials_signature: string | null;
        attestation_accepted: boolean | null;
      }>;
      const attPass = attRows.filter(
        (r) => !!r.staff_initials_signature && !!r.attestation_accepted,
      ).length;

      const { data: drills } = await sb
        .from("hhs_evacuation_drills")
        .select("id, drill_executed_at, record_date")
        .eq("organization_id", orgId)
        .gte("record_date", quarter.start.slice(0, 10));
      const drillRows = (drills ?? []) as unknown[];
      const drillTotal = 1; // at least one drill expected per quarter
      const drillPass = drillRows.length > 0 ? 1 : 0;

      const { data: certs } = await sb
        .from("host_home_certifications")
        .select("id, next_due_date, determination, client_id")
        .eq("organization_id", orgId);
      const certRows = (certs ?? []) as Array<{
        next_due_date: string | null;
        determination: string;
      }>;
      // Latest-ish: treat certified homes with next_due_date > today as passing
      const certPass = certRows.filter((r) => {
        const okDet =
          r.determination === "certified" || r.determination === "certified_with_corrections";
        const dueOk = !r.next_due_date || r.next_due_date > today;
        return okDet && dueOk;
      }).length;

      const total = attRows.length + drillTotal + certRows.length;
      const passing = attPass + drillPass + certPass;
      return { passing, total, applicable: true };
    }, { passing: 0, total: 0, applicable: hasHhs });

    // ── 13. Billing Submission Accuracy ─────────────────────────────────────
    const billing = await safe(async () => {
      const { data: subs } = await sb
        .from("billing_submissions")
        .select("id, status, submitted_at, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", since30);
      const all = (subs ?? []) as Array<{ id: string; status: string }>;
      const submitted = all.filter((s) => {
        const st = (s.status ?? "").toLowerCase();
        return st !== "draft" && st !== "rejected";
      });
      const total = submitted.length;
      if (!total) return { passing: 0, total: 0 };

      const ids = submitted.map((s) => s.id);
      const { data: warnings } = await sb
        .from("billing_submission_warnings")
        .select("submission_id, status")
        .in("submission_id", ids)
        .eq("status", "pending");
      const warned = new Set(
        ((warnings ?? []) as Array<{ submission_id: string }>).map((w) => w.submission_id),
      );
      const passing = submitted.filter((s) => !warned.has(s.id)).length;
      return { passing, total };
    }, { passing: 0, total: 0 });

    // ── 14. HR Document Currency ────────────────────────────────────────────
    const hrDocs = await safe(async () => {
      const { data: members } = await sb
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("active", true);
      const staffIds = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
      const total = staffIds.length;
      if (!total) return { passing: 0, total: 0 };

      const { data: docs } = await sb
        .from("hr_documents")
        .select("staff_id")
        .eq("organization_id", orgId)
        .in("staff_id", staffIds);
      const withDocs = new Set(
        ((docs ?? []) as Array<{ staff_id: string }>).map((d) => d.staff_id),
      );
      let passing = 0;
      for (const id of staffIds) if (withDocs.has(id)) passing += 1;
      return { passing, total };
    }, { passing: 0, total: 0 });

    // ── Assemble metrics with gating ────────────────────────────────────────
    const medApplicable = medication.total > 0;

    const metrics: HealthMetric[] = [
      metric("staff_obligations", staffObligations.passing, staffObligations.total, true),
      metric("evv_documentation", evv.passing, evv.total, true),
      metric("daily_progress_notes", dailyNotes.passing, dailyNotes.total, true),
      metric("medication_records", medication.passing, medication.total, medApplicable),
      metric("incident_documentation", incidents.passing, incidents.total, true),
      metric("upi_attestations", upi.passing, upi.total, upi.applicable),
      metric("hrc_documentation", hrc.passing, hrc.total, hrc.applicable, hrc.score),
      metric("behavior_support", behavior.passing, behavior.total, behavior.applicable),
      metric("client_record_completeness", clientRecords.passing, clientRecords.total, true),
      metric("client_specific_training", cst.passing, cst.total, true),
      metric("policy_acknowledgments", policies.passing, policies.total, true),
      metric("hhs_host_home", hhs.passing, hhs.total, hhs.applicable),
      metric("billing_accuracy", billing.passing, billing.total, true),
      metric("hr_document_currency", hrDocs.passing, hrDocs.total, true),
    ];

    return {
      overall: weightedOverall(metrics),
      metrics,
      activeCodes,
      staffWithOverdueObligations: staffObligations.overdueStaff,
    };
  });
