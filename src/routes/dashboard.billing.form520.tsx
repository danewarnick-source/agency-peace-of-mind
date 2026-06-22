import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useAllClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, Download, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Lock, FileSearch,
} from "lucide-react";
import { fmtHours, computeEntryUnits } from "@/lib/billing-units";
import { isDailyServiceCode } from "@/lib/service-billing";
import { aggregateHourlyUnits, aggregateDailyDays } from "@/lib/accrual";
import { RequireRole } from "@/components/rbac-guard";

export const Route = createFileRoute("/dashboard/billing/form520")({
  head: () => ({ meta: [{ title: "520 Billing — HIVE" }] }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <Billing520Page />
    </RequireRole>
  ),
});

type Row = {
  line_number: number;
  provider_approver_email: string;
  consumer_name: string;
  consumer_pid: string;
  service_code: string;
  rate: number;
  unit_type: string;
  service_start_date: string;
  service_end_date: string;
  units: number;
  remaining_units: number;
  sce: string;
  monthly_max_units: number | "";
  // Internal — not part of the 520 column set
  _key: string;
  _client_id: string;
  /** Annual authorization for the code (internal display). */
  _annual_units: number;
  /** Units consumed across the FULL authorization window (internal display). */
  _consumed_units: number;
};

type DraftWarning = {
  row_key: string;
  warning_type: string;
  severity: "info" | "warning" | "blocker";
  message: string;
  related_ids: Record<string, unknown>;
};

const ATTESTATION_TEXT =
  "I have reviewed this billing submission and confirm the hours and units reflect services actually provided. " +
  "I understand HIVE/NECTAR presents data as entered by staff and does not verify its accuracy. " +
  "I accept full responsibility for the accuracy of this submission to the State, and acknowledge HIVE is not liable " +
  "for errors, omissions, or negligence by staff or provider in data submitted to or reviewed by me.";

function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }

function Billing520Page() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { data: codes } = useAllClientBillingCodes();

  const { data: orgEmailRow } = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["520-provider-email", org?.organization_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("organizations")
        .select("provider_approver_email")
        .eq("id", org!.organization_id)
        .maybeSingle();
      return data ?? null;
    },
  });
  const providerEmail = (orgEmailRow?.provider_approver_email as string | undefined) || user?.email;

  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  const [rangeStartStr, setRangeStartStr] = useState<string>(() => toIso(startOfMonth()));
  const [rangeEndStr, setRangeEndStr] = useState<string>(() => toIso(new Date()));
  const periodStart = new Date(rangeStartStr + "T00:00:00");
  const periodEnd = new Date(rangeEndStr + "T23:59:59");
  const periodStartStr = rangeStartStr;
  const periodEndStr = rangeEndStr;

  const actorName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    "Unknown user";

  // ─── Data feeds for the 520 grid ──────────────────────────────────────────
  const tsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["520-evv", org?.organization_id, [rangeStartStr, rangeEndStr]],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("id, client_id, staff_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
        .eq("organization_id", org!.organization_id)
        .gte("clock_in_timestamp", periodStart.toISOString())
        .lte("clock_in_timestamp", periodEnd.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  const dailyQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["520-daily", org?.organization_id, [rangeStartStr, rangeEndStr]],
    queryFn: async () => {
      // Daily-rate days come from the hhs_daily_records_v view; only
      // billable rows (attendance Present + daily note) may be billed.
      const { data, error } = await supabase
        .from("hhs_daily_records_v")
        .select("client_id, record_date, service_code, billable")
        .eq("organization_id", org!.organization_id)
        .eq("billable", true)
        .gte("record_date", periodStartStr)
        .lte("record_date", periodEndStr);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Usage across each code's FULL authorization window (since the earliest
  // service_start_date), independent of the displayed billing period —
  // remaining units must reflect the whole authorization, not just this month.
  const earliestAuthStart = useMemo(() => {
    const ds = (codes ?? [])
      .map((c) => c.service_start_date)
      .filter((d): d is string => !!d)
      .sort();
    return ds[0] ?? `${new Date().getFullYear()}-01-01`;
  }, [codes]);

  const authUsageQ = useQuery({
    enabled: !!org?.organization_id && !!codes,
    queryKey: ["520-auth-usage", org?.organization_id, earliestAuthStart],
    queryFn: async () => {
      const [ts, dl] = await Promise.all([
        supabase
          .from("evv_timesheets")
          .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
          .eq("organization_id", org!.organization_id)
          .gte("clock_in_timestamp", `${earliestAuthStart}T00:00:00Z`)
          .not("clock_out_timestamp", "is", null),
        supabase
          .from("hhs_daily_records_v")
          .select("client_id, record_date, service_code, billable")
          .eq("organization_id", org!.organization_id)
          .eq("billable", true)
          .gte("record_date", earliestAuthStart),
      ]);
      if (ts.error) throw ts.error;
      if (dl.error) throw dl.error;
      return { ts: ts.data ?? [], dl: dl.data ?? [] };
    },
  });

  const clientsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["520-clients", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, medicaid_id" as any)
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const shiftsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["520-shifts", org?.organization_id, [rangeStartStr, rangeEndStr]],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_shifts")
        .select("id, client_id, staff_id, starts_at, ends_at")
        .eq("organization_id", org!.organization_id)
        .gte("starts_at", periodStart.toISOString())
        .lte("starts_at", periodEnd.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo<Row[]>(() => {
    if (!codes || !clientsQ.data) return [];
    const clientMap = new Map(
      (clientsQ.data as unknown as Array<{ id: string; first_name: string; last_name: string; medicaid_id: string | null }>)
        .map((c) => [c.id, c]),
    );

    // Hourly units per (client|code) via shared aggregator
    const unitsByKey = aggregateHourlyUnits(
      (tsQ.data ?? []) as Parameters<typeof aggregateHourlyUnits>[0],
      (r) => `${r.client_id}|${r.service_type_code}`,
    );

    // Daily distinct days per (client|code) via shared aggregator — the view
    // carries the service code, so days land on the exact authorized code.
    const daysByClient = aggregateDailyDays(
      (dailyQ.data ?? []) as Parameters<typeof aggregateDailyDays>[0],
      (r) => {
        const code = (r as { service_code?: string | null }).service_code;
        return code ? `${r.client_id}|${code}` : r.client_id;
      },
    );

    // Consumption across each code's FULL authorization window (for the
    // Remaining column) — period-independent.
    const authTs = (authUsageQ.data?.ts ?? []) as Array<{
      client_id: string; service_type_code: string | null;
      clock_in_timestamp: string; clock_out_timestamp: string | null;
    }>;
    const authDl = (authUsageQ.data?.dl ?? []) as Array<{
      client_id: string | null; record_date: string | null; service_code: string | null;
    }>;
    const consumedFor = (b: (typeof codes)[number]): number => {
      const winStart = b.service_start_date ? new Date(b.service_start_date) : null;
      const winEnd = b.service_end_date ? new Date(b.service_end_date) : null;
      if (isDailyServiceCode(b.service_code)) {
        const days = new Set<string>();
        for (const r of authDl) {
          if (r.client_id !== b.client_id || !r.record_date) continue;
          if (r.service_code && r.service_code !== b.service_code) continue;
          const d = new Date(`${r.record_date}T00:00:00`);
          if (winStart && d < winStart) continue;
          if (winEnd && d > winEnd) continue;
          days.add(r.record_date);
        }
        return days.size;
      }
      let units = 0;
      for (const r of authTs) {
        if (r.client_id !== b.client_id || !r.clock_out_timestamp) continue;
        if (r.service_type_code !== b.service_code) continue;
        const inT = new Date(r.clock_in_timestamp);
        if (winStart && inT < winStart) continue;
        if (winEnd && inT > winEnd) continue;
        // Per-entry rounding; the bucket sums entry units, never re-rounds.
        units += computeEntryUnits(r.clock_in_timestamp, r.clock_out_timestamp);
      }
      return units;
    };

    const out: Row[] = [];
    let line = 1;
    for (const b of codes) {
      const client = clientMap.get(b.client_id);
      if (!client) continue;
      let units = 0;
      if (isDailyServiceCode(b.service_code)) {
        units =
          (daysByClient.get(`${b.client_id}|${b.service_code}`)?.size ?? 0) +
          (daysByClient.get(b.client_id)?.size ?? 0);
      } else {
        units = unitsByKey.get(`${b.client_id}|${b.service_code}`) ?? 0;
      }
      const annual = b.annual_unit_authorization ?? 0;
      const consumed = consumedFor(b);
      const remaining = Math.max(0, annual - consumed);
      out.push({
        line_number: line++,
        provider_approver_email: providerEmail ?? "",
        consumer_name: `${client.last_name}, ${client.first_name}`,
        consumer_pid: client.medicaid_id ?? "",
        service_code: b.service_code,
        rate: Number(b.rate_per_unit ?? 0),
        unit_type: b.unit_type || "Q",
        service_start_date: b.service_start_date || periodStartStr,
        service_end_date: b.service_end_date || periodEndStr,
        units,
        remaining_units: remaining,
        sce: b.sce ?? "",
        monthly_max_units: b.monthly_max_units ?? "",
        _key: `${b.client_id}|${b.service_code}`,
        _client_id: b.client_id,
        _annual_units: annual,
        _consumed_units: consumed,
      });
    }
    return out;
  }, [codes, clientsQ.data, tsQ.data, dailyQ.data, authUsageQ.data, periodStartStr, periodEndStr, providerEmail]);

  const clientsInData = useMemo(() => {
    const map = new Map<string, { client_id: string; name: string; codeKeys: Array<{ key: string; service_code: string }> }>();
    for (const r of rows) {
      if (!map.has(r._client_id)) {
        map.set(r._client_id, { client_id: r._client_id, name: r.consumer_name, codeKeys: [] });
      }
      map.get(r._client_id)!.codeKeys.push({ key: r._key, service_code: r.service_code });
    }
    return Array.from(map.values());
  }, [rows]);

  const [includedClients, setIncludedClients] = useState<Set<string> | null>(null);
  const [excludedCodeKeys, setExcludedCodeKeys] = useState<Set<string>>(new Set());

  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      const clientIncluded = includedClients === null || includedClients.has(r._client_id);
      return clientIncluded && !excludedCodeKeys.has(r._key);
    });
  }, [rows, includedClients, excludedCodeKeys]);

  const visibleClientCount = useMemo(() => new Set(visibleRows.map((r) => r._client_id)).size, [visibleRows]);

  // ─── Warning generation (HIVE-surfaced audit checks) ──────────────────────
  const draftWarnings = useMemo<DraftWarning[]>(() => {
    const out: DraftWarning[] = [];

    for (const r of visibleRows) {
      if (r.units > 0 && r.rate <= 0) {
        out.push({
          row_key: r._key,
          warning_type: "missing_rate",
          severity: "warning",
          message: `${r.consumer_name} · ${r.service_code}: ${r.units} units billed at $0 rate. Confirm the client's PCSP/1056 rate is on file.`,
          related_ids: { client_id: r._client_id, service_code: r.service_code },
        });
      }
      if (typeof r.monthly_max_units === "number" && r.monthly_max_units > 0 && r.units > r.monthly_max_units) {
        out.push({
          row_key: r._key,
          warning_type: "exceeds_monthly_cap",
          severity: "warning",
          message: `${r.consumer_name} · ${r.service_code}: ${r.units} units exceeds monthly cap of ${r.monthly_max_units}.`,
          related_ids: { client_id: r._client_id, service_code: r.service_code },
        });
      }
      if (r.units > 0 && r.remaining_units === 0) {
        out.push({
          row_key: r._key,
          warning_type: "annual_auth_exhausted",
          severity: "warning",
          message: `${r.consumer_name} · ${r.service_code}: annual authorization is exhausted after this submission.`,
          related_ids: { client_id: r._client_id, service_code: r.service_code },
        });
      }
      if (r.units > 0 && !r.provider_approver_email) {
        out.push({
          row_key: r._key,
          warning_type: "missing_approver",
          severity: "warning",
          message: `${r.consumer_name} · ${r.service_code}: no provider approver email on file for the 520 header.`,
          related_ids: { client_id: r._client_id, service_code: r.service_code },
        });
      }
    }

    // EVV vs schedule — flag punches with clock_in deviating >15 min from
    // any scheduled shift for the same staff+client on the same calendar day.
    const shifts = (shiftsQ.data ?? []) as Array<{ id: string; client_id: string; staff_id: string; starts_at: string; ends_at: string }>;
    const ts = (tsQ.data ?? []) as Array<{ id: string; client_id: string; staff_id: string; clock_in_timestamp: string }>;

    const shiftsByKey = new Map<string, Array<{ id: string; start: number; end: number }>>();
    for (const s of shifts) {
      const k = `${s.staff_id}|${s.client_id}`;
      const arr = shiftsByKey.get(k) ?? [];
      arr.push({ id: s.id, start: new Date(s.starts_at).getTime(), end: new Date(s.ends_at).getTime() });
      shiftsByKey.set(k, arr);
    }

    const FIFTEEN_MIN = 15 * 60 * 1000;
    let mismatch = 0;
    for (const t of ts) {
      if (!t.staff_id) continue;
      const k = `${t.staff_id}|${t.client_id}`;
      const list = shiftsByKey.get(k);
      const ci = new Date(t.clock_in_timestamp).getTime();
      if (!list || list.length === 0) continue; // no schedule → don't flag (handled elsewhere)
      // Find closest scheduled start within the same day window
      const sameDay = list.filter((s) => Math.abs(s.start - ci) < 12 * 60 * 60 * 1000);
      if (sameDay.length === 0) continue;
      const closest = sameDay.reduce((best, s) => (Math.abs(s.start - ci) < Math.abs(best.start - ci) ? s : best));
      if (Math.abs(closest.start - ci) > FIFTEEN_MIN) {
        mismatch++;
        if (mismatch <= 10) {
          out.push({
            row_key: `evv|${t.id}`,
            warning_type: "evv_vs_schedule_drift",
            severity: "warning",
            message: `EVV clock-in on ${new Date(t.clock_in_timestamp).toLocaleString()} is more than 15 min off the scheduled shift starting ${new Date(closest.start).toLocaleString()}.`,
            related_ids: { timesheet_id: t.id, shift_id: closest.id },
          });
        }
      }
    }
    if (mismatch > 10) {
      out.push({
        row_key: `evv|summary`,
        warning_type: "evv_vs_schedule_drift_summary",
        severity: "warning",
        message: `${mismatch - 10} additional EVV clock-ins drift more than 15 min from their scheduled shift. Review the EVV ledger.`,
        related_ids: { extra_count: mismatch - 10 },
      });
    }

    return out;
  }, [visibleRows, shiftsQ.data, tsQ.data]);

  // ─── Submission + warning persistence ─────────────────────────────────────
  const submissionQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["520-submission", org?.organization_id, periodStartStr],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("billing_submissions")
        .select("*")
        .eq("organization_id", org!.organization_id)
        .eq("period_start", periodStartStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const submission = submissionQ.data as
    | {
        id: string;
        status: "draft" | "submitted" | "locked";
        submitted_at: string | null;
        submitted_by: string | null;
        attestation_signature_name: string | null;
      }
    | null
    | undefined;

  const warningsQ = useQuery({
    enabled: !!submission?.id,
    queryKey: ["520-warnings", submission?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("billing_submission_warnings")
        .select("*")
        .eq("submission_id", submission!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const auditQ = useQuery({
    enabled: !!submission?.id,
    queryKey: ["520-audit", submission?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("billing_submission_audit_log")
        .select("*")
        .eq("submission_id", submission!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const warnings = (warningsQ.data ?? []) as Array<{
    id: string;
    warning_type: string;
    severity: "info" | "warning" | "blocker";
    message: string;
    status: "pending" | "dismissed" | "attested";
    actor_name: string | null;
    action_at: string | null;
    row_key: string | null;
    related_ids: Record<string, unknown>;
  }>;
  const pendingCount = warnings.filter((w) => w.status === "pending").length;
  const allActed = warnings.length > 0 && pendingCount === 0;

  // Set to true ONLY after counsel-approved attestation copy replaces the placeholder.
  const ATTESTATION_COPY_APPROVED = false;

  const [signatureName, setSignatureName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function openSubmission() {
    if (!org?.organization_id || !user) return;
    setBusy(true);
    try {
      const { data: sub, error: subErr } = await (supabase as any)
        .from("billing_submissions")
        .insert({
          organization_id: org.organization_id,
          period_start: periodStartStr,
          period_end: periodEndStr,
          status: "draft",
          created_by: user.id,
        })
        .select("*")
        .single();
      if (subErr) throw subErr;

      if (draftWarnings.length > 0) {
        const { error: wErr } = await (supabase as any)
          .from("billing_submission_warnings")
          .insert(
            draftWarnings.map((w) => ({
              submission_id: sub.id,
              organization_id: org.organization_id,
              row_key: w.row_key,
              warning_type: w.warning_type,
              severity: w.severity,
              message: w.message,
              related_ids: w.related_ids,
            })),
          );
        if (wErr) throw wErr;
      }

      await (supabase as any).from("billing_submission_audit_log").insert({
        submission_id: sub.id,
        organization_id: org.organization_id,
        actor_user_id: user.id,
        actor_name: actorName,
        action: "submission_opened",
        payload: { warning_count: draftWarnings.length, row_count: visibleRows.length },
      });

      toast.success("Submission opened for review.");
      qc.invalidateQueries({ queryKey: ["520-submission"] });
      qc.invalidateQueries({ queryKey: ["520-warnings"] });
      qc.invalidateQueries({ queryKey: ["520-audit"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open submission.");
    } finally {
      setBusy(false);
    }
  }

  async function actWarning(w: (typeof warnings)[number], action: "dismissed" | "attested") {
    if (!submission || !user || !org) return;
    try {
      const { error } = await (supabase as any)
        .from("billing_submission_warnings")
        .update({
          status: action,
          actor_name: actorName,
          action_at: new Date().toISOString(),
        })
        .eq("id", w.id);
      if (error) throw error;

      await (supabase as any).from("billing_submission_audit_log").insert({
        submission_id: submission.id,
        organization_id: org.organization_id,
        actor_user_id: user.id,
        actor_name: actorName,
        action: action === "dismissed" ? "warning_dismissed" : "warning_attested",
        item_type: "warning",
        item_id: w.id,
        payload: { warning_type: w.warning_type, message: w.message, row_key: w.row_key },
      });

      toast.success(action === "dismissed" ? "Warning dismissed." : "Warning attested.");
      qc.invalidateQueries({ queryKey: ["520-warnings"] });
      qc.invalidateQueries({ queryKey: ["520-audit"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed.");
    }
  }

  async function submitToState() {
    if (!submission || !user || !org) return;
    if (!agreed) return toast.error("You must check the attestation box.");
    if (!signatureName.trim()) return toast.error("Type your full name to sign.");
    if (pendingCount > 0) return toast.error("Every warning must be dismissed or attested first.");
    setBusy(true);
    try {
      const submittedAt = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("billing_submissions")
        .update({
          status: "submitted",
          attestation_text: ATTESTATION_TEXT,
          attestation_signature_name: signatureName.trim(),
          submitted_by: user.id,
          submitted_at: submittedAt,
        })
        .eq("id", submission.id);
      if (error) throw error;

      await (supabase as any).from("billing_submission_audit_log").insert({
        submission_id: submission.id,
        organization_id: org.organization_id,
        actor_user_id: user.id,
        actor_name: actorName,
        action: "submission_attested_and_submitted",
        payload: {
          attestation_text: ATTESTATION_TEXT,
          signature_name: signatureName.trim(),
          submitted_at: submittedAt,
          warnings_total: warnings.length,
          warnings_attested: warnings.filter((w) => w.status === "attested").length,
          warnings_dismissed: warnings.filter((w) => w.status === "dismissed").length,
        },
      });

      toast.success("520 submission attested and locked.");
      qc.invalidateQueries({ queryKey: ["520-submission"] });
      qc.invalidateQueries({ queryKey: ["520-audit"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Submission failed.");
    } finally {
      setBusy(false);
    }
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  const HEADERS = [
    "line_number","provider_approver_email","consumer_name","consumer_pid","service_code",
    "rate","unit_type","service_start_date","service_end_date","units","remaining_units","sce","monthly_max_units",
  ] as const;

  const copyTSV = async () => {
    const lines = [HEADERS.join("\t"), ...visibleRows.map((r) => HEADERS.map((h) => String((r as unknown as Record<string, unknown>)[h] ?? "")).join("\t"))];
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied 520 rows to clipboard");
  };

  const exportXlsx = () => {
    const exportRows = visibleRows.map(({ _key: _k, _client_id: _c, ...r }) => r);
    const ws = XLSX.utils.json_to_sheet(exportRows, { header: HEADERS as unknown as string[] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "520");
    XLSX.writeFile(wb, `520-${rangeStartStr}_${rangeEndStr}.xlsx`);
  };

  const exportCsv = () => {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      HEADERS.join(","),
      ...visibleRows.map((r) =>
        HEADERS.map((h) => esc((r as unknown as Record<string, unknown>)[h])).join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `520-${rangeStartStr}_${rangeEndStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("520 CSV downloaded");
  };

  const exportPdf = () => {
    const rangeLabel = `${rangeStartStr} to ${rangeEndStr}`;
    const win = window.open("", "_blank");
    if (!win) return toast.error("Pop-up blocked — allow pop-ups to export PDF.");
    const rowsHtml = visibleRows
      .map(
        (r) =>
          `<tr>${HEADERS.map(
            (h) =>
              `<td>${String((r as unknown as Record<string, unknown>)[h] ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")}</td>`,
          ).join("")}</tr>`,
      )
      .join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>520 ${rangeLabel}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;color:#0f1b3d;padding:24px;}
  h1{font-size:18px;margin:0 0 4px;} p{margin:0 0 16px;color:#555;font-size:12px;}
  table{width:100%;border-collapse:collapse;font-size:11px;}
  th,td{border:1px solid #d4d4d8;padding:6px 8px;text-align:left;}
  th{background:#f5f3ee;text-transform:uppercase;font-size:10px;letter-spacing:.04em;}
  @media print{body{padding:0;}}
</style></head><body>
<h1>520 Submission — ${rangeLabel}</h1>
<p>${visibleRows.length} line item${visibleRows.length === 1 ? "" : "s"} · Generated ${new Date().toLocaleString()}</p>
<table><thead><tr>${HEADERS.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${rowsHtml}</tbody></table>
<script>window.onload=()=>{window.print();}</script>
</body></html>`);
    win.document.close();
  };


  const locked = submission?.status === "submitted" || submission?.status === "locked";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/dashboard/billing" search={{ focus: undefined }}>Billing</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>520 Submission</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div>
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground">
            <Link to="/dashboard/billing" search={{ focus: undefined }}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Billing
            </Link>
          </Button>
        </div>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            520 Billing — {rangeStartStr} to {rangeEndStr}
          </h1>
          <p className="text-sm text-muted-foreground">
            Auto-populated from EVV time punches + daily logs. Hourly hours → units at {fmtHours(1)} hr = 4 units.
          </p>
          {providerEmail ? (
            <p className="text-sm text-muted-foreground">
              Provider approver: {providerEmail} · <Link to="/dashboard/nectar-company-profile" className="underline underline-offset-2">Edit</Link>
            </p>
          ) : (
            <p className="text-sm text-red-600 dark:text-red-400">
              No provider approver email set — add it on the <Link to="/dashboard/nectar-company-profile" className="underline underline-offset-2">company profile</Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {locked && (
            <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
              <Lock className="h-3 w-3" /> Submitted & locked
            </Badge>
          )}
          <div className="flex items-end gap-2">
            <div><Label className="text-xs">Start</Label>
              <Input type="date" value={rangeStartStr} onChange={(e) => setRangeStartStr(e.target.value)} /></div>
            <div><Label className="text-xs">End</Label>
              <Input type="date" value={rangeEndStr} onChange={(e) => setRangeEndStr(e.target.value)} /></div>
            <Button variant="outline" size="sm" onClick={() => { setRangeStartStr(toIso(startOfMonth())); setRangeEndStr(toIso(new Date())); }}>This month</Button>
            <Button variant="outline" size="sm" onClick={() => { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth()-1, 1); const e = new Date(d.getFullYear(), d.getMonth(), 0); setRangeStartStr(toIso(s)); setRangeEndStr(toIso(e)); }}>Last month</Button>
          </div>
          <Button variant="outline" onClick={copyTSV}><Copy className="mr-2 h-4 w-4" />Copy</Button>
          <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />CSV</Button>
          <Button variant="outline" onClick={exportPdf}><Download className="mr-2 h-4 w-4" />PDF</Button>
          <Button onClick={exportXlsx}><Download className="mr-2 h-4 w-4" />Excel</Button>
        </div>
      </header>

      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Clients & codes on this 520</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setIncludedClients(null); setExcludedCodeKeys(new Set()); }}>Select all</Button>
            <Button variant="outline" size="sm" onClick={() => setIncludedClients(new Set())}>Clear all</Button>
          </div>
        </div>
        {clientsInData.map((c) => {
          const clientChecked = includedClients === null || includedClients.has(c.client_id);
          return (
            <div key={c.client_id} className="border-t border-border pt-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={clientChecked} onCheckedChange={(v) => {
                  setIncludedClients((prev) => {
                    const base = prev === null ? new Set(clientsInData.map(x => x.client_id)) : new Set(prev);
                    if (v) base.add(c.client_id); else base.delete(c.client_id);
                    return base;
                  });
                }} />
                {c.name}
              </label>
              <div className="ml-6 flex flex-wrap gap-3 mt-1">
                {c.codeKeys.map((ck) => {
                  const codeChecked = !excludedCodeKeys.has(ck.key) && clientChecked;
                  return (
                    <label key={ck.key} className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={codeChecked} onCheckedChange={(v) => {
                        setExcludedCodeKeys((prev) => { const n = new Set(prev); if (v) n.delete(ck.key); else n.add(ck.key); return n; });
                      }} />
                      {ck.service_code}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">Including {visibleClientCount} of {clientsInData.length} clients · {visibleRows.length} code lines</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[1100px] text-sm max-md:[&_th:first-child]:sticky max-md:[&_th:first-child]:left-0 max-md:[&_th:first-child]:z-10 max-md:[&_th:first-child]:bg-card max-md:[&_td:first-child]:sticky max-md:[&_td:first-child]:left-0 max-md:[&_td:first-child]:bg-card">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>{HEADERS.map((h) => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={HEADERS.length} className="p-6 text-center text-muted-foreground">No billing rows for this period — add client billing codes and time data.</td></tr>
            ) : visibleRows.map((r) => (
              <tr key={`${r.consumer_pid}-${r.service_code}-${r.line_number}`} className="border-t border-border">
                <td className="px-3 py-2 tabular-nums">{r.line_number}</td>
                <td className="px-3 py-2">{r.provider_approver_email}</td>
                <td className="px-3 py-2">{r.consumer_name}</td>
                <td className="px-3 py-2 font-mono">{r.consumer_pid}</td>
                <td className="px-3 py-2 font-mono font-semibold">{r.service_code}</td>
                <td className="px-3 py-2 tabular-nums">{r.rate.toFixed(2)}</td>
                <td className="px-3 py-2">{r.unit_type}</td>
                <td className="px-3 py-2">{r.service_start_date}</td>
                <td className="px-3 py-2">{r.service_end_date}</td>
                <td className="px-3 py-2 tabular-nums font-semibold">{r.units}</td>
                <td className="px-3 py-2 tabular-nums">
                  {r.remaining_units}
                  <span className="block text-[10px] leading-tight text-muted-foreground">
                    {r._consumed_units} used / {r._annual_units} authorized
                  </span>
                </td>
                <td className="px-3 py-2">{r.sce}</td>
                <td className="px-3 py-2 tabular-nums">{r.monthly_max_units}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Units shown are whole numbers (1 unit = 15 min for hourly codes; 1 unit = 1 day for daily codes).
      </p>

      {/* ── Review & Submit ────────────────────────────────────────────── */}
      <Card className="border-amber-500/20 bg-card/60 backdrop-blur">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-amber-600" />
                Review & Attest — Provider Confirmation Required
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Every billing submission must be reviewed and confirmed by the provider before it's sent to the State.
              </p>
            </div>
            {submission && (
              <Badge variant="outline" className="font-mono text-[10px]">
                Status: {submission.status}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!ATTESTATION_COPY_APPROVED && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              Submission to the State is currently disabled — the provider attestation language is pending
              legal review and must be finalized before any 520 can be signed and submitted. Review and
              export (CSV / Excel / PDF) remain available.
            </div>
          )}
          {!submission ? (
            <div className="rounded-xl border border-dashed border-border bg-background/40 p-6 text-center">
              <p className="text-sm font-medium">
                {draftWarnings.length === 0
                  ? "No audit warnings detected for this period."
                  : `HIVE found ${draftWarnings.length} audit warning${draftWarnings.length === 1 ? "" : "s"} for this period.`}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Open the submission to lock these warnings in and begin the attestation workflow.
              </p>
              <Button onClick={openSubmission} disabled={busy || rows.length === 0} className="mt-3 gap-1.5">
                <FileSearch className="h-4 w-4" /> Open submission for review
              </Button>
            </div>
          ) : (
            <>
              {/* Warnings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Audit warnings ({warnings.length}) · {pendingCount} pending
                  </h3>
                </div>
                {warnings.length === 0 ? (
                  <Alert className="border-emerald-500/30 bg-emerald-500/5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <AlertTitle>Clean</AlertTitle>
                    <AlertDescription>HIVE did not surface any audit warnings for this submission.</AlertDescription>
                  </Alert>
                ) : (
                  warnings.map((w) => (
                    <Alert
                      key={w.id}
                      className={
                        w.severity === "blocker"
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-amber-500/40 bg-amber-500/5"
                      }
                    >
                      <AlertTriangle className={w.severity === "blocker" ? "h-4 w-4 text-destructive" : "h-4 w-4 text-amber-600"} />
                      <AlertTitle className="font-mono text-xs uppercase">{w.warning_type.replaceAll("_", " ")}</AlertTitle>
                      <AlertDescription className="space-y-2">
                        <p>{w.message}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {w.status === "pending" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 text-xs"
                                disabled={locked}
                                onClick={() => actWarning(w, "dismissed")}
                              >
                                <XCircle className="h-3.5 w-3.5" /> It's okay — dismiss
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 gap-1 text-xs"
                                disabled={locked}
                                onClick={() => actWarning(w, "attested")}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> I attest
                              </Button>
                            </>
                          ) : (
                            <Badge
                              variant="outline"
                              className={
                                w.status === "attested"
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "border-muted-foreground/30 bg-muted/40"
                              }
                            >
                              {w.status === "attested" ? "Attested" : "Dismissed"} by {w.actor_name} ·{" "}
                              {w.action_at ? new Date(w.action_at).toLocaleString() : "—"}
                            </Badge>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  ))
                )}
              </div>

              {/* Attestation */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Provider Attestation
                </h3>
                <p className="text-[11px] italic text-muted-foreground">
                  ⚠️ Placeholder legal copy — must be reviewed by counsel before launch.
                </p>
                <p className="text-sm leading-relaxed">{ATTESTATION_TEXT}</p>

                {locked ? (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">
                      <Lock className="mr-1 inline h-3.5 w-3.5" />
                      Submitted by {submission.attestation_signature_name}{" "}
                      on {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : "—"}.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="attest-checkbox"
                        checked={agreed}
                        onCheckedChange={(v) => setAgreed(v === true)}
                        disabled={!allActed}
                      />
                      <Label htmlFor="attest-checkbox" className="text-sm leading-snug">
                        I have read and agree to the attestation above.
                      </Label>
                    </div>
                    <div className="grid gap-1.5 max-w-md">
                      <Label htmlFor="attest-name" className="text-xs uppercase tracking-wider text-muted-foreground">
                        Type your full name to sign
                      </Label>
                      <Input
                        id="attest-name"
                        value={signatureName}
                        onChange={(e) => setSignatureName(e.target.value)}
                        placeholder="Jane Provider"
                        disabled={!allActed}
                      />
                    </div>
                    {!ATTESTATION_COPY_APPROVED && (
                      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                        Form 520 submission is temporarily disabled. The provider attestation
                        language is pending legal review and must be finalized before forms can
                        be signed and submitted.
                      </div>
                    )}
                    <Button
                      onClick={submitToState}
                      disabled={!ATTESTATION_COPY_APPROVED || busy || !allActed || !agreed || !signatureName.trim()}
                      className="gap-1.5"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {busy ? "Submitting…" : "Attest & submit to State"}
                    </Button>
                    {!allActed && (
                      <p className="text-[11px] text-muted-foreground">
                        Resolve all pending warnings to enable submission.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Audit log */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Immutable audit trail ({(auditQ.data ?? []).length})
                </h3>
                <div className="max-h-72 overflow-auto rounded-md border border-border bg-background/40">
                  {((auditQ.data ?? []) as Array<{
                    id: string; action: string; actor_name: string | null; created_at: string;
                    payload: Record<string, unknown>; item_type: string | null;
                  }>).map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] uppercase text-foreground">{a.action.replaceAll("_", " ")}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {a.actor_name ?? "Unknown"} · {new Date(a.created_at).toLocaleString()}
                          {a.item_type && <> · {a.item_type}</>}
                        </p>
                      </div>
                    </div>
                  ))}
                  {(auditQ.data ?? []).length === 0 && (
                    <p className="p-3 text-center text-xs text-muted-foreground">No audit entries yet.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
