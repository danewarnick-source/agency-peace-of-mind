// Live DSPD review-tool evidence. Fail-open: a missing table or RLS miss
// must never blank the register — that item stays "unknown" and the rest
// still score.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { computeRestrictionCompletion, type RestrictionRecord } from "./hrc-restrictions";
import { isEvvLockedCode } from "./evv-codes";
import {
  EMPTY_AUDIT_EVIDENCE,
  personNeedsSupportStrategies,
  type AuditEvidenceItem,
  type AuditEvidenceSnapshot,
  type HomeAuditEvidence,
  type PersonAuditEvidence,
} from "./audit-evidence";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

async function maybe<T>(
  run: () => PromiseLike<{ data: T | null; error: { message?: string } | null }>,
  fallback: T,
): Promise<T> {
  try {
    const { data, error } = await run();
    if (error) {
      console.warn("[audit-evidence]", error.message);
      return fallback;
    }
    return (data ?? fallback) as T;
  } catch (e) {
    console.warn("[audit-evidence]", e);
    return fallback;
  }
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function yes(label: string, detail?: string, href?: string): AuditEvidenceItem {
  return { verdict: "yes", label, detail, href };
}
function no(label: string, detail?: string, href?: string): AuditEvidenceItem {
  return { verdict: "no", label, detail, href };
}
function na(label: string, detail?: string): AuditEvidenceItem {
  return { verdict: "na", label, detail };
}
function open(label: string, detail?: string, href?: string): AuditEvidenceItem {
  return { verdict: "open", label, detail, href };
}

export async function getAuditEvidenceSnapshotInternal(
  supabase: AnySupabase,
  organizationId: string,
): Promise<AuditEvidenceSnapshot> {
  const today = new Date().toISOString().slice(0, 10);
  const last30 = daysAgoISO(30);
  const last365 = daysAgoISO(365);

  const [
    clientRows,
    codeRows,
    teamRows,
    docRows,
    belongRows,
    medRows,
    loanRows,
    summaryRows,
    meetingRows,
    restrictionRows,
    incidentRows,
    timesheetRows,
    hhsRows,
    strategyObRows,
  ] = await Promise.all([
    maybe(
      () =>
        supabase
          .from("clients")
          .select(
            "id, first_name, last_name, team_id, has_abi, grievance_acknowledged, grievance_signed_date, account_status",
          )
          .eq("organization_id", organizationId)
          .eq("account_status", "active"),
      [] as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        team_id: string | null;
        has_abi: boolean | null;
        grievance_acknowledged: boolean | null;
        grievance_signed_date: string | null;
      }>,
    ),
    maybe(
      () =>
        supabase
          .from("client_billing_codes")
          .select("client_id, service_code, service_end_date, authorization_pending")
          .eq("organization_id", organizationId),
      [] as Array<{
        client_id: string;
        service_code: string | null;
        service_end_date: string | null;
        authorization_pending: boolean | null;
      }>,
    ),
    maybe(
      () => supabase.from("teams").select("id, team_name").eq("organization_id", organizationId),
      [] as Array<{ id: string; team_name: string | null }>,
    ),
    maybe(
      () =>
        supabase
          .from("client_documents")
          .select("client_id, document_type")
          .eq("organization_id", organizationId),
      [] as Array<{ client_id: string; document_type: string | null }>,
    ),
    maybe(
      () =>
        supabase
          .from("client_belongings")
          .select("client_id, inventoried_on")
          .eq("organization_id", organizationId),
      [] as Array<{ client_id: string; inventoried_on: string | null }>,
    ),
    maybe(
      () =>
        supabase
          .from("client_medications")
          .select("client_id")
          .eq("organization_id", organizationId),
      [] as Array<{ client_id: string }>,
    ),
    maybe(
      () =>
        supabase
          .from("client_loans")
          .select("client_id, status, advance_amount")
          .eq("organization_id", organizationId),
      [] as Array<{ client_id: string; status: string | null; advance_amount: number | null }>,
    ),
    maybe(
      () =>
        supabase
          .from("client_progress_summaries")
          .select(
            "client_id, status, due_date, finalized_at, requires_upi_attestation, upi_entered_at, period_label",
          )
          .eq("organization_id", organizationId)
          .order("due_date", { ascending: false }),
      [] as Array<{
        client_id: string;
        status: string | null;
        due_date: string;
        finalized_at: string | null;
        requires_upi_attestation: boolean | null;
        upi_entered_at: string | null;
        period_label: string | null;
      }>,
    ),
    maybe(
      () =>
        supabase
          .from("hrc_meetings")
          .select("id, meeting_date, minutes, attendees")
          .eq("organization_id", organizationId)
          .order("meeting_date", { ascending: false })
          .limit(5),
      [] as Array<{
        id: string;
        meeting_date: string | null;
        minutes: string | null;
        attendees: string | null;
      }>,
    ),
    maybe(
      () =>
        supabase
          .from("hrc_restriction_records")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("active", true),
      [] as RestrictionRecord[],
    ),
    maybe(
      () =>
        supabase
          .from("incident_reports")
          .select("id, state_submission_deadline, state_submitted_at, status")
          .eq("organization_id", organizationId),
      [] as Array<{
        id: string;
        state_submission_deadline: string | null;
        state_submitted_at: string | null;
        status: string | null;
      }>,
    ),
    maybe(
      () =>
        supabase
          .from("evv_timesheets")
          .select("id, service_type_code, review_status, gps_validated, clock_in_timestamp")
          .eq("organization_id", organizationId)
          .gte("clock_in_timestamp", `${last30}T00:00:00Z`),
      [] as Array<{
        id: string;
        service_type_code: string | null;
        review_status: string | null;
        gps_validated: boolean | null;
        clock_in_timestamp: string;
      }>,
    ),
    maybe(
      () =>
        supabase
          .from("hhs_daily_records_v")
          .select("client_id, record_date, billable, blocked_reason, service_code")
          .eq("organization_id", organizationId)
          .eq("service_code", "HHS")
          .gte("record_date", last30),
      [] as Array<{
        client_id: string | null;
        record_date: string | null;
        billable: boolean | null;
        blocked_reason: string | null;
        service_code: string | null;
      }>,
    ),
    maybe(
      () =>
        supabase
          .from("company_obligations")
          .select("id")
          .eq("organization_id", organizationId)
          .ilike("title", "Support Strategies%"),
      [] as Array<{ id: string }>,
    ),
  ]);

  const teamName = new Map(teamRows.map((t) => [t.id, t.team_name ?? "Home"]));
  const codesByClient = new Map<string, Set<string>>();
  for (const r of codeRows) {
    if (!r.service_code) continue;
    if (r.service_end_date && r.service_end_date < today) continue;
    if (r.authorization_pending) continue;
    const set = codesByClient.get(r.client_id) ?? new Set<string>();
    set.add(r.service_code.toUpperCase());
    codesByClient.set(r.client_id, set);
  }

  const docsByClient = new Map<string, Set<string>>();
  for (const d of docRows) {
    const set = docsByClient.get(d.client_id) ?? new Set<string>();
    if (d.document_type) set.add(d.document_type);
    docsByClient.set(d.client_id, set);
  }

  const belongByClient = new Map<string, string>();
  for (const b of belongRows) {
    if (!b.inventoried_on) continue;
    const prev = belongByClient.get(b.client_id);
    if (!prev || b.inventoried_on > prev)
      belongByClient.set(b.client_id, b.inventoried_on.slice(0, 10));
  }

  const medsByClient = new Set(medRows.map((m) => m.client_id));

  const loansByClient = new Map<
    string,
    Array<{ status: string | null; advance_amount: number | null }>
  >();
  for (const l of loanRows) {
    const list = loansByClient.get(l.client_id) ?? [];
    list.push(l);
    loansByClient.set(l.client_id, list);
  }

  const summariesByClient = new Map<string, typeof summaryRows>();
  for (const s of summaryRows) {
    const list = summariesByClient.get(s.client_id) ?? [];
    list.push(s);
    summariesByClient.set(s.client_id, list);
  }

  const restrictionsByClient = new Map<string, RestrictionRecord[]>();
  for (const r of restrictionRows) {
    const list = restrictionsByClient.get(r.client_id) ?? [];
    list.push(r);
    restrictionsByClient.set(r.client_id, list);
  }

  const strategyObIds = strategyObRows.map((o) => o.id);
  const strategyInstRows = strategyObIds.length
    ? await maybe(
        () =>
          supabase
            .from("company_obligation_instances")
            .select("client_id, status")
            .eq("organization_id", organizationId)
            .in("obligation_id", strategyObIds),
        [] as Array<{ client_id: string | null; status: string | null }>,
      )
    : [];
  const strategiesByClient = new Map<string, string[]>();
  for (const row of strategyInstRows) {
    if (!row.client_id) continue;
    const list = strategiesByClient.get(row.client_id) ?? [];
    list.push(row.status ?? "pending");
    strategiesByClient.set(row.client_id, list);
  }

  const ssTrainings = await maybe(
    () =>
      supabase
        .from("client_specific_trainings")
        .select("client_id, status, training_type")
        .eq("organization_id", organizationId)
        .eq("training_type", "support_strategies"),
    [] as Array<{ client_id: string; status: string | null; training_type: string | null }>,
  );
  const publishedStrategies = new Set(
    ssTrainings
      .filter((r) => r.status === "published" || r.status === "approved")
      .map((r) => r.client_id),
  );

  const hhsByClient = new Map<string, { present: number; blocked: number }>();
  for (const r of hhsRows) {
    if (!r.client_id) continue;
    const cur = hhsByClient.get(r.client_id) ?? { present: 0, blocked: 0 };
    if (r.billable) cur.present += 1;
    else cur.blocked += 1;
    hhsByClient.set(r.client_id, cur);
  }

  const people: PersonAuditEvidence[] = clientRows.map((c) => {
    const codes = Array.from(codesByClient.get(c.id) ?? []).sort();
    const docs = docsByClient.get(c.id) ?? new Set<string>();
    const belongOn = belongByClient.get(c.id) ?? null;
    const belongOk = !!belongOn && belongOn >= last365;
    const loans = (loansByClient.get(c.id) ?? []).filter(
      (l) => !l.status || !["closed", "paid", "cancelled", "void"].includes(l.status.toLowerCase()),
    );
    const restrictions = restrictionsByClient.get(c.id) ?? [];
    let restriction_ok: boolean | null = null;
    let restriction_detail: string | null = null;
    if (restrictions.length) {
      const scores = restrictions.map((r) => computeRestrictionCompletion(r));
      restriction_ok = scores.every((s) => s.isComplete);
      const incomplete = scores.filter((s) => !s.isComplete);
      restriction_detail = restriction_ok
        ? `${restrictions.length} restriction${restrictions.length === 1 ? "" : "s"} complete`
        : `${incomplete.length} of ${restrictions.length} missing elements`;
    }

    const summaries = summariesByClient.get(c.id) ?? [];
    let summary_ok: boolean | null = null;
    let summary_detail: string | null = null;
    if (summaries.length) {
      const overdue = summaries.filter((s) => {
        const due = s.due_date.slice(0, 10);
        const finalized = s.status === "finalized" || !!s.finalized_at;
        const upiGap = s.requires_upi_attestation && finalized && !s.upi_entered_at && due < today;
        return (due < today && !finalized) || upiGap;
      });
      const latest = summaries[0];
      const latestFinal = latest.status === "finalized" || !!latest.finalized_at;
      const latestUpiOk = !latest.requires_upi_attestation || !!latest.upi_entered_at;
      summary_ok = overdue.length === 0 && latestFinal && latestUpiOk;
      summary_detail = overdue.length
        ? `${overdue.length} overdue (${overdue[0]?.period_label ?? overdue[0]?.due_date})`
        : latest.period_label
          ? `${latest.period_label} ${latestFinal ? "finalized" : latest.status}`
          : latest.status;
    }

    const strategyStatuses = strategiesByClient.get(c.id) ?? [];
    let support_strategies_ok: boolean | null = null;
    if (!personNeedsSupportStrategies(codes)) {
      support_strategies_ok = null;
    } else if (strategyStatuses.some((s) => s === "completed")) {
      support_strategies_ok = true;
    } else if (publishedStrategies.has(c.id)) {
      support_strategies_ok = true;
    } else if (
      docs.has("support_strategies") ||
      docs.has("bsp") ||
      docs.has("behavior_support_plan")
    ) {
      support_strategies_ok = true;
    } else {
      support_strategies_ok = false;
    }

    const hhs = hhsByClient.get(c.id);
    let hhs_billable_ok: boolean | null = null;
    let hhs_blocked = 0;
    let hhs_present = 0;
    if (hhs) {
      hhs_blocked = hhs.blocked;
      hhs_present = hhs.present;
      hhs_billable_ok = hhs.blocked === 0;
    } else if (codes.includes("HHS")) {
      hhs_billable_ok = null;
    }

    return {
      client_id: c.id,
      full_name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Person",
      service_codes: codes,
      team_id: c.team_id,
      team_name: c.team_id ? (teamName.get(c.team_id) ?? null) : null,
      has_abi: !!c.has_abi,
      grievance_ok: !!c.grievance_acknowledged || !!c.grievance_signed_date,
      belongings_ok: belongOk,
      belongings_on: belongOn,
      rnb_ok: docs.has("room_board_agreement"),
      lease_ok: docs.has("lease_agreement") || docs.has("lease"),
      support_strategies_ok,
      medical_exam_ok: docs.has("medical_exam"),
      dental_exam_ok: docs.has("dental_exam"),
      restriction_ok,
      restriction_detail,
      summary_ok,
      summary_detail,
      hhs_billable_ok,
      hhs_blocked,
      hhs_present,
      loans_ok: loans.length === 0 ? null : true,
      meds_ok: medsByClient.has(c.id) ? true : null,
    };
  });

  const homesMap = new Map<string, HomeAuditEvidence>();
  for (const p of people) {
    if (!p.team_id) continue;
    for (const code of p.service_codes) {
      if (code !== "HHS" && code !== "RHS" && code !== "PPS") continue;
      const key = `${p.team_id}:${code}`;
      const existing = homesMap.get(key);
      if (existing) existing.client_count += 1;
      else {
        homesMap.set(key, {
          team_id: p.team_id,
          team_name: p.team_name ?? "Home",
          service_code: code,
          client_count: 1,
        });
      }
    }
  }
  const homes = Array.from(homesMap.values()).sort((a, b) =>
    a.team_name.localeCompare(b.team_name),
  );

  const items: Record<string, AuditEvidenceItem> = {};

  const latestMeeting = meetingRows[0];
  if (!latestMeeting) {
    items["I-3"] = no("No HRC meeting on file", undefined, "/dashboard/hub/documentation?tab=hrc");
  } else {
    const dated = latestMeeting.meeting_date ?? "";
    const hasNotes =
      !!(latestMeeting.minutes && latestMeeting.minutes.trim()) ||
      !!(latestMeeting.attendees && latestMeeting.attendees.trim());
    items["I-3"] = hasNotes
      ? yes(
          `Last HRC ${dated || "on file"}`,
          "Minutes or attendance recorded",
          "/dashboard/hub/documentation?tab=hrc",
        )
      : open(
          `HRC meeting ${dated || "on file"} — add minutes/attendance`,
          undefined,
          "/dashboard/hub/documentation?tab=hrc",
        );
  }

  const lateIncidents = incidentRows.filter((r) => {
    if (!r.state_submission_deadline) return false;
    if (r.state_submitted_at) return false;
    return r.state_submission_deadline.slice(0, 10) < today;
  });
  if (!incidentRows.length) {
    items["I-5"] = open(
      "No incident reports in HIVE yet",
      undefined,
      "/dashboard/hub/documentation?tab=incidents",
    );
  } else if (lateIncidents.length) {
    items["I-5"] = no(
      `${lateIncidents.length} incident${lateIncidents.length === 1 ? "" : "s"} past the state deadline`,
      "Submit in USTEPS/UPI and record the confirmation in HIVE",
      "/dashboard/hub/documentation?tab=incidents",
    );
  } else {
    items["I-5"] = yes(
      "No incidents past the state deadline",
      undefined,
      "/dashboard/hub/documentation?tab=incidents",
    );
  }

  const bigLoans = loanRows.filter((l) => (l.advance_amount ?? 0) >= 2000);
  if (!loanRows.length) {
    items["I-11"] = na("N/A — no contractor loans on file");
  } else if (bigLoans.length) {
    items["I-11"] = open(
      `${bigLoans.length} loan${bigLoans.length === 1 ? "" : "s"} of $2,000+ — confirm DHHS QA disclosure`,
      undefined,
      "/dashboard/client-loans",
    );
  } else {
    items["I-11"] = yes("Loans on file are under $2,000", undefined, "/dashboard/client-loans");
  }

  const grievanceMissing = people.filter((p) => !p.grievance_ok);
  items["II-7"] = people.length
    ? grievanceMissing.length
      ? no(
          `${grievanceMissing.length} of ${people.length} Persons missing grievance acknowledgment`,
          grievanceMissing
            .slice(0, 4)
            .map((p) => p.full_name)
            .join(", ") + (grievanceMissing.length > 4 ? "…" : ""),
          "/dashboard/hub/clients",
        )
      : yes(`All ${people.length} Persons have a grievance acknowledgment`)
    : open("No active Persons on file");

  const restrictionPeople = people.filter((p) => p.restriction_ok !== null);
  const restrictionGaps = restrictionPeople.filter((p) => p.restriction_ok === false);
  items["II-8"] = restrictionPeople.length
    ? restrictionGaps.length
      ? no(
          `${restrictionGaps.length} Person${restrictionGaps.length === 1 ? "" : "s"} missing restriction elements`,
          undefined,
          "/dashboard/hub/documentation?tab=hrc",
        )
      : yes(
          `${restrictionPeople.length} restriction record${restrictionPeople.length === 1 ? "" : "s"} complete`,
        )
    : na("N/A — no active rights restrictions");

  const belongingsPeople = people.filter((p) =>
    p.service_codes.some((c) => ["HHS", "SLH", "PPS", "RHS"].includes(c)),
  );
  const belongingsGaps = belongingsPeople.filter((p) => !p.belongings_ok);
  items["II-9"] = belongingsPeople.length
    ? belongingsGaps.length
      ? no(
          `${belongingsGaps.length} of ${belongingsPeople.length} missing a current belongings inventory`,
          undefined,
          "/dashboard/hub/clients",
        )
      : yes(
          `Belongings current for ${belongingsPeople.length} Person${belongingsPeople.length === 1 ? "" : "s"}`,
        )
    : na("N/A — no HHS/SLH/PPS/RHS Persons");

  const rnbPeople = people.filter((p) => p.service_codes.includes("HHS"));
  const rnbGaps = rnbPeople.filter((p) => !p.rnb_ok);
  items["II-10-HHS"] = rnbPeople.length
    ? rnbGaps.length
      ? no(
          `${rnbGaps.length} of ${rnbPeople.length} HHS Persons missing a room-and-board agreement`,
        )
      : yes("Room-and-board agreement on file for every HHS Person")
    : na("N/A — no HHS Persons");

  const summaryGaps = people.filter((p) => p.summary_ok === false);
  const summaryOk = people.filter((p) => p.summary_ok === true);
  items["II-6"] = summaryGaps.length
    ? no(
        `${summaryGaps.length} Person${summaryGaps.length === 1 ? "" : "s"} with overdue summaries`,
        undefined,
        "/dashboard/summaries",
      )
    : summaryOk.length
      ? yes(
          `${summaryOk.length} Person${summaryOk.length === 1 ? "" : "s"} current on summaries`,
          undefined,
          "/dashboard/summaries",
        )
      : open("No summary periods generated yet", undefined, "/dashboard/summaries");

  const ssPeople = people.filter((p) => p.support_strategies_ok !== null);
  const ssGaps = ssPeople.filter((p) => p.support_strategies_ok === false);
  items["II-3"] = ssPeople.length
    ? ssGaps.length
      ? open(
          `${ssGaps.length} of ${ssPeople.length} missing completed Support Strategies`,
          "Uploading a PCSP starts the 30-day clock per assigned staff.",
        )
      : yes("Support Strategies completed for every Person who needs them")
    : na("N/A — no Persons who require Support Strategies");

  const evvRows = timesheetRows.filter((t) => isEvvLockedCode(t.service_type_code));
  const evvOpen = evvRows.filter((t) => {
    const st = (t.review_status ?? "").toLowerCase();
    if (["approved", "validated", "cleared"].includes(st)) return false;
    if (t.gps_validated) return false;
    return st === "pending" || st === "needs_review" || st === "flagged" || st === "";
  });
  items["III-2"] = evvRows.length
    ? evvOpen.length
      ? open(
          `${evvOpen.length} of ${evvRows.length} EVV visits in the last 30 days still need review`,
          undefined,
          "/dashboard/compliance-desk",
        )
      : yes(
          `${evvRows.length} EVV visits in the last 30 days reviewed`,
          undefined,
          "/dashboard/compliance-desk",
        )
    : open("No EVV visits in the last 30 days", undefined, "/dashboard/compliance-desk");

  const hhsGaps = people.filter((p) => p.hhs_billable_ok === false);
  const hhsOk = people.filter((p) => p.hhs_billable_ok === true);
  items["III-HHS"] = hhsGaps.length
    ? no(
        `${hhsGaps.length} Person${hhsGaps.length === 1 ? "" : "s"} with unbillable HHS days in the last 30`,
        hhsGaps
          .slice(0, 4)
          .map((p) => `${p.full_name} (${p.hhs_blocked} blocked)`)
          .join(", "),
      )
    : hhsOk.length
      ? yes(
          `HHS days billable for ${hhsOk.length} Person${hhsOk.length === 1 ? "" : "s"} in the last 30`,
        )
      : open("No HHS daily records in the last 30 days");

  items["III-1"] =
    items["III-HHS"]?.verdict === "no"
      ? items["III-HHS"]
      : open(
          "Timesheets live in the compliance desk",
          "HHS daily notes are the written summary for host-home days.",
          "/dashboard/compliance-desk",
        );

  const hhsHomes = homes.filter((h) => h.service_code === "HHS");
  items["I-2-HHS"] = hhsHomes.length
    ? open(
        `${hhsHomes.length} HHS home${hhsHomes.length === 1 ? "" : "s"} — certify each site`,
        hhsHomes.map((h) => `${h.team_name} (${h.client_count})`).join(", "),
      )
    : na("N/A — no HHS homes with active Persons");

  const loanPeople = people.filter((p) => p.loans_ok !== null);
  items["II-LOAN"] = loanPeople.length
    ? open(
        `${loanPeople.length} Person${loanPeople.length === 1 ? "" : "s"} with a loan on file`,
        undefined,
        "/dashboard/client-loans",
      )
    : na("N/A — no loans");

  return {
    generated_at: new Date().toISOString(),
    items,
    people,
    homes,
  };
}

export const getAuditEvidenceSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return EMPTY_AUDIT_EVIDENCE;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    try {
      return await getAuditEvidenceSnapshotInternal(supabase, data.organizationId);
    } catch (e) {
      console.warn("[audit-evidence] snapshot failed", e);
      return EMPTY_AUDIT_EVIDENCE;
    }
  });
