import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAddonForOrg } from "@/lib/entitlements.server";

/**
 * Internal Audit (QA / audit-prep) — Foundation: NECTAR.
 *
 * Runs read-only checks against the company's actual HIVE data and surfaces
 * gaps the way a state auditor would. NECTAR identifies; the company acts.
 * This DOES NOT certify compliance — it's the company auditing itself so
 * issues are caught before a formal audit.
 *
 * Both modes share the same engine: on-demand (run now) and continuous
 * (queried by the Task Center on a polling interval).
 */

export type Severity = "critical" | "attention" | "minor";
export type FindingArea =
  | "documentation"
  | "daily_logs"
  | "evv_timesheets"
  | "billing"
  | "staff_certifications"
  | "requirements_engine"
  | "external_attestations";

export interface AuditFinding {
  id: string;
  area: FindingArea;
  severity: Severity;
  title: string;
  detail: string;
  /** Authoritative-source trace ("per SOW §X") when known. */
  sourceCitation?: string | null;
  /** Subject of the finding (client / staff / code) for grouping + deep-link. */
  subjectKind: "client" | "staff" | "code" | "provider";
  subjectId?: string | null;
  subjectName?: string | null;
  /** Deep-link path inside HIVE to the record that needs fixing. */
  fixHref?: string | null;
  fixLabel?: string | null;
  /** When the issue surfaced (record date / today). */
  asOf: string;
}

export interface AuditSummary {
  generatedAt: string;
  scope: {
    clientId?: string | null;
    staffId?: string | null;
    clientIds?: string[] | null;
    staffIds?: string[] | null;
    sampleClients?: Array<{ id: string; name: string }> | null;
    sampleStaff?: Array<{ id: string; name: string }> | null;
    serviceCode?: string | null;
    area?: FindingArea | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  };
  totals: { critical: number; attention: number; minor: number; total: number };
  /** 0-100 — proportion of checks that came back clean, weighted by severity. */
  readinessScore: number;
  byArea: Record<FindingArea, number>;
  findings: AuditFinding[];
}

const auditInput = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid().optional().nullable(),
  staffId: z.string().uuid().optional().nullable(),
  clientIds: z.array(z.string().uuid()).optional().nullable(),
  staffIds: z.array(z.string().uuid()).optional().nullable(),
  serviceCode: z.string().max(40).optional().nullable(),
  area: z
    .enum([
      "documentation",
      "daily_logs",
      "evv_timesheets",
      "billing",
      "staff_certifications",
      "requirements_engine",
      "external_attestations",
    ])
    .optional()
    .nullable(),
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
});


const DAILY_CODE_HINTS = ["HOST", "HHS", "T2033", "DAILY"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

export const runInternalAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => auditInput.parse(input))
  .handler(async ({ data, context }): Promise<AuditSummary> => {
    const { supabase, userId } = context;
    // Server-side tier enforcement — the UI lock and this check must agree.
    await assertAddonForOrg(supabase, userId, "internal_audit", data.organizationId);
    const orgId = data.organizationId;
    const now = new Date();
    const dateFrom = data.dateFrom ?? null;
    const dateTo = data.dateTo ?? null;
    const wantArea = data.area ?? null;

    const findings: AuditFinding[] = [];
    let reqScopeCounts = {
      inScopeCount: 0,
      dormantCount: 0,
      autoSatisfiedCount: 0,
      needsEvidenceCount: 0,
    };
    const include = (area: FindingArea) => !wantArea || wantArea === area;

    // ------- Lookups --------
    const [clientsRes, staffRes, bcodesRes, dailyRes, evvRes, extCertsRes, docsRes, mapsRes, reqsRes] =
      await Promise.all([
        supabase
          .from("clients")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("id, first_name, last_name, authorized_dspd_codes, job_code, support_coordinator_name, support_coordinator_email, support_coordinator_phone" as any)
          .eq("organization_id", orgId),
        supabase
          .from("organization_members")
          .select("user_id, role, job_title")
          .eq("organization_id", orgId)
          .eq("active", true),
        supabase
          .from("client_billing_codes")
          .select(
            "id, client_id, service_code, service_start_date, service_end_date, annual_unit_authorization",
          )
          .eq("organization_id", orgId),
        // Daily/HHS records now live in daily_logs (record_date -> log_date,
        // provider_id -> user_id). hhs_daily_records is orphaned. Aliases keep the
        // audit checks below (recency, missing signature, thin narrative) unchanged
        // (same mapping as the billing surfaces in PR #5).
        supabase
          .from("daily_logs")
          .select("id, client_id, record_date:log_date, provider_id:user_id, narrative, signature_data_url")
          .eq("organization_id", orgId)
          .gte("log_date", new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)),
        supabase
          .from("evv_timesheets")
          .select("id, staff_id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, status")
          .eq("organization_id", orgId)
          .gte("clock_in_timestamp", new Date(now.getTime() - 60 * 86_400_000).toISOString()),
        supabase
          .from("external_certifications")
          .select("id, user_id, cert_name, cert_type, expires_at, status")
          .eq("organization_id", orgId),
        supabase
          .from("client_documents")
          .select("id, client_id, document_type, uploaded_at")
          .eq("organization_id", orgId),
        supabase
          .from("nectar_requirement_mappings")
          .select("requirement_id, scope_kind, scope_value, confirmed")
          .eq("organization_id", orgId),
        supabase
          .from("nectar_requirements")
          .select("id, title, source_citation, review_status, category, metadata, approval_state")
          .eq("organization_id", orgId),
      ]);

    type ClientRow = {
      id: string;
      first_name: string;
      last_name: string;
      authorized_dspd_codes: string[] | null;
      job_code: string[] | null;
      support_coordinator_name?: string | null;
      support_coordinator_email?: string | null;
      support_coordinator_phone?: string | null;
    };
    const clients = (clientsRes.data ?? []) as unknown as ClientRow[];
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const clientName = (id: string | null | undefined) => {
      if (!id) return null;
      const c = clientById.get(id);
      return c ? `${c.last_name}, ${c.first_name}` : null;
    };
    const clientSampleSet =
      data.clientIds && data.clientIds.length ? new Set(data.clientIds) : null;
    const staffSampleSet =
      data.staffIds && data.staffIds.length ? new Set(data.staffIds) : null;
    const inScopeClient = (id: string | null | undefined) => {
      if (clientSampleSet) return !!id && clientSampleSet.has(id);
      return !data.clientId || data.clientId === id;
    };
    const inScopeStaff = (id: string | null | undefined) => {
      if (staffSampleSet) return !!id && staffSampleSet.has(id);
      return !data.staffId || data.staffId === id;
    };
    const inScopeCode = (code: string | null | undefined) =>
      !data.serviceCode || (code ?? "").toUpperCase() === data.serviceCode.toUpperCase();


    // Staff names: best-effort from profiles
    const staffIds = Array.from(
      new Set(((staffRes.data ?? []) as Array<{ user_id: string }>).map((s) => s.user_id)),
    );
    const profilesRes = staffIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", staffIds)
      : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };
    const profileById = new Map(
      ((profilesRes.data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => [p.id, p.full_name || p.email || "Staff"],
      ),
    );

    // Citation index for engine-backed findings.
    type ReqRow = {
      id: string;
      title: string;
      source_citation: string | null;
      review_status: string | null;
      category: string | null;
      metadata: Record<string, unknown> | null;
      approval_state: string | null;
      service_code: string | null;
    };
    const reqRows = (reqsRes.data ?? []) as ReqRow[];
    const reqById = new Map(reqRows.map((r) => [r.id, r]));

    // ---------- 1. Staff certifications: expired / expiring 30d ----------
    if (include("staff_certifications")) {
      for (const c of (extCertsRes.data ?? []) as Array<{
        id: string;
        user_id: string;
        cert_name: string | null;
        cert_type: string;
        expires_at: string | null;
        status: string;
      }>) {
        if (!inScopeStaff(c.user_id)) continue;
        if (!c.expires_at) continue;
        const exp = new Date(c.expires_at);
        const days = daysBetween(exp, now);
        const name = profileById.get(c.user_id) ?? "Staff";
        const certLabel = c.cert_name || c.cert_type;
        if (days < 0) {
          findings.push({
            id: `cert-exp-${c.id}`,
            area: "staff_certifications",
            severity: "critical",
            title: `${certLabel} expired`,
            detail: `${name}'s ${certLabel} expired ${Math.abs(days)} days ago.`,
            subjectKind: "staff",
            subjectId: c.user_id,
            subjectName: name,
            fixHref: "/dashboard/external-compliance",
            fixLabel: "Open external compliance",
            asOf: todayIso(),
          });
        } else if (days <= 30) {
          findings.push({
            id: `cert-soon-${c.id}`,
            area: "staff_certifications",
            severity: days <= 7 ? "attention" : "minor",
            title: `${certLabel} expires in ${days}d`,
            detail: `${name}'s ${certLabel} expires ${c.expires_at}.`,
            subjectKind: "staff",
            subjectId: c.user_id,
            subjectName: name,
            fixHref: "/dashboard/external-compliance",
            fixLabel: "Renew",
            asOf: todayIso(),
          });
        }
      }
    }

    // ---------- 2. EVV timesheets: open > 24h, missing GPS-out justification ----------
    type EvvRow = {
      id: string;
      staff_id: string;
      client_id: string;
      service_type_code: string;
      clock_in_timestamp: string;
      clock_out_timestamp: string | null;
      status: string;
    };
    const evv = (evvRes.data ?? []) as EvvRow[];
    if (include("evv_timesheets")) {
      for (const t of evv) {
        if (!inScopeClient(t.client_id) || !inScopeStaff(t.staff_id) || !inScopeCode(t.service_type_code))
          continue;
        if (!t.clock_out_timestamp) {
          const hoursOpen = (now.getTime() - new Date(t.clock_in_timestamp).getTime()) / 3_600_000;
          if (hoursOpen >= 24) {
            findings.push({
              id: `evv-open-${t.id}`,
              area: "evv_timesheets",
              severity: "critical",
              title: "EVV shift never clocked out",
              detail: `${profileById.get(t.staff_id) ?? "Staff"} on ${
                clientName(t.client_id) ?? "client"
              } (${t.service_type_code}) — open ${Math.round(hoursOpen)}h.`,
              subjectKind: "staff",
              subjectId: t.staff_id,
              subjectName: profileById.get(t.staff_id) ?? "Staff",
              fixHref: "/dashboard/timeclock",
              fixLabel: "Resolve",
              asOf: todayIso(),
            });
          }
        }
      }
    }

    // ---------- 3. Billing: expired authorizations ----------
    type BCode = {
      id: string;
      client_id: string;
      service_code: string;
      service_start_date: string | null;
      service_end_date: string | null;
      annual_unit_authorization: number;
    };
    const bcodes = (bcodesRes.data ?? []) as BCode[];
    if (include("billing")) {
      for (const b of bcodes) {
        if (!inScopeClient(b.client_id) || !inScopeCode(b.service_code)) continue;
        if (!b.service_end_date) continue;
        const end = new Date(b.service_end_date);
        const days = daysBetween(end, now);
        if (days < 0) {
          findings.push({
            id: `auth-exp-${b.id}`,
            area: "billing",
            severity: "critical",
            title: `${b.service_code} authorization expired`,
            detail: `${clientName(b.client_id)} — authorization ended ${b.service_end_date} (${Math.abs(
              days,
            )} days ago).`,
            subjectKind: "client",
            subjectId: b.client_id,
            subjectName: clientName(b.client_id),
            fixHref: `/dashboard/billing/${b.client_id}`,
            fixLabel: "Renew authorization",
            asOf: todayIso(),
          });
        } else if (days <= 30) {
          findings.push({
            id: `auth-soon-${b.id}`,
            area: "billing",
            severity: "attention",
            title: `${b.service_code} authorization expires in ${days}d`,
            detail: `${clientName(b.client_id)} — ends ${b.service_end_date}.`,
            subjectKind: "client",
            subjectId: b.client_id,
            subjectName: clientName(b.client_id),
            fixHref: `/dashboard/billing/${b.client_id}`,
            fixLabel: "Plan renewal",
            asOf: todayIso(),
          });
        }
      }
    }

    // ---------- 4. Daily logs: clients on a daily code missing recent records ----------
    if (include("daily_logs")) {
      const dailyClients = new Map<string, string>(); // client_id -> service_code
      for (const b of bcodes) {
        const code = (b.service_code || "").toUpperCase();
        if (
          DAILY_CODE_HINTS.some((h) => code.includes(h)) &&
          (!b.service_end_date || new Date(b.service_end_date) >= now)
        ) {
          if (!dailyClients.has(b.client_id)) dailyClients.set(b.client_id, b.service_code);
        }
      }
      const recentByClient = new Map<string, string>();
      for (const r of (dailyRes.data ?? []) as Array<{ client_id: string; record_date: string }>) {
        const prev = recentByClient.get(r.client_id);
        if (!prev || r.record_date > prev) recentByClient.set(r.client_id, r.record_date);
      }
      for (const [cid, code] of dailyClients) {
        if (!inScopeClient(cid) || !inScopeCode(code)) continue;
        const last = recentByClient.get(cid);
        const lastDate = last ? new Date(last + "T00:00:00") : null;
        const gap = lastDate ? daysBetween(now, lastDate) : 999;
        if (!last) {
          findings.push({
            id: `daily-none-${cid}`,
            area: "daily_logs",
            severity: "critical",
            title: "No daily logs in last 30 days",
            detail: `${clientName(cid)} is on ${code} but has no host-home daily records on file in the last 30 days.`,
            subjectKind: "client",
            subjectId: cid,
            subjectName: clientName(cid),
            fixHref: `/dashboard/hhs-hub/${cid}`,
            fixLabel: "Open client hub",
            asOf: todayIso(),
          });
        } else if (gap >= 3) {
          findings.push({
            id: `daily-gap-${cid}-${last}`,
            area: "daily_logs",
            severity: gap >= 7 ? "critical" : "attention",
            title: `Daily log gap (${gap}d)`,
            detail: `${clientName(cid)} — last daily record was ${last}.`,
            subjectKind: "client",
            subjectId: cid,
            subjectName: clientName(cid),
            fixHref: `/dashboard/hhs-hub/${cid}`,
            fixLabel: "Open client hub",
            asOf: todayIso(),
          });
        }
      }

      // Unsigned daily records in window.
      for (const r of (dailyRes.data ?? []) as Array<{
        id: string;
        client_id: string;
        record_date: string;
        signature_data_url: string | null;
        narrative: string;
      }>) {
        if (!inScopeClient(r.client_id)) continue;
        if (!r.signature_data_url) {
          findings.push({
            id: `daily-unsigned-${r.id}`,
            area: "daily_logs",
            severity: "attention",
            title: "Daily log missing signature",
            detail: `${clientName(r.client_id)} — ${r.record_date} record has no provider signature.`,
            subjectKind: "client",
            subjectId: r.client_id,
            subjectName: clientName(r.client_id),
            fixHref: `/dashboard/hhs-hub/${r.client_id}`,
            fixLabel: "Sign log",
            asOf: r.record_date,
          });
        }
        if (!r.narrative || r.narrative.trim().length < 20) {
          findings.push({
            id: `daily-thin-${r.id}`,
            area: "daily_logs",
            severity: "minor",
            title: "Daily narrative too thin",
            detail: `${clientName(r.client_id)} — ${r.record_date} narrative is under 20 chars.`,
            subjectKind: "client",
            subjectId: r.client_id,
            subjectName: clientName(r.client_id),
            fixHref: `/dashboard/hhs-hub/${r.client_id}`,
            fixLabel: "Edit log",
            asOf: r.record_date,
          });
        }
      }
    }

    // ---------- 5. Documentation: PCSP / required client docs ----------
    if (include("documentation")) {
      const docTypesByClient = new Map<string, Set<string>>();
      for (const d of (docsRes.data ?? []) as Array<{ client_id: string; document_type: string }>) {
        if (!docTypesByClient.has(d.client_id)) docTypesByClient.set(d.client_id, new Set());
        docTypesByClient.get(d.client_id)!.add((d.document_type || "").toLowerCase());
      }
      for (const c of clients) {
        if (!inScopeClient(c.id)) continue;
        const types = docTypesByClient.get(c.id) ?? new Set();
        const hasPcsp = Array.from(types).some((t) => t.includes("pcsp") || t.includes("person-centered"));
        if (!hasPcsp) {
          findings.push({
            id: `doc-pcsp-${c.id}`,
            area: "documentation",
            severity: "critical",
            title: "Missing PCSP on file",
            detail: `${c.last_name}, ${c.first_name} has no Person-Centered Support Plan uploaded.`,
            subjectKind: "client",
            subjectId: c.id,
            subjectName: `${c.last_name}, ${c.first_name}`,
            fixHref: `/dashboard/hhs-hub/${c.id}`,
            fixLabel: "Upload PCSP",
            asOf: todayIso(),
          });
        }

        // Support Coordinator required on every active client record (SOW line 308).
        const hasSc = !!(c.support_coordinator_name && c.support_coordinator_name.trim());
        if (!hasSc) {
          findings.push({
            id: `doc-sc-${c.id}`,
            area: "documentation",
            severity: "attention",
            title: "Support Coordinator not on file",
            detail: `${c.last_name}, ${c.first_name} has no Support Coordinator name recorded. SOW line 308 requires name, email, and phone.`,
            sourceCitation: "SOW §1.10 line 308",
            subjectKind: "client",
            subjectId: c.id,
            subjectName: `${c.last_name}, ${c.first_name}`,
            fixHref: `/dashboard/clients/${c.id}?tab=overview`,
            fixLabel: "Add support coordinator",
            asOf: todayIso(),
          });
        }
      }
    }

    // ---------- 6. Requirements Engine gaps ----------
    if (include("requirements_engine")) {
      const maps = (mapsRes.data ?? []) as Array<{
        requirement_id: string;
        scope_kind: string;
        confirmed: boolean;
      }>;
      const confirmedByReq = new Map<string, number>();
      for (const m of maps) {
        if (m.confirmed)
          confirmedByReq.set(m.requirement_id, (confirmedByReq.get(m.requirement_id) ?? 0) + 1);
      }

      const { data: heldCodesRows } = await supabase
        .from("provider_authorized_codes")
        .select("code")
        .eq("organization_id", orgId);
      const heldCodes = new Set<string>((heldCodesRows ?? []).map((r) => r.code));

      // Prompt 32 — load the current master attestation once per run. An
      // attestation-type requirement is satisfied when a current (non-due)
      // master attestation covers its service_code.
      const { data: masterRows } = await supabase
        .from("master_attestations")
        .select("scope_codes, requirement_count, signed_at")
        .eq("organization_id", orgId)
        .is("superseded_at", null)
        .order("version", { ascending: false })
        .limit(1);
      const masterCurrent = ((masterRows ?? [])[0] ?? null) as {
        scope_codes: string[] | null;
        requirement_count: number | null;
        signed_at: string;
      } | null;
      let masterIsDue = !masterCurrent;
      if (masterCurrent) {
        const ageMs = Date.now() - new Date(masterCurrent.signed_at).getTime();
        if (ageMs > 365 * 24 * 60 * 60 * 1000) masterIsDue = true;
        const snap = [...(masterCurrent.scope_codes ?? [])].sort();
        const now = [...heldCodes].sort();
        if (snap.length !== now.length || snap.some((c, i) => c !== now[i]))
          masterIsDue = true;
      }
      const masterScopeCodes = new Set<string>(masterCurrent?.scope_codes ?? []);
      const isCoveredByMaster = (code: string | null): boolean => {
        if (!masterCurrent || masterIsDue) return false;
        if (!code) return true;
        return masterScopeCodes.has(code);
      };

      // ---------- Lazy resolver (Prompt 29) ----------
      // Instead of firing on missing nectar_requirement_mappings rows, resolve
      // each in-scope requirement against its requirement_bindings row + live
      // evidence in the current audit window. NECTAR proposals still populate
      // nectar_requirement_mappings; we simply don't gate the finding on them.
      const inScopeReqs = Array.from(reqById.values()).filter(
        (r) => !(r.service_code && !heldCodes.has(r.service_code)),
      );
      const inScopeIds = inScopeReqs.map((r) => r.id);

      // Audit period: honour explicit dateFrom/dateTo, else default to last 90d.
      const periodStart =
        dateFrom ??
        new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
      const periodEnd = dateTo ?? todayIso();
      const periodStartIso = new Date(periodStart + "T00:00:00Z").toISOString();
      const periodEndIso = new Date(periodEnd + "T23:59:59Z").toISOString();
      const nowIso = new Date().toISOString();

      // Load bindings in one shot.
      const { data: bindingRows } = inScopeIds.length
        ? await supabase
            .from("requirement_bindings")
            .select("requirement_id, satisfied_by, native_feature, engine_ref, notes")
            .in("requirement_id", inScopeIds)
        : { data: [] as Array<{
            requirement_id: string;
            satisfied_by: string;
            native_feature: string | null;
            engine_ref: string | null;
            notes: string | null;
          }> };
      const bindingByReq = new Map(
        (bindingRows ?? []).map((b) => [b.requirement_id as string, b]),
      );

      // Group requirements by the evidence source we'll need to query, so we
      // can batch-load evidence once instead of per-requirement.
      const formIds = new Set<string>();
      const courseIds = new Set<string>();
      const certTypeKeys = new Set<string>();
      for (const r of inScopeReqs) {
        const b = bindingByReq.get(r.id);
        if (!b) continue;
        if (b.satisfied_by === "form" && b.engine_ref) formIds.add(b.engine_ref);
        if (b.satisfied_by === "training" && b.engine_ref) courseIds.add(b.engine_ref);
        if (b.satisfied_by === "credential" && b.engine_ref) certTypeKeys.add(b.engine_ref);
      }

      const nativeFeatureNeeded = new Set<string>();
      for (const r of inScopeReqs) {
        const b = bindingByReq.get(r.id);
        if (b?.satisfied_by === "auto" && b.native_feature)
          nativeFeatureNeeded.add(b.native_feature);
      }

      const [
        formSubsRes,
        trainingCertsRes,
        credCertsRes,
        docAttestRes,
        dailyLogsAnyRes,
        evvAnyRes,
        emarAnyRes,
        incidentsAnyRes,
        hrcAnyRes,
      ] = await Promise.all([
        formIds.size
          ? supabase
              .from("form_submissions")
              .select("form_id, submitted_at")
              .eq("organization_id", orgId)
              .in("form_id", Array.from(formIds))
              .gte("submitted_at", periodStartIso)
              .lte("submitted_at", periodEndIso)
          : Promise.resolve({ data: [] as Array<{ form_id: string; submitted_at: string }> }),
        courseIds.size
          ? supabase
              .from("hive_training_assignments")
              .select("course_id, completed_at, expires_at")
              .eq("organization_id", orgId)
              .in("course_id", Array.from(courseIds))
              .not("completed_at", "is", null)
          : Promise.resolve({
              data: [] as Array<{
                course_id: string;
                completed_at: string | null;
                expires_at: string | null;
              }>,
            }),
        certTypeKeys.size
          ? supabase
              .from("certifications")
              .select("id, course_id, expires_at")
              .eq("organization_id", orgId)
              .in("course_id", Array.from(certTypeKeys))
          : Promise.resolve({
              data: [] as Array<{ id: string; course_id: string; expires_at: string | null }>,
            }),
        supabase
          .from("document_attestations")
          .select("subject_ref, created_at")
          .eq("organization_id", orgId)
          .eq("subject_kind", "requirement")
          .in(
            "subject_ref",
            inScopeIds.length ? inScopeIds : ["00000000-0000-0000-0000-000000000000"],
          ),

        nativeFeatureNeeded.has("daily_logs")
          ? supabase
              .from("daily_logs")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", orgId)
              .gte("log_date", periodStart)
              .lte("log_date", periodEnd)
          : Promise.resolve({ count: 0 }),
        nativeFeatureNeeded.has("evv")
          ? supabase
              .from("evv_timesheets")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", orgId)
              .gte("clock_in_timestamp", periodStartIso)
              .lte("clock_in_timestamp", periodEndIso)
          : Promise.resolve({ count: 0 }),
        nativeFeatureNeeded.has("med_admin")
          ? supabase
              .from("emar_logs")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", orgId)
              .gte("scheduled_time", periodStartIso)
              .lte("scheduled_time", periodEndIso)
          : Promise.resolve({ count: 0 }),
        nativeFeatureNeeded.has("incidents")
          ? supabase
              .from("incident_reports")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", orgId)
              .gte("created_at", periodStartIso)
              .lte("created_at", periodEndIso)
          : Promise.resolve({ count: 0 }),
        nativeFeatureNeeded.has("hrc")
          ? supabase
              .from("hrc_meetings")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", orgId)
              .gte("meeting_date", periodStart)
              .lte("meeting_date", periodEnd)
          : Promise.resolve({ count: 0 }),
      ]);

      const formSubsByForm = new Set<string>();
      for (const s of (formSubsRes.data ?? []) as Array<{ form_id: string }>)
        formSubsByForm.add(s.form_id);
      const trainingCourseHas = new Set<string>();
      for (const t of (trainingCertsRes.data ?? []) as Array<{
        course_id: string;
        expires_at: string | null;
      }>) {
        if (!t.expires_at || t.expires_at > nowIso) trainingCourseHas.add(t.course_id);
      }
      const validCertsByCourse = new Set<string>();
      for (const c of (credCertsRes.data ?? []) as Array<{
        course_id: string;
        expires_at: string | null;
      }>) {
        if (!c.expires_at || c.expires_at > nowIso) validCertsByCourse.add(c.course_id);
      }
      const activeDocByReq = new Set<string>();
      for (const d of (docAttestRes.data ?? []) as Array<{ subject_ref: string }>) {
        activeDocByReq.add(d.subject_ref);
      }


      const nativeHas = (feature: string): boolean => {
        switch (feature) {
          case "daily_logs":
            return (dailyLogsAnyRes.count ?? 0) > 0;
          case "evv":
            return (evvAnyRes.count ?? 0) > 0;
          case "med_admin":
            return (emarAnyRes.count ?? 0) > 0;
          case "incidents":
            return (incidentsAnyRes.count ?? 0) > 0;
          case "hrc":
            return (hrcAnyRes.count ?? 0) > 0;
          default:
            return false;
        }
      };

      let autoSatisfiedCount = 0;
      let needsEvidenceCount = 0;
      for (const r of inScopeReqs) {
        const b = bindingByReq.get(r.id);
        const base = {
          area: "requirements_engine" as const,
          sourceCitation: r.source_citation ?? null,
          subjectKind: "provider" as const,
          fixHref: "/dashboard/authoritative-sources",
          asOf: todayIso(),
        };

        if (!b || b.satisfied_by === "unbound") {
          needsEvidenceCount += 1;
          findings.push({
            ...base,
            id: `req-unbound-${r.id}`,
            severity: "minor",
            title: `Requirement not yet configured — ${r.title}`,
            detail:
              "This requirement is confirmed but has no binding yet — set 'How this is satisfied' in the Requirements tab so the audit can resolve it automatically.",
            fixLabel: "Configure binding",
          });
          continue;
        }

        let satisfied = false;
        let missTitle = "";
        switch (b.satisfied_by) {
          case "auto":
            satisfied = !!b.native_feature && nativeHas(b.native_feature);
            missTitle = `Evidence missing — ${r.title}`;
            break;
          case "form":
            satisfied = !!b.engine_ref && formSubsByForm.has(b.engine_ref);
            missTitle = `Form not submitted — ${r.title}`;
            break;
          case "credential":
            satisfied = !!b.engine_ref && validCertsByCourse.has(b.engine_ref);
            missTitle = `Credential missing or expired — ${r.title}`;
            break;
          case "training":
            satisfied = !!b.engine_ref && trainingCourseHas.has(b.engine_ref);
            missTitle = `Training not completed — ${r.title}`;
            break;
          case "upload":
            satisfied = activeDocByReq.has(r.id);
            missTitle = `Document not on file — ${r.title}`;
            break;
          case "attestation":
            // Prompt 32 — an attestation-type requirement is satisfied when
            // a current (non-due) master attestation covers its service_code.
            // Falls back to any per-requirement document attestation on file.
            satisfied = isCoveredByMaster(r.service_code) || activeDocByReq.has(r.id);
            missTitle = masterCurrent && masterIsDue
              ? `Re-attestation needed — ${r.title}`
              : `Attestation needed — ${r.title}`;
            break;
          default:
            satisfied = false;
            missTitle = `Requirement not resolvable — ${r.title}`;
        }

        if (satisfied) {
          autoSatisfiedCount += 1;
        } else {
          needsEvidenceCount += 1;
          findings.push({
            ...base,
            id: `req-evidence-${r.id}`,
            severity: "attention",
            title: missTitle,
            detail: `"${r.title}" is in scope for this provider but its bound evidence (${b.satisfied_by}${b.native_feature ? `: ${b.native_feature}` : b.engine_ref ? `: ${b.engine_ref}` : ""}) was not found for ${periodStart}–${periodEnd}.`,
            fixLabel: "Review requirement",
          });
        }
      }

      const inScopeCount = inScopeReqs.length;
      const dormantCount = Math.max(0, reqById.size - inScopeCount);
      // Expose scope counters on the outer scope so the summary can return them.
      (findings as unknown as { __reqCounts?: unknown }).__reqCounts = {
        inScopeCount,
        dormantCount,
        autoSatisfiedCount,
        needsEvidenceCount,
      };

      const unknownUnconfirmed = maps.filter((m) => m.scope_kind === "unknown" && !m.confirmed);
      if (unknownUnconfirmed.length) {
        findings.push({
          id: `req-unknown-${unknownUnconfirmed.length}`,
          area: "requirements_engine",
          severity: "minor",
          title: `${unknownUnconfirmed.length} unconfirmed engine proposal(s)`,
          detail: "NECTAR proposed mappings that an admin hasn't reviewed.",
          subjectKind: "provider",
          fixHref: "/dashboard/authoritative-sources",
          fixLabel: "Review",
          asOf: todayIso(),
        });
      }

      // Provider-declared cadence re-check prompts.
      // NECTAR refuses to invent a cadence: only flag when the PROVIDER set a
      // frequency on a confirmed requirement AND it's due/overdue per their
      // own last-checked date.
      const { computeRequirementDueState, frequencyLabel } = await import(
        "@/lib/requirement-tracking"
      );
      for (const r of reqRows) {
        if (r.approval_state !== "provider_confirmed" && r.review_status !== "confirmed")
          continue;
        const s = computeRequirementDueState(r.metadata ?? {});
        if (s.state !== "overdue" && s.state !== "due" && s.state !== "never_checked")
          continue;
        const freq = frequencyLabel(s.frequency);
        const last = s.lastCheckedAt ? `last checked ${s.lastCheckedAt}` : "never checked";
        findings.push({
          id: `req-recheck-${r.id}`,
          area: "requirements_engine",
          severity: s.state === "overdue" ? "attention" : "minor",
          title:
            s.state === "overdue"
              ? `Recurring requirement overdue for re-verification`
              : s.state === "due"
                ? `Recurring requirement due for re-verification today`
                : `Recurring requirement has no last-checked date`,
          detail:
            s.state === "never_checked"
              ? `"${r.title}" — you set cadence ${freq} but haven't recorded a last-checked date.`
              : `"${r.title}" — you set cadence ${freq}; ${last}${
                  s.daysOverdue && s.daysOverdue > 0 ? `, overdue by ${s.daysOverdue}d` : ""
                }.`,
          sourceCitation: r.source_citation ?? null,
          subjectKind: "provider",
          fixHref: "/dashboard/authoritative-sources",
          fixLabel: "Update tracking",
          asOf: todayIso(),
        });
      }
    }

    // ---------- 7. External attestations (provider-level) ----------
    // Cheap heuristic: flag if zero external_certifications exist for any active staff in a known
    // role bucket. (Placeholder until provider-level attestation table is wired.)
    if (include("external_attestations")) {
      const certsByUser = new Map<string, number>();
      for (const c of (extCertsRes.data ?? []) as Array<{ user_id: string }>) {
        certsByUser.set(c.user_id, (certsByUser.get(c.user_id) ?? 0) + 1);
      }
      for (const s of (staffRes.data ?? []) as Array<{ user_id: string; role: string; job_title: string | null }>) {
        if (!inScopeStaff(s.user_id)) continue;
        if ((certsByUser.get(s.user_id) ?? 0) === 0) {
          const name = profileById.get(s.user_id) ?? "Staff";
          findings.push({
            id: `attest-none-${s.user_id}`,
            area: "external_attestations",
            severity: "attention",
            title: "Staff has no external attestations on file",
            detail: `${name} has no external certifications or attestations uploaded yet.`,
            subjectKind: "staff",
            subjectId: s.user_id,
            subjectName: name,
            fixHref: "/dashboard/external-compliance",
            fixLabel: "Upload",
            asOf: todayIso(),
          });
        }
      }
    }

    // ---------- Optional date-range filter ----------
    const filtered = findings.filter((f) => {
      if (dateFrom && f.asOf < dateFrom) return false;
      if (dateTo && f.asOf > dateTo) return false;
      return true;
    });

    // ---------- Summarize ----------
    const totals = { critical: 0, attention: 0, minor: 0, total: filtered.length };
    const byArea: Record<FindingArea, number> = {
      documentation: 0,
      daily_logs: 0,
      evv_timesheets: 0,
      billing: 0,
      staff_certifications: 0,
      requirements_engine: 0,
      external_attestations: 0,
    };
    for (const f of filtered) {
      totals[f.severity] += 1;
      byArea[f.area] += 1;
    }
    // Readiness: 100 minus weighted gaps, floored at 0.
    const penalty = totals.critical * 8 + totals.attention * 3 + totals.minor * 1;
    const readinessScore = Math.max(0, Math.min(100, 100 - penalty));

    // Sort: critical first, then by area
    filtered.sort((a, b) => {
      const rank = { critical: 0, attention: 1, minor: 2 } as const;
      return rank[a.severity] - rank[b.severity] || a.area.localeCompare(b.area);
    });

    const sampleClients = clientSampleSet
      ? Array.from(clientSampleSet).map((id) => ({
          id,
          name: clientName(id) ?? "Unknown client",
        }))
      : null;
    const sampleStaff = staffSampleSet
      ? Array.from(staffSampleSet).map((id) => ({
          id,
          name: profileById.get(id) ?? "Staff",
        }))
      : null;

    return {
      generatedAt: new Date().toISOString(),
      scope: {
        clientId: data.clientId ?? null,
        staffId: data.staffId ?? null,
        clientIds: data.clientIds ?? null,
        staffIds: data.staffIds ?? null,
        sampleClients,
        sampleStaff,
        serviceCode: data.serviceCode ?? null,
        area: data.area ?? null,
        dateFrom,
        dateTo,
      },
      totals,
      readinessScore,
      byArea,
      findings: filtered,
    };

  });

export interface AuditableStaff {
  user_id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
  role: string;
}

/**
 * Lightweight staff roster for the Internal Audit scope picker.
 * Returns active org members — RLS scopes the query to the caller's org.
 */
export const listAuditableStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AuditableStaff[]> => {
    const { supabase, userId } = context;
    await assertAddonForOrg(supabase, userId, "internal_audit", data.organizationId);
    const { data: members, error } = await supabase
      .from("organization_members")
      .select("user_id, role, job_title, active")
      .eq("organization_id", data.organizationId)
      .eq("active", true);
    if (error) throw error;
    const ids = (members ?? []).map((m) => m.user_id);
    if (!ids.length) return [];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    const pMap = new Map(
      ((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => [p.id, p],
      ),
    );
    return (members ?? []).map((m) => {
      const p = pMap.get(m.user_id);
      return {
        user_id: m.user_id,
        full_name: p?.full_name ?? null,
        email: p?.email ?? null,
        job_title: m.job_title ?? null,
        role: m.role,
      };
    });
  });

// ── Reconciliation audit: job_code vs client_billing_codes ────────────────────

export interface ServiceCodeReconciliationEntry {
  clientId: string;
  clientName: string;
  legacyJobCodes: string[];
  billingCodes: string[];
  missingFromBilling: string[] | null; // codes in job_code but not in billing
  missingFromLegacy: string[] | null;  // codes in billing but not in job_code
  inSync: boolean;
}

export interface ServiceCodeReconciliationReport {
  generatedAt: string;
  organizationId: string;
  totalClients: number;
  outOfSyncCount: number;
  entries: ServiceCodeReconciliationEntry[];
}

/**
 * Reconciliation audit: compares each client's legacy job_code array against
 * their active client_billing_codes rows.
 *
 * Read-only — never modifies data.  job_code is now stale; client_billing_codes
 * is the authoritative source.  This report surfaces divergences so admins can
 * clean up job_code or add missing billing-code rows.
 */
export const reconcileServiceCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ServiceCodeReconciliationReport> => {
    const { supabase, userId } = context;
    await assertAddonForOrg(supabase, userId, "internal_audit", data.organizationId);

    const orgId = data.organizationId;

    // Fetch all clients (just identity + legacy codes).
    const { data: clientRows, error: clientErr } = await supabase
      .from("clients")
      .select("id, first_name, last_name, job_code")
      .eq("organization_id", orgId);
    if (clientErr) throw clientErr;

    // Fetch all active client_billing_codes for this org.
    const { data: bcodeRows, error: bcodeErr } = await supabase
      .from("client_billing_codes")
      .select("client_id, service_code, service_start_date, service_end_date")
      .eq("organization_id", orgId);
    if (bcodeErr) throw bcodeErr;

    const today = new Date().toISOString().slice(0, 10);

    // Group active billing codes by client.
    const billingByClient = new Map<string, Set<string>>();
    for (const b of (bcodeRows ?? []) as Array<{
      client_id: string;
      service_code: string;
      service_start_date: string | null;
      service_end_date: string | null;
    }>) {
      if (b.service_start_date && b.service_start_date > today) continue;
      if (b.service_end_date && b.service_end_date < today) continue;
      if (!billingByClient.has(b.client_id)) billingByClient.set(b.client_id, new Set());
      billingByClient.get(b.client_id)!.add(b.service_code);
    }

    const entries: ServiceCodeReconciliationEntry[] = [];
    for (const c of (clientRows ?? []) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      job_code: string[] | null;
    }>) {
      const legacy = new Set<string>(c.job_code ?? []);
      const billing = billingByClient.get(c.id) ?? new Set<string>();

      const missingFromBilling = Array.from(legacy).filter((code) => !billing.has(code));
      const missingFromLegacy = Array.from(billing).filter((code) => !legacy.has(code));
      const inSync = missingFromBilling.length === 0 && missingFromLegacy.length === 0;

      entries.push({
        clientId: c.id,
        clientName: `${c.last_name}, ${c.first_name}`,
        legacyJobCodes: Array.from(legacy).sort(),
        billingCodes: Array.from(billing).sort(),
        missingFromBilling: missingFromBilling.length ? missingFromBilling.sort() : null,
        missingFromLegacy: missingFromLegacy.length ? missingFromLegacy.sort() : null,
        inSync,
      });
    }

    // Sort: out-of-sync first, then alphabetically by client name.
    entries.sort((a, b) => {
      if (a.inSync !== b.inSync) return a.inSync ? 1 : -1;
      return a.clientName.localeCompare(b.clientName);
    });

    return {
      generatedAt: new Date().toISOString(),
      organizationId: orgId,
      totalClients: entries.length,
      outOfSyncCount: entries.filter((e) => !e.inSync).length,
      entries,
    };
  });
