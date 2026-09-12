import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAllClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { NectarHeader, NectarBadge } from "@/components/nectar/nectar-brand";
import { NectarInfusionLock } from "@/components/nectar/nectar-infusion-lock";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, ShieldCheck, FileSpreadsheet,
  ChevronRight, ListChecks,
} from "lucide-react";
import { isDailyServiceCode } from "@/lib/service-billing";
import {
  evaluateEntryReadiness,
  factsFromTimesheet,
  matchAuthRow,
  type BillingHold,
} from "@/lib/dspd-entry-readiness";
import { BillingHoldsList, EntryReadinessChips } from "@/components/billing/billing-holds";

/**
 * NECTAR Billing Readiness Bar.
 *
 * Period coverage (punches / daily records / attendance) is NOT billing
 * eligibility. Clocked-out entries are evaluated with evaluateEntryReadiness
 * so staff readiness, note completeness, and billing holds stay separate.
 * A narrative pass never marks a claim eligible.
 *
 * Tier: NECTAR Infusion (paid). Visible-but-locked in lower tiers via
 * NectarInfusionLock; the underlying billing run + 520 export still work
 * without it.
 */

type CoverageCategory =
  | "missing_punches"
  | "missing_daily_record"
  | "missing_attendance"
  | "incident_reports"
  | "medical_visits";

type CoverageGap = {
  client_id: string;
  client_name: string;
  service_code?: string;
  category: CoverageCategory;
  severity: "coverage" | "advisory";
  message: string;
  link?: { to: string; params?: Record<string, string> };
};

type EntryHoldRow = {
  timesheet_id: string;
  client_id: string;
  client_name: string;
  service_code: string | null;
  noteComplete: boolean;
  staffReady: boolean;
  holds: BillingHold[];
};

type TimesheetScanRow = {
  id: string;
  client_id: string;
  staff_id: string | null;
  service_type_code: string | null;
  clock_in_timestamp: string | null;
  clock_out_timestamp: string | null;
  gps_in_coordinates: { latitude?: number | null; longitude?: number | null } | null;
  gps_out_coordinates: { latitude?: number | null; longitude?: number | null } | null;
  outside_geofence_reason: string | null;
  gps_in_bypassed: boolean | null;
  gps_out_bypassed: boolean | null;
  matched_approved_location_id: string | null;
  attested_at: string | null;
  attested_accurate: boolean | null;
  ai_compliance_status: string | null;
  shift_note_text: string | null;
};

const CATEGORY_LABEL: Record<CoverageCategory, string> = {
  missing_punches: "No recorded time this period",
  missing_daily_record: "No billable daily record this period",
  missing_attendance: "Monthly attendance not started",
  incident_reports: "Incident reports",
  medical_visits: "Medical visit reports",
};

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function NectarBillingReadinessBar() {
  return (
    <NectarInfusionLock
      featureName="NECTAR Billing Readiness"
      benefit="NECTAR scans every billing code against your EVV, daily logs, attendance, incident reports, and medical visits — and tells you exactly what's missing before you run billing or generate a 520."
    >
      <ReadinessBarInner />
    </NectarInfusionLock>
  );
}

function ReadinessBarInner() {
  const { data: org } = useCurrentOrg();
  const { data: codes } = useAllClientBillingCodes();
  const orgId = org?.organization_id;
  const [open, setOpen] = useState(false);

  const periodStart = startOfMonth();
  const periodEnd = endOfMonth();
  const periodStartISO = periodStart.toISOString();
  const periodStartDate = periodStart.toISOString().slice(0, 10);
  const periodEndDate = periodEnd.toISOString().slice(0, 10);

  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["billing-readiness-clients", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>;
    },
  });

  const dataQ = useQuery({
    enabled: !!orgId,
    queryKey: ["billing-readiness-data", orgId, periodStartDate],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [ts, dl, att, inc, med] = await Promise.all([
        supabase
          .from("evv_timesheets")
          .select("id, client_id, staff_id, service_type_code, clock_in_timestamp, clock_out_timestamp, gps_in_coordinates, gps_out_coordinates, outside_geofence_reason, gps_in_bypassed, gps_out_bypassed, matched_approved_location_id, attested_at, attested_accurate, ai_compliance_status, shift_note_text")
          .eq("organization_id", orgId!)
          .gte("clock_in_timestamp", periodStartISO)
          .not("clock_out_timestamp", "is", null),
        // Billable daily-rate days come from the hhs_daily_records_v view
        // (billable = attendance Present + daily note). Attendance below is a
        // separate signal.
        supabase
          .from("hhs_daily_records_v")
          .select("client_id, record_date, billable")
          .eq("organization_id", orgId!)
          .eq("billable", true)
          .gte("record_date", periodStartDate)
          .lte("record_date", periodEndDate),
        supabase
          .from("hhs_monthly_attendance")
          .select("client_id, record_date")
          .eq("organization_id", orgId!)
          .gte("record_date", periodStartDate)
          .lte("record_date", periodEndDate),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("hhs_incident_reports")
          .select("client_id, status, occurred_at")
          .eq("organization_id", orgId!)
          .gte("occurred_at", periodStartISO),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("hhs_medical_logs")
          .select("client_id, record_date")
          .eq("organization_id", orgId!)
          .gte("record_date", periodStartDate)
          .lte("record_date", periodEndDate),
      ]);
      return {
        ts: (ts.data ?? []) as TimesheetScanRow[],
        dl: (dl.data ?? []) as Array<{ client_id: string; record_date: string }>,
        att: (att.data ?? []) as Array<{ client_id: string; record_date: string }>,
        inc: (inc.data ?? []) as Array<{ client_id: string; status: string }>,
        med: (med.data ?? []) as Array<{ client_id: string }>,
      };
    },
  });

  const { coverage, entryHolds, totalClients, noteIncomplete, staffBlocked } = useMemo(() => {
    const coverage: CoverageGap[] = [];
    const entryHolds: EntryHoldRow[] = [];
    const clients = clientsQ.data ?? [];
    const allCodes = codes ?? [];
    const d = dataQ.data;
    if (!d) {
      return {
        coverage,
        entryHolds,
        totalClients: clients.length,
        noteIncomplete: 0,
        staffBlocked: 0,
      };
    }

    const nameById = new Map(clients.map((c) => [c.id, `${c.last_name}, ${c.first_name}`]));
    const tsByClientCode = new Set<string>();
    let noteIncomplete = 0;
    let staffBlocked = 0;
    for (const r of d.ts) {
      tsByClientCode.add(`${r.client_id}::${r.service_type_code ?? ""}`);
      const auth = codes ? matchAuthRow(allCodes, r.client_id, r.service_type_code) : undefined;
      const verdict = evaluateEntryReadiness(factsFromTimesheet(r, auth));
      if (verdict.note.status === "incomplete") noteIncomplete += 1;
      if (verdict.staff.status === "blocked") staffBlocked += 1;
      if (verdict.billing.holds.length === 0) continue;
      entryHolds.push({
        timesheet_id: String(r.id ?? `${r.client_id}-${r.clock_in_timestamp}`),
        client_id: r.client_id,
        client_name: nameById.get(r.client_id) ?? "Client",
        service_code: r.service_type_code,
        noteComplete: verdict.note.status === "complete",
        staffReady: verdict.staff.status === "ready",
        holds: verdict.billing.holds,
      });
    }
    const dlByClient = new Set<string>(d.dl.map((r) => r.client_id));
    const attByClient = new Set<string>(d.att.map((r) => r.client_id));
    const incPendingByClient = new Map<string, number>();
    for (const r of d.inc) {
      if (r.status === "pending_admin_review") {
        incPendingByClient.set(r.client_id, (incPendingByClient.get(r.client_id) ?? 0) + 1);
      }
    }

    for (const c of clients) {
      const clientCodes = allCodes.filter((b) => b.client_id === c.id);
      if (clientCodes.length === 0) continue;
      const name = `${c.last_name}, ${c.first_name}`;

      for (const code of clientCodes) {
        const isDaily = isDailyServiceCode(code.service_code);
        if (!isDaily) {
          if (!tsByClientCode.has(`${c.id}::${code.service_code}`)) {
            coverage.push({
              client_id: c.id,
              client_name: name,
              service_code: code.service_code,
              category: "missing_punches",
              severity: "coverage",
              message: `No recorded time for ${code.service_code} this period — coverage only, not a claim hold.`,
              link: { to: "/dashboard/timeclock" },
            });
          }
        } else if (!dlByClient.has(c.id)) {
          coverage.push({
            client_id: c.id,
            client_name: name,
            service_code: code.service_code,
            category: "missing_daily_record",
            severity: "coverage",
            message: `No billable daily-record days for ${code.service_code} this period.`,
            link: { to: "/dashboard/hhs-hub/$clientId", params: { clientId: c.id } },
          });
        }
      }

      if (!attByClient.has(c.id)) {
        coverage.push({
          client_id: c.id,
          client_name: name,
          category: "missing_attendance",
          severity: "coverage",
          message: "Monthly attendance not started for this period.",
          link: { to: "/dashboard/hhs-hub/$clientId", params: { clientId: c.id } },
        });
      }

      const pendInc = incPendingByClient.get(c.id) ?? 0;
      if (pendInc > 0) {
        coverage.push({
          client_id: c.id,
          client_name: name,
          category: "incident_reports",
          severity: "advisory",
          message: `${pendInc} incident report${pendInc === 1 ? "" : "s"} awaiting admin review.`,
          link: { to: "/dashboard/records-desk" },
        });
      }
    }

    return { coverage, entryHolds, totalClients: clients.length, noteIncomplete, staffBlocked };
  }, [clientsQ.data, codes, dataQ.data]);

  const holdCount = entryHolds.reduce((n, r) => n + r.holds.length, 0);
  const coverageCount = coverage.filter((i) => i.severity === "coverage").length;
  const advisoryCount = coverage.length - coverageCount;
  const loading = clientsQ.isLoading || dataQ.isLoading;
  const reviewCount = entryHolds.length + coverage.length;

  const periodLabel = periodStart.toLocaleString("en-US", { month: "long", year: "numeric" });

  const statusChip = loading
    ? { label: "Scanning…", cls: "bg-white/15 text-white/90 border-white/30" }
    : holdCount > 0
    ? {
        label: `${holdCount} billing hold${holdCount === 1 ? "" : "s"}`,
        cls: "bg-[#7a1d1d]/40 text-rose-100 border-rose-300/40",
      }
    : coverageCount > 0
    ? {
        label: `${coverageCount} coverage gap${coverageCount === 1 ? "" : "s"}`,
        cls: "bg-amber-500/20 text-amber-100 border-amber-300/40",
      }
    : advisoryCount > 0
    ? {
        label: `${advisoryCount} advisory item${advisoryCount === 1 ? "" : "s"}`,
        cls: "bg-amber-500/20 text-amber-100 border-amber-300/40",
      }
    : {
        label: entryHolds.length === 0 && (dataQ.data?.ts.length ?? 0) === 0
          ? "No entries to evaluate"
          : "No billing holds",
        cls: "bg-emerald-500/20 text-emerald-100 border-emerald-300/40",
      };

  return (
    <>
      <NectarHeader
        surface="navy"
        markSize="md"
        eyebrow="Billing Readiness"
        title={`${periodLabel} — ${loading ? "Assessing entries…" : holdCount > 0 ? "Billing holds on recorded entries" : "Coverage vs billing eligibility"}`}
        description={
          loading
            ? "Reading punches, daily records, and authorizations."
            : `Staff ready / note complete / billing eligible are separate. ${staffBlocked} staff-blocked · ${noteIncomplete} notes incomplete · ${holdCount} billing hold${holdCount === 1 ? "" : "s"} across ${totalClients} client${totalClients === 1 ? "" : "s"}. Missing period time is coverage, not a claim hold.`
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusChip.cls}`}
            >
              {holdCount === 0 && coverageCount === 0 ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              {statusChip.label}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOpen(true)}
              disabled={loading || reviewCount === 0}
              className="h-8 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <ListChecks className="mr-1.5 h-3.5 w-3.5" />
              Review {reviewCount || ""} item{reviewCount === 1 ? "" : "s"}
            </Button>
            <Button asChild size="sm" className="h-8 gap-1.5 bg-[image:var(--gradient-amber)] text-[#412402] hover:brightness-105">
              <Link to="/dashboard/billing/form520">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Run billing · 520
              </Link>
            </Button>
          </div>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NectarBadge size="xs" /> Billing holds and coverage — {periodLabel}
            </DialogTitle>
            <DialogDescription>
              {holdCount} billing hold{holdCount === 1 ? "" : "s"} · {coverageCount} coverage gap
              {coverageCount === 1 ? "" : "s"} · {advisoryCount} advisory. Note completeness is listed separately from billing.
            </DialogDescription>
          </DialogHeader>

          {reviewCount === 0 ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
              <ShieldCheck className="mr-1.5 inline h-4 w-4 text-emerald-600" />
              No billing holds on recorded entries, and no coverage gaps this period.
            </div>
          ) : (
            <div className="max-h-[60vh] space-y-4 overflow-auto pr-1">
              {entryHolds.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Billing holds on recorded entries
                  </p>
                  {entryHolds.map((row) => (
                    <div
                      key={row.timesheet_id}
                      className="rounded-lg border border-rose-300/40 bg-rose-500/[0.04] p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {row.client_name}
                          {row.service_code ? ` · ${row.service_code}` : ""}
                        </p>
                        <EntryReadinessChips
                          result={{
                            staff: { status: row.staffReady ? "ready" : "blocked", holds: [] },
                            note: { status: row.noteComplete ? "complete" : "incomplete", source: "nectar" },
                            billing: { status: "held", holds: row.holds },
                          }}
                        />
                      </div>
                      <BillingHoldsList holds={row.holds} />
                    </div>
                  ))}
                </div>
              )}
              {coverage.length > 0 && (
                <ul className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Period coverage (not claim eligibility)
                  </p>
                  {coverage.map((it, i) => (
                    <li
                      key={`${it.client_id}-${it.category}-${it.service_code ?? ""}-${i}`}
                      className={`rounded-lg border p-3 ${
                        it.severity === "coverage"
                          ? "border-amber-400/40 bg-amber-500/[0.04]"
                          : "border-slate-300/40 bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{it.client_name}</p>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {CATEGORY_LABEL[it.category]}
                            {it.service_code ? ` · ${it.service_code}` : ""}
                            {it.severity === "advisory" ? " · advisory" : " · coverage"}
                          </p>
                          <p className="mt-1 text-sm text-foreground/80">{it.message}</p>
                        </div>
                        {it.link && (
                          <Button asChild size="sm" variant="ghost" className="shrink-0">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <Link to={it.link.to as any} params={it.link.params as any}>
                              Open <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
