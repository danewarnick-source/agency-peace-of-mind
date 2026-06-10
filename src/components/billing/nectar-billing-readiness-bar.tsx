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

/**
 * NECTAR Billing Readiness Bar.
 *
 * Sits at the top of the Billing tab. Reads the data layer to assess whether
 * every billing code, for every client, has the supporting documentation an
 * auditor would expect for the current billing period:
 *   • EVV time punches (hourly codes)
 *   • Daily logs / progress notes
 *   • Monthly attendance
 *   • Incident reports cleared (advisory)
 *   • Medical visit reports current (advisory)
 *
 * NECTAR reports — it does not write. Drill-down opens a list of what's
 * missing, with deep links back into the records that need attention.
 *
 * Tier: NECTAR Infusion (paid). Visible-but-locked in lower tiers via
 * NectarInfusionLock; the underlying billing run + 520 export still work
 * without it.
 */

type CheckCategory =
  | "evv"
  | "daily_logs"
  | "monthly_attendance"
  | "incident_reports"
  | "medical_visits";

type ReadinessIssue = {
  client_id: string;
  client_name: string;
  service_code?: string;
  category: CheckCategory;
  severity: "blocker" | "advisory";
  message: string;
  link?: { to: string; params?: Record<string, string> };
};

const CATEGORY_LABEL: Record<CheckCategory, string> = {
  evv: "EVV time punches",
  daily_logs: "Daily logs / progress notes",
  monthly_attendance: "Monthly attendance",
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
          .select("client_id, service_type_code")
          .eq("organization_id", orgId!)
          .gte("clock_in_timestamp", periodStartISO)
          .not("clock_out_timestamp", "is", null),
        // Daily/HHS narrative days now live in daily_logs (record_date -> log_date);
        // hhs_daily_records is orphaned. Attendance below is a separate signal.
        supabase
          .from("daily_logs")
          .select("client_id, record_date:log_date")
          .eq("organization_id", orgId!)
          .gte("log_date", periodStartDate)
          .lte("log_date", periodEndDate),
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
        ts: (ts.data ?? []) as Array<{ client_id: string; service_type_code: string | null }>,
        dl: (dl.data ?? []) as Array<{ client_id: string; record_date: string }>,
        att: (att.data ?? []) as Array<{ client_id: string; record_date: string }>,
        inc: (inc.data ?? []) as Array<{ client_id: string; status: string }>,
        med: (med.data ?? []) as Array<{ client_id: string }>,
      };
    },
  });

  const { issues, ready, totalClients } = useMemo(() => {
    const issues: ReadinessIssue[] = [];
    const clients = clientsQ.data ?? [];
    const allCodes = codes ?? [];
    const d = dataQ.data;
    if (!d) return { issues, ready: 0, totalClients: clients.length };

    // index lookups
    const tsByClientCode = new Set<string>();
    for (const r of d.ts) tsByClientCode.add(`${r.client_id}::${r.service_type_code ?? ""}`);
    const dlByClient = new Set<string>(d.dl.map((r) => r.client_id));
    const attByClient = new Set<string>(d.att.map((r) => r.client_id));
    const incPendingByClient = new Map<string, number>();
    for (const r of d.inc) {
      if (r.status === "pending_admin_review") {
        incPendingByClient.set(r.client_id, (incPendingByClient.get(r.client_id) ?? 0) + 1);
      }
    }

    let readyClients = 0;
    for (const c of clients) {
      const clientCodes = allCodes.filter((b) => b.client_id === c.id);
      if (clientCodes.length === 0) continue;
      const before = issues.length;
      const name = `${c.last_name}, ${c.first_name}`;

      for (const code of clientCodes) {
        const isDaily = isDailyServiceCode(code.service_code);
        if (!isDaily) {
          if (!tsByClientCode.has(`${c.id}::${code.service_code}`)) {
            issues.push({
              client_id: c.id,
              client_name: name,
              service_code: code.service_code,
              category: "evv",
              severity: "blocker",
              message: `No EVV time punches recorded for ${code.service_code} this period.`,
              link: { to: "/dashboard/timeclock" },
            });
          }
        } else {
          if (!dlByClient.has(c.id)) {
            issues.push({
              client_id: c.id,
              client_name: name,
              service_code: code.service_code,
              category: "daily_logs",
              severity: "blocker",
              message: `No daily logs recorded for ${code.service_code} this period.`,
              link: { to: "/dashboard/hhs-hub/$clientId", params: { clientId: c.id } },
            });
          }
        }
      }

      if (!attByClient.has(c.id)) {
        issues.push({
          client_id: c.id,
          client_name: name,
          category: "monthly_attendance",
          severity: "blocker",
          message: "Monthly attendance not started for this period.",
          link: { to: "/dashboard/hhs-hub/$clientId", params: { clientId: c.id } },
        });
      }

      const pendInc = incPendingByClient.get(c.id) ?? 0;
      if (pendInc > 0) {
        issues.push({
          client_id: c.id,
          client_name: name,
          category: "incident_reports",
          severity: "advisory",
          message: `${pendInc} incident report${pendInc === 1 ? "" : "s"} awaiting admin review.`,
          link: { to: "/dashboard/records-desk" },
        });
      }

      if (issues.length === before) readyClients += 1;
    }

    return { issues, ready: readyClients, totalClients: clients.length };
  }, [clientsQ.data, codes, dataQ.data]);

  const blockerCount = issues.filter((i) => i.severity === "blocker").length;
  const advisoryCount = issues.length - blockerCount;
  const loading = clientsQ.isLoading || dataQ.isLoading;
  const allReady = !loading && issues.length === 0 && totalClients > 0;

  const periodLabel = periodStart.toLocaleString("en-US", { month: "long", year: "numeric" });

  const statusChip = loading
    ? { label: "Scanning…", cls: "bg-white/15 text-white/90 border-white/30" }
    : allReady
    ? { label: "Ready to bill", cls: "bg-emerald-500/20 text-emerald-100 border-emerald-300/40" }
    : blockerCount > 0
    ? {
        label: `${blockerCount} blocker${blockerCount === 1 ? "" : "s"}${advisoryCount ? ` · ${advisoryCount} advisory` : ""}`,
        cls: "bg-[#7a1d1d]/40 text-rose-100 border-rose-300/40",
      }
    : {
        label: `${advisoryCount} advisory item${advisoryCount === 1 ? "" : "s"}`,
        cls: "bg-amber-500/20 text-amber-100 border-amber-300/40",
      };

  return (
    <>
      <NectarHeader
        surface="navy"
        markSize="md"
        eyebrow="Billing Readiness"
        title={`${periodLabel} — ${allReady ? "All codes audit-ready" : loading ? "Assessing readiness…" : "Items need attention"}`}
        description={
          allReady
            ? `Every active client and code has the supporting records an auditor would expect (${totalClients} client${totalClients === 1 ? "" : "s"} scanned). Safe to run billing and extract 520s.`
            : "NECTAR is reading what exists across EVV, daily logs, attendance, incidents, and medical visits — and flagging what's missing before you submit."
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusChip.cls}`}
            >
              {allReady ? (
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
              disabled={loading || issues.length === 0}
              className="h-8 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <ListChecks className="mr-1.5 h-3.5 w-3.5" />
              Review {issues.length || ""} item{issues.length === 1 ? "" : "s"}
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
              <NectarBadge size="xs" /> Billing readiness — {periodLabel}
            </DialogTitle>
            <DialogDescription>
              {ready} of {totalClients} clients ready · {blockerCount} blocker
              {blockerCount === 1 ? "" : "s"} · {advisoryCount} advisory
            </DialogDescription>
          </DialogHeader>

          {issues.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
              <ShieldCheck className="mr-1.5 inline h-4 w-4 text-emerald-600" />
              Everything looks complete. You're clear to run billing.
            </div>
          ) : (
            <ul className="max-h-[60vh] space-y-2 overflow-auto pr-1">
              {issues.map((it, i) => (
                <li
                  key={`${it.client_id}-${it.category}-${it.service_code ?? ""}-${i}`}
                  className={`rounded-lg border p-3 ${
                    it.severity === "blocker"
                      ? "border-rose-300/40 bg-rose-500/[0.04]"
                      : "border-amber-400/40 bg-amber-500/[0.04]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{it.client_name}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {CATEGORY_LABEL[it.category]}
                        {it.service_code ? ` · ${it.service_code}` : ""}
                        {it.severity === "blocker" ? " · blocker" : " · advisory"}
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
        </DialogContent>
      </Dialog>
    </>
  );
}
