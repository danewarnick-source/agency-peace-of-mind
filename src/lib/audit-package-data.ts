/**
 * PHI SEAM — stubbed to seed data until compliant host + BAA are live.
 *
 * This is the ONLY function that touches subject-level records for an audit
 * package. When the compliant host + BAA are live, repoint the internals to
 * Supabase queries — the shape of AuditPackagePayload does not change, so
 * NECTAR summarization/audit-proofing runs identically on seed and live data.
 *
 * Do NOT import Supabase or read real client/staff records from here yet.
 */

export interface AuditPackageSubjectSummary {
  subject_type: "staff" | "client";
  subject_id: string;
  subject_label: string;
  timesheets: Array<{
    date: string;
    service_code: string;
    hours: number;
    units: number;
    evv_verified: boolean;
  }>;
  pcsp_goals: Array<{
    goal: string;
    progress_pct: number;
    last_note_date: string;
    last_note: string;
  }>;
  pba_ledger: Array<{
    date: string;
    kind: "deposit" | "withdrawal";
    amount_cents: number;
    memo: string;
  }>;
  billing_support_docs: Array<{
    doc_type: string;
    title: string;
    date: string;
    status: "on_file" | "missing" | "expired";
  }>;
}

export interface AuditPackagePayload {
  package_id: string;
  date_range_start: string;
  date_range_end: string;
  state_agency: string;
  subjects: AuditPackageSubjectSummary[];
  nectar_summary: {
    overall: string;
    per_subject: Record<string, string>;
    flags: Array<{ subject_id: string; severity: "info" | "warn" | "risk"; message: string }>;
  };
  is_seed: boolean;
}

/**
 * PHI SEAM — stubbed to seed data until compliant host + BAA.
 *
 * Reads audit_packages + audit_package_subjects rows for shape, then fabricates
 * synthetic timesheet / PCSP / PBA / billing-support records for each subject.
 * NECTAR summaries here are placeholder deterministic text derived from the
 * seed shape so downstream UI can render without any real model call yet.
 */
export async function getAuditPackageData(
  auditPackageId: string,
  meta: {
    date_range_start: string;
    date_range_end: string;
    state_agency: string;
    subjects: Array<{ subject_type: "staff" | "client"; subject_id: string; subject_label: string | null }>;
  },
): Promise<AuditPackagePayload> {
  const subjects: AuditPackageSubjectSummary[] = meta.subjects.map((s, i) => {
    const label = s.subject_label ?? `${s.subject_type === "staff" ? "Staff" : "Client"} #${i + 1}`;
    const seedTimesheets = [
      { date: meta.date_range_start, service_code: s.subject_type === "staff" ? "RHS" : "SLH", hours: 8, units: 32, evv_verified: true },
      { date: meta.date_range_end, service_code: s.subject_type === "staff" ? "DSI" : "SLH", hours: 6, units: 24, evv_verified: true },
    ];
    const seedGoals = s.subject_type === "client"
      ? [
          { goal: "Attend community outing weekly", progress_pct: 75, last_note_date: meta.date_range_end, last_note: "Attended library visit; engaged for 45 min." },
          { goal: "Practice self-medication reminders", progress_pct: 50, last_note_date: meta.date_range_end, last_note: "Cued 2/3 times; prompted for water." },
        ]
      : [];
    const seedPba = s.subject_type === "client"
      ? [
          { date: meta.date_range_start, kind: "deposit" as const, amount_cents: 25000, memo: "SSI monthly deposit" },
          { date: meta.date_range_end, kind: "withdrawal" as const, amount_cents: 1200, memo: "Personal spending — coffee outing" },
        ]
      : [];
    const seedDocs = [
      { doc_type: "PCSP", title: "Person-Centered Support Plan", date: meta.date_range_start, status: "on_file" as const },
      { doc_type: "Auth 1056", title: "Service Authorization", date: meta.date_range_start, status: "on_file" as const },
      { doc_type: "Timesheet", title: "Weekly timesheet packet", date: meta.date_range_end, status: "on_file" as const },
    ];
    return {
      subject_type: s.subject_type,
      subject_id: s.subject_id,
      subject_label: label,
      timesheets: seedTimesheets,
      pcsp_goals: seedGoals,
      pba_ledger: seedPba,
      billing_support_docs: seedDocs,
    };
  });

  const perSubject: Record<string, string> = {};
  const flags: AuditPackagePayload["nectar_summary"]["flags"] = [];
  for (const s of subjects) {
    const totalHours = s.timesheets.reduce((a, t) => a + t.hours, 0);
    perSubject[s.subject_id] = `${s.subject_label}: ${s.timesheets.length} timesheet entries totaling ${totalHours} hrs; ${s.pcsp_goals.length} PCSP goals tracked; ${s.pba_ledger.length} PBA entries; ${s.billing_support_docs.filter((d) => d.status === "on_file").length}/${s.billing_support_docs.length} support docs on file.`;
    if (s.billing_support_docs.some((d) => d.status !== "on_file")) {
      flags.push({ subject_id: s.subject_id, severity: "warn", message: "One or more support documents missing or expired." });
    }
  }

  return {
    package_id: auditPackageId,
    date_range_start: meta.date_range_start,
    date_range_end: meta.date_range_end,
    state_agency: meta.state_agency,
    subjects,
    nectar_summary: {
      overall: `Audit packet spans ${meta.date_range_start} → ${meta.date_range_end} for ${meta.state_agency}. ${subjects.length} subjects included. All records shown are synthetic seed data pending compliant-host cutover.`,
      per_subject: perSubject,
      flags,
    },
    is_seed: true,
  };
}
