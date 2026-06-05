import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ShieldCheck, ArrowLeft, PlayCircle, CheckCircle2, Sparkles, ChevronRight } from "lucide-react";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";

export const Route = createFileRoute("/dashboard/courses/core")({ component: CoreTrainingList });

type Topic = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string;
  dspd_letter: string | null;
  sort_order: number;
};

const CATEGORY_ORDER = [
  "Emergencies & health",
  "Behavior & care",
  "Rights & reporting",
  "Foundations & compliance",
];

function CoreTrainingList() {
  const { user } = useAuth();

  const { data: topics, isLoading } = useQuery({
    queryKey: ["training-topics"],
    queryFn: async (): Promise<Topic[]> => {
      const { data, error } = await supabase
        .from("training_topics")
        .select("id, code, title, description, category, dspd_letter, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Topic[];
    },
  });

  const { data: progress } = useQuery({
    enabled: !!user,
    queryKey: ["my-core-progress", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_topic_progress")
        .select("ref_id, status")
        .eq("user_id", user!.id)
        .eq("topic_kind", "core");
      const map = new Map<string, "not_started" | "in_progress" | "completed">();
      (data ?? []).forEach((r) => map.set(r.ref_id as string, r.status as "not_started" | "in_progress" | "completed"));
      return map;
    },
  });

  const grouped = useMemo(() => {
    const out: Record<string, Topic[]> = {};
    (topics ?? []).forEach((t) => {
      (out[t.category] ||= []).push(t);
    });
    return out;
  }, [topics]);

  const total = topics?.length ?? 0;
  const done = (topics ?? []).filter((t) => progress?.get(t.id) === "completed").length;

  return (
    <div className="space-y-4 pb-2">
      <StaffPageHeader
        eyebrow="Utah DSPD · 30 Day Core Training"
        eyebrowIcon={ShieldCheck}
        title="Core Training"
        subtitle="Start any topic in any order — nothing is locked."
      />

      <div className="flex items-center justify-between">
        <Link
          to="/dashboard/courses"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> My Trainings
        </Link>
        <Link
          to="/dashboard/ask-nectar"
          className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/15"
        >
          <Sparkles className="h-3 w-3" /> Ask Nectar
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">
            {done} <span className="font-normal text-muted-foreground">of {total} complete</span>
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            {total ? Math.round((done / total) * 100) : 0}%
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[image:var(--gradient-brand)] transition-all"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {isLoading || !topics ? (
        <p className="text-sm text-muted-foreground">Loading topics…</p>
      ) : (
        CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((category) => (
          <section key={category} className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {category}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
              {grouped[category].map((t) => {
                const status = progress?.get(t.id) ?? "not_started";
                const isDone = status === "completed";
                const isProg = status === "in_progress";
                return (
                  <li key={t.id}>
                    <Link
                      to="/dashboard/courses/topic/$topicId"
                      params={{ topicId: t.id }}
                      className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-muted/40"
                    >
                      <span
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold uppercase ${
                          isDone
                            ? "bg-emerald-500 text-white"
                            : isProg
                              ? "bg-amber-500/20 text-amber-700"
                              : "bg-accent/15 text-accent"
                        }`}
                      >
                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : (t.dspd_letter ?? "•")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight">{t.title}</p>
                        {t.description && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{t.description}</p>
                        )}
                      </div>
                      <StatusBadge status={status} />
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "not_started" | "in_progress" | "completed" }) {
  if (status === "completed")
    return (
      <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Completed
      </span>
    );
  if (status === "in_progress")
    return (
      <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
        <PlayCircle className="h-3 w-3" /> In progress
      </span>
    );
  return (
    <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      Not started
    </span>
  );
}
