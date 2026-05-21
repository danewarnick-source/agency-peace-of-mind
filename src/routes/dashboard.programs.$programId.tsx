import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Circle, Lock, PlayCircle, FileText, Clock, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/programs/$programId")({
  component: ProgramPlayer,
  notFoundComponent: () => (
    <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
      Program not found.
    </div>
  ),
});

type ProgramCourseRow = {
  id: string;
  order_index: number;
  required: boolean;
  unlock_after: string | null;
  course_id: string;
  courses: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    duration_minutes: number | null;
    cover_url: string | null;
  } | null;
};

function ProgramPlayer() {
  const { programId } = Route.useParams();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);

  if (!programId) {
    console.error("[ProgramPlayer] Missing programId in route params");
  }

  const { data: program, isLoading: programLoading } = useQuery({
    enabled: !!programId,
    queryKey: ["training-program", programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_programs")
        .select("id, name, description, category, annual_renewal, validity_months, estimated_minutes, cover_url")
        .eq("id", programId)
        .maybeSingle();
      if (error) {
        console.error("[ProgramPlayer] Failed to load program", programId, error);
        throw error;
      }
      return data;
    },
  });

  const { data: programCourses } = useQuery<ProgramCourseRow[]>({
    queryKey: ["program-courses", programId],
    queryFn: async () => {
      const { data } = await supabase
        .from("program_courses")
        .select("id, order_index, required, unlock_after, course_id, courses(id, title, description, category, duration_minutes, cover_url)")
        .eq("program_id", programId)
        .order("order_index");
      return (data as unknown as ProgramCourseRow[]) ?? [];
    },
  });

  const { data: assignment } = useQuery({
    enabled: !!user,
    queryKey: ["program-assignment", programId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("program_assignments")
        .select("id, status, progress, completed_at, expires_at")
        .eq("program_id", programId)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: courseProgress } = useQuery({
    enabled: !!user && !!programCourses?.length,
    queryKey: ["program-course-progress", programId, user?.id, programCourses?.length],
    queryFn: async () => {
      const ids = (programCourses ?? []).map((pc) => pc.course_id);
      if (!ids.length) return new Map<string, { progress: number; status: string }>();
      const { data } = await supabase
        .from("course_assignments")
        .select("course_id, progress, status")
        .eq("user_id", user!.id)
        .in("course_id", ids);
      const map = new Map<string, { progress: number; status: string }>();
      (data ?? []).forEach((r) => map.set(r.course_id, { progress: r.progress, status: r.status }));
      return map;
    },
  });

  const ordered = programCourses ?? [];
  const completedSet = useMemo(() => {
    const s = new Set<string>();
    courseProgress?.forEach((v, k) => { if (v.status === "completed") s.add(k); });
    return s;
  }, [courseProgress]);

  // Determine locked state: a course is locked if unlock_after points to a course not completed,
  // OR if it's not the first uncompleted required course (sequential gating fallback).
  function isLocked(pc: ProgramCourseRow, index: number): boolean {
    if (pc.unlock_after) {
      const prereq = ordered.find((x) => x.id === pc.unlock_after);
      if (prereq && !completedSet.has(prereq.course_id)) return true;
    }
    // sequential gating for required modules: previous required must be done
    for (let i = 0; i < index; i++) {
      const prev = ordered[i];
      if (prev.required && !completedSet.has(prev.course_id)) return true;
    }
    return false;
  }

  const totalRequired = ordered.filter((p) => p.required).length;
  const doneRequired = ordered.filter((p) => p.required && completedSet.has(p.course_id)).length;
  const pct = totalRequired > 0 ? Math.round((doneRequired / totalRequired) * 100) : 0;

  // Recompute program assignment progress + issue cert when complete
  const syncAssignment = useMutation({
    mutationFn: async () => {
      if (!assignment || !program || !user || !org) return;
      const newStatus = pct >= 100 ? "completed" : pct > 0 ? "in_progress" : "not_started";
      const completed_at = pct >= 100 ? new Date().toISOString() : null;
      const expires_at = pct >= 100 && program.validity_months
        ? new Date(Date.now() + program.validity_months * 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;
      await supabase
        .from("program_assignments")
        .update({ progress: pct, status: newStatus, completed_at, expires_at })
        .eq("id", assignment.id);
      if (pct >= 100) {
        // Issue a program certification
        await supabase.from("certifications").insert({
          user_id: user.id,
          course_id: ordered[0]?.course_id, // reference first module course
          organization_id: org.organization_id,
          recipient_name: user.user_metadata?.full_name ?? user.email,
          course_title: program.name,
          expires_at: expires_at,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["program-assignment"] });
      qc.invalidateQueries({ queryKey: ["my-program-assignments"] });
    },
  });

  useEffect(() => {
    if (assignment && assignment.progress !== pct) {
      syncAssignment.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct, assignment?.id]);

  // Auto-select first unlocked uncompleted course
  useEffect(() => {
    if (activeCourseId || !ordered.length) return;
    const next = ordered.find((pc, i) => !isLocked(pc, i) && !completedSet.has(pc.course_id));
    setActiveCourseId(next?.course_id ?? ordered[0].course_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered.length, completedSet.size]);

  const ackMut = useMutation({
    mutationFn: async (courseId: string) => {
      if (!assignment || !user) throw new Error("Not enrolled");
      const { error } = await supabase.from("program_acknowledgements").upsert(
        { program_assignment_id: assignment.id, course_id: courseId, user_id: user.id },
        { onConflict: "program_assignment_id,course_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => toast.success("Acknowledged"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (programLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!program) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Program not found or you don't have access.
      </div>
    );
  }

  const activeCourse = ordered.find((pc) => pc.course_id === activeCourseId)?.courses ?? null;
  const activeStatus = activeCourseId ? courseProgress?.get(activeCourseId) : undefined;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/dashboard/programs"><ArrowLeft className="mr-1 h-4 w-4" /> Programs</Link>
      </Button>

      <header className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-accent">{program.category ?? "Program"}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{program.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{program.description}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {program.annual_renewal && (
              <Badge variant="outline" className="gap-1"><RotateCcw className="h-3 w-3" /> Annual renewal</Badge>
            )}
            {assignment?.expires_at && (
              <span className="text-xs text-muted-foreground">Cert expires {new Date(assignment.expires_at).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-[image:var(--gradient-brand)]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{doneRequired} of {totalRequired} required modules · {pct}%</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> ~{program.estimated_minutes} min</span>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold">Modules</h2>
            <p className="text-xs text-muted-foreground">{ordered.length} total</p>
          </div>
          <ul className="divide-y divide-border">
            {ordered.map((pc, i) => {
              const c = pc.courses;
              if (!c) return null;
              const status = courseProgress?.get(pc.course_id);
              const done = status?.status === "completed";
              const locked = isLocked(pc, i);
              const active = activeCourseId === pc.course_id;
              return (
                <li key={pc.id}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setActiveCourseId(pc.course_id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                      active ? "bg-accent/40" : "hover:bg-secondary/60"
                    } ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <span className="mt-0.5">
                      {locked ? <Lock className="h-4 w-4 text-muted-foreground" />
                        : done ? <CheckCircle2 className="h-4 w-4 text-success" />
                        : <Circle className="h-4 w-4 text-muted-foreground" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">Module {i + 1}{pc.required ? " · Required" : " · Optional"}</span>
                      <span className="block truncate text-sm font-medium">{c.title}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {status?.progress ?? 0}% · {c.duration_minutes ?? 0} min
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {ordered.length === 0 && (
              <li className="p-6 text-sm text-muted-foreground">No modules yet. Admins can add courses to this program.</li>
            )}
          </ul>
        </aside>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          {!activeCourse ? (
            <p className="text-sm text-muted-foreground">Select a module to begin.</p>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-medium text-accent">{activeCourse.category}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">{activeCourse.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{activeCourse.description}</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {activeCourse.duration_minutes ?? 0} min</span>
                <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Lessons & resources inside</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-[image:var(--gradient-brand)]" style={{ width: `${activeStatus?.progress ?? 0}%` }} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-[image:var(--gradient-brand)] text-primary-foreground">
                  <Link to="/dashboard/courses/$courseId" params={{ courseId: activeCourse.id }}>
                    <PlayCircle className="mr-2 h-4 w-4" /> Open module
                  </Link>
                </Button>
                <Button variant="outline" disabled={!assignment || ackMut.isPending} onClick={() => ackMut.mutate(activeCourse.id)}>
                  Acknowledge & sign-off
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
