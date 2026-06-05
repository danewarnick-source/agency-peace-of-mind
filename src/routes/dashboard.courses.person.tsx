import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Users, ArrowLeft, CheckCircle2, PlayCircle, ChevronRight, UserCircle2 } from "lucide-react";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";

export const Route = createFileRoute("/dashboard/courses/person")({ component: PersonSpecificList });

type PersonModule = {
  id: string;
  title: string;
  description: string | null;
  client_id: string | null;
};

function PersonSpecificList() {
  const { user } = useAuth();

  const { data: modules, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["my-person-modules-full", user?.id],
    queryFn: async (): Promise<PersonModule[]> => {
      const { data, error } = await supabase
        .from("training_person_modules")
        .select("id, title, description, client_id")
        .eq("user_id", user!.id)
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PersonModule[];
    },
  });

  const { data: progress } = useQuery({
    enabled: !!user,
    queryKey: ["my-person-progress", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_topic_progress")
        .select("ref_id, status")
        .eq("user_id", user!.id)
        .eq("topic_kind", "person");
      const map = new Map<string, "not_started" | "in_progress" | "completed">();
      (data ?? []).forEach((r) => map.set(r.ref_id as string, r.status as "not_started" | "in_progress" | "completed"));
      return map;
    },
  });

  const total = modules?.length ?? 0;
  const done = (modules ?? []).filter((m) => progress?.get(m.id) === "completed").length;

  return (
    <div className="space-y-4 pb-2">
      <StaffPageHeader
        eyebrow="Per-person modules"
        eyebrowIcon={Users}
        title="Person-Specific Training"
        subtitle="One module per person you support."
      />

      <Link
        to="/dashboard/courses"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> My Trainings
      </Link>

      {total > 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
          <p className="text-sm font-semibold">
            {done} <span className="font-normal text-muted-foreground">of {total} complete</span>
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !modules?.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          <UserCircle2 className="mx-auto h-6 w-6" />
          <p className="mt-2">No person-specific modules have been assigned to you yet.</p>
          <p className="mt-1 text-xs">When you're assigned to support someone, their module will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
          {modules.map((m) => {
            const status = progress?.get(m.id) ?? "not_started";
            const isDone = status === "completed";
            const isProg = status === "in_progress";
            return (
              <li key={m.id}>
                <Link
                  to="/dashboard/courses/person-module/$assignmentId"
                  params={{ assignmentId: m.id }}
                  className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-muted/40"
                >
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      isDone ? "bg-emerald-500 text-white" : isProg ? "bg-amber-500/20 text-amber-700" : "bg-accent/15 text-accent"
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : <UserCircle2 className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">{m.title}</p>
                    {m.description && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{m.description}</p>
                    )}
                  </div>
                  <StatusBadge status={status} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
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
