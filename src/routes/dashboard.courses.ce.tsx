// Continuing Education (CE) — staff route under the existing Training tab.
// Phase 1: rolling X/12 hour tracker, current month Nectar review, ledger.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMyCeStatus, ensureCurrentCeModule, setCeDemoMode } from "@/lib/ce.functions";
import { CePlayer } from "@/components/ce/ce-player";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { GraduationCap, Sparkles, ChevronLeft, Clock, Shield, CheckCircle2, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/courses/ce")({ component: ContinuingEducation });

function ContinuingEducation() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getMyCeStatus);
  const ensureFn = useServerFn(ensureCurrentCeModule);
  const setDemo = useServerFn(setCeDemoMode);

  const { data: status, isLoading } = useQuery({
    queryKey: ["ce-status"],
    queryFn: () => fetchStatus(),
  });

  const [playerOpen, setPlayerOpen] = useState(false);

  const ensureMut = useMutation({
    mutationFn: () => ensureFn(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ce-status"] }); setPlayerOpen(true); },
    onError: (e: Error) => toast.error(e.message),
  });
  const demoMut = useMutation({
    mutationFn: (enabled: boolean) => setDemo({ data: { enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ce-status"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !status) {
    return (
      <div className="space-y-4 pb-2">
        <BackLink />
        <Card className="p-6 text-sm text-muted-foreground">Loading your CE record…</Card>
      </div>
    );
  }

  if (!status.hireDate) {
    return (
      <div className="space-y-4 pb-2">
        <BackLink />
        <StaffPageHeader eyebrow="Year 2+" eyebrowIcon={GraduationCap} title="Continuing Education" subtitle="Annual 12-hour refresher for experienced staff." />
        <Card className="p-5 text-sm">
          Your hire date isn't on file yet. Ask HR to update your profile so we can start your CE year.
        </Card>
      </div>
    );
  }

  if (!status.ceApplies) {
    return (
      <div className="space-y-4 pb-2">
        <BackLink />
        <StaffPageHeader eyebrow="Year 2+" eyebrowIcon={GraduationCap} title="Continuing Education" subtitle="Annual 12-hour refresher for experienced staff." />
        <Card className="p-5 text-sm">
          Continuing Education begins after your first year of employment. Focus on the 30-Day Core Training and your person-specific modules for now.
        </Card>
      </div>
    );
  }

  const mod = status.currentModule;
  const progressPct = Math.min(100, (status.hoursThisYear / status.goalHours) * 100);
  const monthActiveMin = mod ? Math.floor(mod.active_seconds / 60) : 0;
  const monthComplete = mod?.status === "completed";

  return (
    <>
      <div className="space-y-4 pb-2">
        <BackLink />
        <StaffPageHeader
          eyebrow="Year 2+ · Utah DSPD"
          eyebrowIcon={GraduationCap}
          title="Continuing Education"
          subtitle="One ~1-hour Nectar-built review each month — 12 hours per CE year."
        />

        {/* Yearly tracker */}
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CE year</div>
              <div className="text-sm">
                {status.ceYearStart} → {status.ceYearEnd}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-semibold tracking-tight">
                {status.hoursThisYear.toFixed(1)} <span className="text-base font-normal text-muted-foreground">/ {status.goalHours} hrs</span>
              </div>
              <div className="text-xs text-muted-foreground">{status.daysLeftInYear} days left in this CE year</div>
            </div>
          </div>
          <Progress value={progressPct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            No carryover — the counter resets to 0 on your next hire anniversary.
          </p>
        </Card>

        {/* Admin demo-mode toggle */}
        {status.isOrgAdmin && (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-dashed p-4 text-sm">
            <div className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-semibold">Demo mode for CE generation</div>
                <p className="text-xs text-muted-foreground">
                  Until HIVE's HIPAA-compliant AI path (AWS Bedrock under BAA) is live, Nectar will only generate CE modules for orgs explicitly opted in to demo mode. Enable on test/seeded orgs only.
                </p>
              </div>
            </div>
            <Switch
              checked={status.demoModeEnabled}
              onCheckedChange={(v) => demoMut.mutate(Boolean(v))}
              disabled={demoMut.isPending}
              aria-label="Toggle CE demo mode"
            />
          </Card>
        )}

        {/* Current month review */}
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-accent">
                <Sparkles className="mr-1 inline h-3 w-3" /> This month's review
              </div>
              <h2 className="text-base font-semibold tracking-tight">Monthly Review · {status.currentPeriod}</h2>
            </div>
            {monthComplete ? (
              <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>
            ) : mod?.status === "generating" ? (
              <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Generating…</Badge>
            ) : mod ? (
              <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> {monthActiveMin}/{status.minActiveMinutes} min</Badge>
            ) : null}
          </div>

          {mod?.source_summary && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Nectar pulled:</span> {mod.source_summary}
            </p>
          )}

          {!mod && (
            <>
              <p className="text-sm text-muted-foreground">
                Nectar will build a single ~1-hour module from your real prior-month activity, plus deeper refreshers if needed to fill the hour.
              </p>
              {!status.demoModeEnabled ? (
                <Card className="border-amber-300/40 bg-amber-50/40 p-3 text-xs dark:bg-amber-900/10">
                  <Lock className="mr-1 inline h-3 w-3" />
                  CE generation is paused for this organization pending HIPAA-compliant AI enablement. {status.isOrgAdmin ? "Toggle demo mode above to generate against seeded test data." : "Ask your admin to enable demo mode if you're working with test data."}
                </Card>
              ) : (
                <Button onClick={() => ensureMut.mutate()} disabled={ensureMut.isPending} className="w-full sm:w-auto">
                  {ensureMut.isPending ? "Asking Nectar…" : "Start this month's review"}
                </Button>
              )}
            </>
          )}

          {mod && mod.status !== "completed" && (mod.steps as unknown[]).length > 0 && (
            <Button onClick={() => setPlayerOpen(true)} className="w-full sm:w-auto">
              {mod.active_seconds > 0 ? "Continue review" : "Start review"}
            </Button>
          )}

          {mod?.status === "failed" && status.demoModeEnabled && (
            <Button variant="outline" onClick={() => ensureMut.mutate()} disabled={ensureMut.isPending} className="w-full sm:w-auto">
              {ensureMut.isPending ? "Retrying…" : "Retry generation"}
            </Button>
          )}
        </Card>

        {/* Ledger */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">CE record — this year</h2>
            <span className="text-xs text-muted-foreground">{status.ledger.length} entr{status.ledger.length === 1 ? "y" : "ies"}</span>
          </div>
          {status.ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed reviews yet this CE year.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Title</th>
                    <th className="pb-2 text-right">Hours</th>
                    <th className="pb-2 text-right">Active min</th>
                    <th className="pb-2">Signed</th>
                  </tr>
                </thead>
                <tbody>
                  {status.ledger.map((l) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="py-2">{new Date(l.completed_at).toLocaleDateString()}</td>
                      <td className="py-2">{l.title}</td>
                      <td className="py-2 text-right font-medium">{Number(l.hours).toFixed(1)}</td>
                      <td className="py-2 text-right">{l.active_minutes}</td>
                      <td className="py-2 text-xs text-muted-foreground">{l.signature_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {playerOpen && mod && mod.status !== "completed" && (mod.steps as unknown[]).length > 0 && (
        <CePlayer
          module={mod}
          minActiveMinutes={status.minActiveMinutes}
          onClose={() => setPlayerOpen(false)}
          onCompleted={() => setPlayerOpen(false)}
        />
      )}
    </>
  );
}

function BackLink() {
  return (
    <Link to="/dashboard/courses" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-3 w-3" /> Back to Training
    </Link>
  );
}
