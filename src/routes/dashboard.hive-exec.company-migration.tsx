import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRightLeft, CheckCircle2, Sparkles, Briefcase, ShieldAlert,
  Building2, Receipt, Lock, ExternalLink, Loader2, FileSearch,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NectarGuidanceStrip } from "@/components/nectar/nectar-guidance-strip";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { listCompanies, type CompanyRow } from "@/lib/hive-exec.functions";
import { createSmartImportJob } from "@/lib/smart-import.functions";
import {
  listMigrationJobs, setEngagement, logHiveAccess, listAccessLog,
} from "@/lib/hive-migration.functions";

export const Route = createFileRoute("/dashboard/hive-exec/company-migration")({
  head: () => ({
    meta: [
      { title: "Company Migration — HIVE Executive" },
      {
        name: "description",
        content:
          "HIVE-staff migration service: secure intake of a customer's export, prepped by HIVE staff and committed only after the receiving company's admin signs off.",
      },
    ],
  }),
  component: () => (
    <RequireHiveExecutive>
      <CompanyMigrationPage />
    </RequireHiveExecutive>
  ),
});

type EngagementStatus = "quoted" | "in_progress" | "review" | "complete";
const ENGAGEMENT_STEPS: { value: EngagementStatus; label: string }[] = [
  { value: "quoted", label: "Quoted" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Customer review" },
  { value: "complete", label: "Complete" },
];

type MigrationJob = {
  id: string;
  status: string;
  mode: string | null;
  source: string;
  scale: string | null;
  engagement_status: EngagementStatus;
  quote_amount_cents: number | null;
  provider_signoff_at: string | null;
  provider_signoff_by: string | null;
  created_at: string;
  committed_at: string | null;
  submitted_at: string | null;
  target_org_id: string;
  notes: string | null;
};

function CompanyMigrationPage() {
  const navigate = useNavigate();
  const [targetOrgId, setTargetOrgId] = useState<string>("");
  const [mode, setMode] = useState<"employee" | "client">("client");
  const [quote, setQuote] = useState<string>("2000");

  const listCompaniesFn = useServerFn(listCompanies);
  const listJobsFn = useServerFn(listMigrationJobs);
  const createFn = useServerFn(createSmartImportJob);
  const engageFn = useServerFn(setEngagement);
  const logFn = useServerFn(logHiveAccess);
  const accessLogFn = useServerFn(listAccessLog);

  const companiesQ = useQuery<CompanyRow[]>({
    queryKey: ["hive-exec-companies-migration"],
    queryFn: () => listCompaniesFn(),
    staleTime: 60_000,
  });
  const targetCompany = companiesQ.data?.find((c) => c.organization_id === targetOrgId) ?? null;

  const jobsQ = useQuery<MigrationJob[]>({
    queryKey: ["hive-migration-jobs", targetOrgId],
    queryFn: () => listJobsFn({ data: { targetOrgId } }),
    enabled: !!targetOrgId,
  });

  const activeJob = useMemo(
    () => (jobsQ.data ?? []).find((j) => j.status !== "discarded" && j.status !== "committed") ?? null,
    [jobsQ.data],
  );
  const engagementStatus: EngagementStatus = activeJob?.engagement_status
    ?? ((jobsQ.data?.[0]?.engagement_status as EngagementStatus | undefined) ?? "quoted");

  const accessLogQ = useQuery({
    queryKey: ["hive-migration-access", activeJob?.id],
    queryFn: () => accessLogFn({ data: { jobId: activeJob!.id } }),
    enabled: !!activeJob,
  });

  // Log view-only access when a HIVE exec lands on a customer's active job.
  useEffect(() => {
    if (!activeJob) return;
    logFn({ data: { jobId: activeJob.id, action: "view_migration", details: { target_org_id: targetOrgId } } })
      .catch(() => null);
  }, [activeJob?.id]);

  const createM = useMutation({
    mutationFn: async () => {
      if (!targetCompany) throw new Error("Pick a target company first.");
      // Job is owned by the HIVE org of the executive (their primary org),
      // but scoped to target_org_id so prep + commit land in the customer's data.
      // We pass the target org as the host org for the staging job too — the
      // commit fn re-routes writes to target_org_id on white_glove.
      const res = await createFn({
        data: {
          organizationId: targetCompany.organization_id,
          mode,
          source: "white_glove",
          scale: "bulk",
          targetOrgId: targetCompany.organization_id,
          notes: `White-glove migration for ${targetCompany.name}`,
        },
      });
      await engageFn({ data: { jobId: res.jobId, engagement_status: "in_progress",
        quote_amount_cents: quote ? Math.round(parseFloat(quote) * 100) : null } });
      await logFn({ data: { jobId: res.jobId, action: "create_migration",
        details: { target_org_id: targetCompany.organization_id, mode } } });
      return res.jobId;
    },
    onSuccess: (jobId) => {
      toast.success("Migration job created. Routing to shared importer for ingest.");
      navigate({ to: "/dashboard/smart-import/$jobId/review", params: { jobId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const engageM = useMutation({
    mutationFn: (next: EngagementStatus) =>
      engageFn({ data: { jobId: activeJob!.id, engagement_status: next } }),
    onSuccess: () => { jobsQ.refetch(); toast.success("Engagement updated."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const quoteM = useMutation({
    mutationFn: (cents: number) =>
      engageFn({ data: { jobId: activeJob!.id, quote_amount_cents: cents } }),
    onSuccess: () => { jobsQ.refetch(); toast.success("Quote saved."); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[#fed7aa]">
          <ArrowRightLeft className="h-3.5 w-3.5" /> HIVE Executive · Company Migration Service
        </div>
        <h1 className="text-2xl font-semibold">Migrate a customer onto HIVE</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Paid white-glove onboarding. HIVE staff prep the import using the shared
          NECTAR engine; the receiving company's admin signs off before anything
          commits. Customer companies never see this tool.
        </p>
      </header>

      <div className="flex items-start gap-2 rounded-lg border border-amber-400/50 bg-amber-50/40 p-3 text-xs dark:bg-amber-950/30">
        <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-700 dark:text-amber-300" />
        <div className="text-amber-900 dark:text-amber-100">
          <strong>Internal only.</strong> Customer companies never see this page. Files
          are uploaded through the platform's private bucket under the BAA — never email.
          Every HIVE-staff action on this customer's data is logged.
        </div>
      </div>

      {/* Engagement */}
      <Card className="border-[#fed7aa] bg-gradient-to-br from-[#fff7ed] to-card/40 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Briefcase className="h-4 w-4 text-[#d97a1c]" /> Billable engagement
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr,1fr]">
          <div className="space-y-1">
            <Label htmlFor="target-company">Target company</Label>
            <Select value={targetOrgId} onValueChange={setTargetOrgId}>
              <SelectTrigger id="target-company">
                <SelectValue placeholder={companiesQ.isLoading ? "Loading companies…" : "Select a company"} />
              </SelectTrigger>
              <SelectContent>
                {(companiesQ.data ?? []).map((c) => (
                  <SelectItem key={c.organization_id} value={c.organization_id}>
                    {c.name} · {c.staff_count} staff · {c.client_count} clients
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mode">Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "employee" | "client")}>
              <SelectTrigger id="mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Clients (people served)</SelectItem>
                <SelectItem value="employee">Employees (staff)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="quote">Quote (USD)</Label>
            <div className="flex items-center rounded-md border border-input bg-background px-2">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                id="quote" type="number" min="0" step="100"
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                onBlur={() => { if (activeJob && quote) quoteM.mutate(Math.round(parseFloat(quote) * 100)); }}
                className="w-full bg-transparent px-2 py-2 text-sm outline-none"
                placeholder="2000"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="status">Status</Label>
            <Select
              value={engagementStatus}
              disabled={!activeJob}
              onValueChange={(v) => engageM.mutate(v as EngagementStatus)}
            >
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENGAGEMENT_STEPS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          {ENGAGEMENT_STEPS.map((s, i) => {
            const reached = ENGAGEMENT_STEPS.findIndex((x) => x.value === engagementStatus) >= i;
            return (
              <span
                key={s.value}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                  reached ? "bg-[#d97a1c] text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {reached && <CheckCircle2 className="h-3 w-3" />} {s.label}
              </span>
            );
          })}
        </div>
      </Card>

      <NectarGuidanceStrip
        title="One engine. HIVE preps; the customer signs off."
        message={
          <>
            This page runs the same Smart Import engine the customer uses, just scoped
            to their company. You can ingest, map, and clean. The commit only fires
            after their admin reviews and signs off — they own that decision.
          </>
        }
      />

      {/* Start / continue */}
      {!targetOrgId ? (
        <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">
          Pick a target company to begin.
        </Card>
      ) : !activeJob ? (
        <Card className="border-border/60 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold">Start a migration for {targetCompany?.name}</div>
              <p className="text-xs text-muted-foreground">
                Creates a white-glove import job scoped to this company. You'll be
                routed into the shared engine to upload their export (private bucket
                under the BAA) and prep the mapping.
              </p>
            </div>
            <Button
              onClick={() => createM.mutate()}
              disabled={createM.isPending}
              className="bg-amber-500 text-amber-950 hover:bg-amber-400"
            >
              {createM.isPending
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</>
                : <><Sparkles className="mr-2 h-4 w-4" /> Start migration</>}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="border-border/60 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4 text-[#d97a1c]" /> Active migration · {targetCompany?.name}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="capitalize">{activeJob.status.replace(/_/g, " ")}</Badge>
                <Badge variant="outline">{activeJob.mode}</Badge>
                {activeJob.provider_signoff_at
                  ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Provider signed off
                    </Badge>
                  : <Badge variant="outline" className="text-amber-700">
                      <Lock className="mr-1 h-3 w-3" /> Awaiting customer sign-off
                    </Badge>}
                <span>created {new Date(activeJob.created_at).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/dashboard/smart-import/$jobId/review" params={{ jobId: activeJob.id }}>
                  <FileSearch className="mr-2 h-4 w-4" /> Open prep / review
                </Link>
              </Button>
              {activeJob.provider_signoff_at && (
                <Button asChild className="bg-amber-500 text-amber-950 hover:bg-amber-400">
                  <Link to="/dashboard/smart-import/$jobId/done" params={{ jobId: activeJob.id }} search={{ commit: "1" }}>
                    Open commit screen
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {!activeJob.provider_signoff_at && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-50/40 p-3 text-xs dark:bg-amber-950/30">
              <Lock className="mt-0.5 h-4 w-4 text-amber-700" />
              <div className="text-amber-900 dark:text-amber-100">
                Commit is locked. The receiving company's admin must open the review
                screen at the link above and record their sign-off. HIVE staff cannot
                self-commit a customer's data.
              </div>
            </div>
          )}
        </Card>
      )}

      {/* All jobs for this company */}
      {targetOrgId && (jobsQ.data?.length ?? 0) > 0 && (
        <Card className="border-border/60 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Receipt className="h-4 w-4 text-[#d97a1c]" /> Migration history
          </div>
          <div className="space-y-2 text-xs">
            {(jobsQ.data ?? []).map((j) => (
              <div key={j.id} className="flex flex-col gap-1 rounded-md border border-border/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">{j.status.replace(/_/g, " ")}</Badge>
                  <Badge variant="outline">{j.engagement_status}</Badge>
                  <span className="text-muted-foreground">
                    {new Date(j.created_at).toLocaleDateString()}
                    {j.committed_at && ` · committed ${new Date(j.committed_at).toLocaleDateString()}`}
                  </span>
                  {j.quote_amount_cents != null && (
                    <span className="text-muted-foreground">· ${(j.quote_amount_cents / 100).toLocaleString()}</span>
                  )}
                </div>
                <Link
                  to="/dashboard/smart-import/$jobId/review"
                  params={{ jobId: j.id }}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Access log */}
      {activeJob && (accessLogQ.data?.length ?? 0) > 0 && (
        <Card className="border-border/60 p-5">
          <div className="mb-2 text-sm font-semibold">HIVE access log (minimum necessary)</div>
          <ul className="max-h-64 space-y-1 overflow-auto text-[11px]">
            {(accessLogQ.data ?? []).map((r: { id: string; actor_name: string; action: string; created_at: string; details: unknown }) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1">
                <span className="truncate">
                  <strong>{r.actor_name}</strong> · {r.action}
                </span>
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
