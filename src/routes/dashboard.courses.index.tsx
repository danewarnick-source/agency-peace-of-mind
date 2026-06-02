import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  CheckCircle2,
  Lock,
  PlayCircle,
  Award,
  GraduationCap,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";

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
  const [expanded, setExpanded] = useState<string | null>(null);

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

  const total = modules?.length ?? 0;
  const done = modules?.filter((m) => completedIds?.has(m.id)).length ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-3 pb-2">
      <StaffPageHeader
        eyebrow="Utah DSPD · Provider Compliance"
        eyebrowIcon={GraduationCap}
        title="Onboarding Roadmap"
        subtitle="Complete each module in order. The final certification quiz unlocks after Modules 1–5."
      />

      {/* Progress summary */}
      <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">
            {done} <span className="text-muted-foreground font-normal">of {total} complete</span>
          </p>
          <p className="text-xs font-medium text-muted-foreground">{pct}%</p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[image:var(--gradient-brand)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Module list */}
      {isLoading || !modules ? (
        <p className="text-sm text-muted-foreground">Loading roadmap…</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
          {modules.map((m, idx) => {
            const prev = modules[idx - 1];
            const isFinal = m.sequence_order === 6;
            const allPrevDone = isFinal
              ? modules.slice(0, 5).every((p) => completedIds?.has(p.id))
              : !prev || !!completedIds?.has(prev.id);
            const isCompleted = !!completedIds?.has(m.id);
            const isLocked = !allPrevDone && !isCompleted;
            const isCurrent = !isCompleted && !isLocked;
            const isOpen = expanded === m.id;

            return (
              <li key={m.id}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 transition ${
                    isCurrent ? "bg-accent/5" : ""
                  } ${isLocked ? "opacity-60" : ""}`}
                >
                  {/* Status indicator */}
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
                      isCompleted
                        ? "bg-emerald-500 text-white"
                        : isLocked
                          ? "bg-muted text-muted-foreground"
                          : isFinal
                            ? "bg-amber-500/15 text-amber-700"
                            : "bg-accent/15 text-accent"
                    }`}
                    aria-hidden
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : isLocked ? (
                      <Lock className="h-4 w-4" />
                    ) : isFinal ? (
                      <Award className="h-4 w-4" />
                    ) : (
                      m.sequence_order
                    )}
                  </span>

                  {/* Title + descriptor */}
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : m.id)}
                    className="min-w-0 flex-1 text-left"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold leading-tight">
                        <span className="text-muted-foreground">{m.sequence_order}.</span>{" "}
                        {m.title}
                      </p>
                      {isCurrent && (
                        <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider text-accent">
                          Now
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <p
                        className={`mt-0.5 text-[11px] text-muted-foreground ${
                          isOpen ? "" : "truncate"
                        }`}
                      >
                        {m.description}
                      </p>
                    )}
                  </button>

                  {/* Action */}
                  <div className="shrink-0">
                    {isLocked ? (
                      <span className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-muted px-2.5 text-[11px] font-medium text-muted-foreground">
                        <Lock className="h-3 w-3" /> Locked
                      </span>
                    ) : (
                      <Link
                        to="/dashboard/training/$id"
                        params={{ id: m.id }}
                        className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition ${
                          isCompleted
                            ? "border border-border bg-background text-foreground hover:bg-muted"
                            : "bg-[image:var(--gradient-brand)] text-primary-foreground shadow-sm hover:opacity-95"
                        }`}
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        {isCompleted ? "Review" : isFinal ? "Quiz" : "Start"}
                      </Link>
                    )}
                  </div>

                  {/* Expand chevron */}
                  {m.description && (
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : m.id)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
