import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Lock, PlayCircle, Award } from "lucide-react";

export const Route = createFileRoute("/dashboard/courses/")({ component: ComplianceRoadmap });

type Module = {
  id: string;
  title: string;
  description: string | null;
  sequence_order: number;
  mindsmith_url: string | null;
};

function ComplianceRoadmap() {
  const { user } = useAuth();

  const { data: modules, isLoading } = useQuery({
    queryKey: ["training-modules"],
    queryFn: async (): Promise<Module[]> => {
      const { data, error } = await supabase
        .from("training_modules")
        .select("id, title, description, sequence_order, mindsmith_url")
        .order("sequence_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Module[];
    },
  });

  const { data: completedIds } = useQuery({
    enabled: !!user,
    queryKey: ["my-training-progress", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_training_progress")
        .select("module_id, is_completed")
        .eq("user_id", user!.id);
      return new Set((data ?? []).filter((r) => r.is_completed).map((r) => r.module_id));
    },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <p className="text-xs font-medium text-accent">Utah DSPD Provider Compliance</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">Onboarding Roadmap</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete each module in order. The final certification quiz unlocks after Modules 1–5.
        </p>
      </div>

      {isLoading || !modules ? (
        <p className="text-sm text-muted-foreground">Loading roadmap…</p>
      ) : (
        <ol className="relative space-y-4 before:absolute before:left-[27px] before:top-2 before:bottom-2 before:w-px before:bg-border">
          {modules.map((m, idx) => {
            const prev = modules[idx - 1];
            const isFinal = m.sequence_order === 6;
            const allPrevDone = isFinal
              ? modules.slice(0, 5).every((p) => completedIds?.has(p.id))
              : !prev || !!completedIds?.has(prev.id);
            const isCompleted = !!completedIds?.has(m.id);
            const isLocked = !allPrevDone && !isCompleted;

            return (
              <li key={m.id} className="relative pl-16">
                <div
                  className={`absolute left-0 top-4 flex h-14 w-14 items-center justify-center rounded-full border-2 text-base font-semibold ${
                    isCompleted
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isLocked
                        ? "border-border bg-muted text-muted-foreground"
                        : "border-primary bg-card text-primary"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : isLocked ? (
                    <Lock className="h-5 w-5" />
                  ) : isFinal ? (
                    <Award className="h-6 w-6" />
                  ) : (
                    m.sequence_order
                  )}
                </div>

                <div
                  className={`rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)] transition ${
                    isLocked ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]"
                  } border-border`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold tracking-tight">{m.title}</h3>
                        {isCompleted && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> Completed
                          </span>
                        )}
                        {isLocked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            <Lock className="h-3 w-3" /> Locked
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{m.description}</p>
                    </div>
                    <div className="shrink-0">
                      {isLocked ? (
                        <Button size="sm" variant="outline" disabled>
                          <Lock className="mr-1 h-3.5 w-3.5" /> Locked
                        </Button>
                      ) : (
                        <Button
                          asChild
                          size="sm"
                          className={
                            isCompleted
                              ? ""
                              : "bg-[image:var(--gradient-brand)] text-primary-foreground"
                          }
                          variant={isCompleted ? "outline" : "default"}
                        >
                          <Link to="/dashboard/training/$id" params={{ id: m.id }}>
                            <PlayCircle className="mr-1 h-3.5 w-3.5" />
                            {isCompleted ? "Review" : isFinal ? "Start Quiz" : "Start Module"}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
