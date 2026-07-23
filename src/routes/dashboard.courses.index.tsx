import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { GraduationCap, ShieldCheck, Users, ChevronRight, Sparkles, BookOpen, AlertTriangle, Calendar, FileSignature } from "lucide-react";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { getMyOtherAssignmentsSummary } from "@/lib/other-assignments.functions";
import { getMyCeStatus } from "@/lib/ce.functions";
import { listMyPendingPolicies } from "@/lib/policy-signatures.functions";

export const Route = createFileRoute("/dashboard/courses/")({ component: MyTrainings });

function MyTrainings() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();

  const fetchPendingPolicies = useServerFn(listMyPendingPolicies);
  const { data: pendingPolicies } = useQuery({
    enabled: !!user && !!org?.organization_id,
    queryKey: ["my-pending-policies", org?.organization_id, user?.id],
    queryFn: () => fetchPendingPolicies({ data: { organizationId: org!.organization_id } }),
  });
  const pending = pendingPolicies?.pending ?? [];

  const { data: coreCount } = useQuery({
    queryKey: ["training-topics-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("training_topics")
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: coreDone } = useQuery({
    enabled: !!user,
    queryKey: ["my-core-progress-count", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_topic_progress")
        .select("ref_id, status")
        .eq("user_id", user!.id)
        .eq("topic_kind", "core")
        .eq("status", "completed");
      return data?.length ?? 0;
    },
  });

  const { data: personModules } = useQuery({
    enabled: !!user,
    queryKey: ["my-person-modules", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_person_modules")
        .select("id")
        .eq("user_id", user!.id);
      return data ?? [];
    },
  });

  const { data: personDone } = useQuery({
    enabled: !!user,
    queryKey: ["my-person-progress-count", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_topic_progress")
        .select("ref_id, status")
        .eq("user_id", user!.id)
        .eq("topic_kind", "person")
        .eq("status", "completed");
      return data?.length ?? 0;
    },
  });

  const personTotal = personModules?.length ?? 0;

  const fetchOther = useServerFn(getMyOtherAssignmentsSummary);
  const { data: otherSummary } = useQuery({
    enabled: !!user,
    queryKey: ["my-other-assignments-summary"],
    queryFn: () => fetchOther(),
  });
  const otherOpen = otherSummary?.open_count ?? 0;
  const otherSafety = otherSummary?.safety_critical_open_count ?? 0;
  const otherTotal = otherSummary?.total ?? 0;
  const otherDone = otherSummary?.completed ?? 0;

  const fetchCe = useServerFn(getMyCeStatus);
  const { data: ce } = useQuery({
    enabled: !!user,
    queryKey: ["ce-status"],
    queryFn: () => fetchCe(),
  });
  const ceApplies = !!ce?.ceApplies;

  return (
    <div className="space-y-4 pb-2">
      <StaffPageHeader
        eyebrow="Utah DSPD · Provider Compliance"
        eyebrowIcon={GraduationCap}
        title="My Trainings"
        subtitle="Your required trainings and per-person modules — start any topic in any order."
      />

      <Link
        to="/dashboard/ask-nectar"
        className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3 transition hover:bg-accent/10"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Ask Nectar about training</span>
          <span className="block text-xs text-muted-foreground">Ask any question — Nectar will open the training that covers it.</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      {pending.length > 0 && (
        <div className="rounded-2xl border border-amber-400/50 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <FileSignature className="h-4 w-4" /> Policy acknowledgment needed
          </div>
          <ul className="space-y-1.5">
            {pending.map((p) => (
              <li key={p.id}>
                <Link
                  to="/dashboard/courses/policy/$documentId"
                  params={{ documentId: p.id }}
                  className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-background/60 px-3 py-2 text-sm transition hover:bg-amber-500/10"
                >
                  <span className="min-w-0 truncate font-medium">{p.title}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                    Sign now <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/dashboard/courses/core"
          className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]"
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[image:var(--gradient-brand)] text-primary-foreground shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold tracking-tight">30 Day Core Training</h3>
              <p className="mt-1 text-sm text-muted-foreground">Utah DSPD–required staff training.</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">
              <span className="text-foreground">{coreDone ?? 0}</span> of {coreCount ?? "—"} complete
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold uppercase tracking-wider">22 topics</span>
          </div>
        </Link>

        <Link
          to="/dashboard/courses/person"
          className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]"
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
              <Users className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold tracking-tight">Person-Specific Training</h3>
              <p className="mt-1 text-sm text-muted-foreground">Training for each person you support.</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">
              <span className="text-foreground">{personDone ?? 0}</span> of {personTotal} complete
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold uppercase tracking-wider">
              {personTotal === 1 ? "1 person" : `${personTotal} people`}
            </span>
          </div>
        </Link>

        <Link
          to="/dashboard/courses/other"
          className={`group relative overflow-hidden rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)] ${
            otherSafety > 0 ? "border-destructive/40" : "border-border"
          }`}
        >
          <div className="flex items-start gap-3">
            <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              otherSafety > 0 ? "bg-destructive/15 text-destructive" : "bg-sky-500/15 text-sky-600"
            }`}>
              <BookOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold tracking-tight">Other Trainings</h3>
              <p className="mt-1 text-sm text-muted-foreground">Assigned to you by your admin or NECTAR.</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">
              <span className="text-foreground">{otherDone}</span> of {otherTotal} complete
            </span>
            {otherSafety > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 font-semibold uppercase tracking-wider text-destructive">
                <AlertTriangle className="h-3 w-3" /> {otherSafety} safety-critical
              </span>
            ) : otherOpen > 0 ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold uppercase tracking-wider text-amber-700">
                {otherOpen} open
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 font-semibold uppercase tracking-wider">
                {otherTotal === 0 ? "none assigned" : "all done"}
              </span>
            )}
          </div>
        </Link>

        <Link
          to="/dashboard/courses/ce"
          className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]"
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600">
              <Calendar className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold tracking-tight">Continuing Education</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your annual 12 hours — one ~1-hour review each month, built by Nectar.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            {ceApplies ? (
              <>
                <span className="font-medium">
                  <span className="text-foreground">{(ce?.hoursThisYear ?? 0).toFixed(1)}</span> of {ce?.goalHours ?? 12} hrs this CE year
                </span>
                <span className="rounded-full bg-teal-500/10 px-2 py-0.5 font-semibold uppercase tracking-wider text-teal-700">
                  {ce?.daysLeftInYear ?? 0} days left
                </span>
              </>
            ) : (
              <>
                <span className="font-medium text-muted-foreground">Begins after your first year</span>
                <span className="rounded-full bg-muted px-2 py-0.5 font-semibold uppercase tracking-wider">
                  preview
                </span>
              </>
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}
