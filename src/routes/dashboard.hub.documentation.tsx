import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, AlertTriangle, FileText, Info } from "lucide-react";
import { HubShell } from "@/components/admin-hubs/hub-shell";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { ComplianceDeskWrapped } from "./dashboard.compliance-desk";
import { TimesheetsReconcile } from "@/components/scheduling/timesheets-reconcile";
import { HostHomeControl } from "./dashboard.host-home-control";
import { FormsIndex } from "./dashboard.forms.index";
import { InternalAuditPage } from "./dashboard.internal-audit";
import { AuditPage } from "./dashboard.audit";
import { AuditZone } from "@/components/audit-zone/audit-zone";
import { HrcPage } from "./dashboard.hrc";
import { AdminIncidentsSection } from "@/components/incidents/admin-incidents-section";

const search = z.object({
  tab: z.enum(["review", "evv", "incidents", "host-home", "forms", "audit", "hrc"]).optional(),
  client: z.string().optional(),
});

export const Route = createFileRoute("/dashboard/hub/documentation")({
  head: () => ({ meta: [{ title: "Documentation — HIVE" }] }),
  validateSearch: (s) => search.parse(s),
  component: DocumentationHub,
});

function DocumentationHub() {
  const { client } = Route.useSearch();
  return (
    <HubShell
      title="Documentation"
      basePath="/dashboard/hub/documentation"
      tabs={[
        { key: "review", label: "Review", render: () => <ReviewLanding /> },
        { key: "evv", label: "EVV & timesheets", render: () => (
          <div className="space-y-6">
            <ComplianceDeskWrapped />
            <details className="group rounded-lg border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#0B1126]">
                <span>Pay-period reconciliation</span>
                <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
                <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
              </summary>
              <div className="border-t border-border px-4 py-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Coverage proof, billing burn-down, payroll, and exceptions — derived from the same EVV punches above. Advisory.
                </p>
                <TimesheetsReconcile />
              </div>
            </details>
          </div>
        ) },
        {
          key: "incidents",
          label: "Incidents",
          render: () => (
            <AdminIncidentsSection
              initialClientId={client ?? null}
              initialView={client ? "log" : "queue"}
            />
          ),
        },
        { key: "host-home", label: "Host home", render: () => <HostHomeControl /> },
        { key: "forms", label: "Forms", render: () => <FormsIndex /> },
        {
          key: "audit",
          label: "Audit",
          render: () => (
            <div className="space-y-10">
              <section>
                <header className="mb-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#0B1126]">
                    Readiness check
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    NECTAR self-audit: DSPD-style sample, scope filters, readiness score, critical gaps.
                  </p>
                </header>
                <InternalAuditPage />
              </section>
              <section>
                <header className="mb-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#0B1126]">
                    Evidence pull
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Build audit packets and share evidence with auditors.
                  </p>
                </header>
                <div className="space-y-8">
                  <AuditPage />
                  <AuditZone />
                </div>
              </section>
            </div>
          ),
        },
        { key: "hrc", label: "Human Rights Committee", render: () => <HrcPage /> },
      ]}
    />
  );
}

// ─── Review landing (read-only summary tiles) ────────────────────────────────
function ReviewLanding() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  const tsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["review-ts-pending", orgId],
    queryFn: async () => {
      const { count } = await supabase
        .from("evv_timesheets")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .eq("status", "Pending");
      return count ?? 0;
    },
  });

  const flagsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["review-evv-flags", orgId],
    queryFn: async () => {
      const { count } = await supabase
        .from("shift_completeness_flags")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .is("resolved_at", null);
      return count ?? 0;
    },
  });

  const formsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["review-forms-pending", orgId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase as any)
        .from("form_submissions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .in("status", ["pending", "submitted", "awaiting_review"]);
      return count ?? 0;
    },
  });

  const tiles = [
    {
      key: "ts",
      label: "Timesheets pending approval",
      count: tsQ.data,
      loading: tsQ.isLoading,
      Icon: ClipboardCheck,
      tone: "text-[#137182] bg-[#137182]/10",
      to: "/dashboard/hub/documentation",
      tab: "evv" as const,
    },
    {
      key: "flags",
      label: "EVV exceptions / mismatches",
      count: flagsQ.data,
      loading: flagsQ.isLoading,
      Icon: AlertTriangle,
      tone: "text-amber-700 bg-amber-100",
      to: "/dashboard/hub/documentation",
      tab: "evv" as const,
    },
    {
      key: "forms",
      label: "Forms awaiting sign-off",
      count: formsQ.data,
      loading: formsQ.isLoading,
      Icon: FileText,
      tone: "text-[#0B1126] bg-[#0B1126]/10",
      to: "/dashboard/hub/documentation",
      tab: "forms" as const,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[#0B1126]">What needs review</h3>
        <p className="text-xs text-muted-foreground">
          Read-only counts from existing records. Click a tile to open the relevant tab.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ key, label, count, loading, Icon, tone, to, tab }) => (
          <Link
            key={key}
            to={to}
            search={{ tab }}
            className="block min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#137182] rounded-lg"
          >
            <Card className="transition hover:border-[#137182]/40 hover:shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums text-[#0B1126]">
                    {loading ? "—" : (count ?? 0).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Host-home logs are not shown as a tile because host-home daily records don't expose a
          pending-review status to count. Open the <span className="font-medium">Host home</span> tab
          to review them directly.
        </p>
      </div>
    </div>
  );
}
