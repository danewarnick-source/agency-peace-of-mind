import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GraduationCap, ShieldCheck, Users, ChevronRight, Sparkles } from "lucide-react";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";

export const Route = createFileRoute("/dashboard/courses/")({ component: MyTrainings });

function MyTrainings() {
  const { user } = useAuth();

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

      <div className="grid gap-3 md:grid-cols-2">
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
      </div>
    </div>
  );
}
