import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Circle, Lock, PlayCircle, FileText, Clock, RotateCcw, AlertCircle } from "lucide-react";
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
  course: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    duration_minutes: number | null;
    cover_url: string | null;
  } | null;
};

type ProgramAssignment = {
  id: string;
  status: string;
  progress: number;
  completed_at: string | null;
  expires_at: string | null;
};

function ProgramPlayer() {
  const { programId } = Route.useParams();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { role, can, isLoading: permissionsLoading } = usePermissions();
  const qc = useQueryClient();
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);

  const isPrivilegedViewer = role === "admin" || role === "manager" || role === "super_admin" || can("manage_programs");

  useEffect(() => {
    console.info("[ProgramPlayer] route", {
      programId,
      userId: user?.id ?? null,
      role: role ?? null,
      organizationId: org?.organization_id ?? null,
    });
  }, [programId, user?.id, role, org?.organization_id]);

  const {
    data: program,
    isLoading: programLoading,
    error: programError,
  } = useQuery({
    enabled: !!programId,
    queryKey: ["training-program", programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_programs")
        .select("id, name, description, category, annual_renewal, validity_months, estimated_minutes, cover_url")
        .eq("id", programId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const {
    data: programCourses,
    isLoading: coursesLoading,
    error: coursesError,
  } = useQuery<ProgramCourseRow[]>({
    enabled: !!programId,
    queryKey: ["program-courses", programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_courses")
        .select("id, order_index, required, unlock_after, course_id, course:course_id(id, title, description, category, duration_minutes, cover_url)")
        .eq("program_id", programId)
        .order("order_index");
      if (error) throw error;
      return (data as unknown as ProgramCourseRow[]) ?? [];
    },
  });

  const {
    data: assignment,
    isLoading: assignmentLoading,
    error: assignmentError,
  } = useQuery<ProgramAssignment | null>({
    enabled: !!user && !!programId,
    queryKey: ["program-assignment", programId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_assignments")
        .select("id, status, progress, completed_at, expires_at")
        .eq("program_id", programId)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ensureAssignment = useMutation({
    mutationFn: async () => {
      if (!user || !org || !programId) throw new Error("Missing user or organization context for assignment creation.");

      const { data: existing, error: existingError } = await supabase
        .from("program_assignments")
        .select("id")
        .eq("program_id", programId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing?.id) return existing;

      const { data, error } = await supabase
        .from("program_assignments")
        .insert({
          program_id: programId,
          user_id: user.id,
          organization_id: org.organization_id,
          assigned_by: user.id,
          status: "in_progress",
        })
        .select("id")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      console.info("[ProgramPlayer] auto-created program assignment", { programId, userId: user?.id ?? null });
      qc.invalidateQueries({ queryKey: ["program-assignment", programId, user?.id] });
      qc.invalidateQueries({ queryKey: ["my-program-assignments"] });
    },
    onError: (error: Error) => {
      console.error("[ProgramPlayer] failed to auto-create assignment", error);
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (!program || !user || !org || isPrivilegedViewer || assignment || ensureAssignment.isPending) return;
    ensureAssignment.mutate();
  }, [program, user, org, isPrivilegedViewer, assignment, ensureAssignment]);

  const {
    data: courseProgress,
    error: courseProgressError,
  } = useQuery({
    enabled: !!user && !!programCourses?.length,
    queryKey: ["program-course-progress", programId, user?.id, programCourses?.length],
    queryFn: async () => {
      const ids = (programCourses ?? []).map((pc) => pc.course_id);
      if (!ids.length) return new Map<string, { progress: number; status: string }>();
      const { data, error } = await supabase
        .from("course_assignments")
        .select("course_id, progress, status")
        .eq("user_id", user!.id)
        .in("course_id", ids);
      if (error) throw error;
      const map = new Map<string, { progress: number; status: string }>();
      (data ?? []).forEach((row) => {
        map.set(row.course_id, { progress: row.progress, status: row.status });
      });
      return map;
    },
  });

  useEffect(() => {
    console.info("[ProgramPlayer] fetched program content", {
      programId,
      courses: programCourses?.length ?? 0,
      assignmentStatus: assignment?.status ?? (isPrivilegedViewer ? "preview" : "unassigned"),
    });
  }, [programId, programCourses?.length, assignment?.status, isPrivilegedViewer]);

  const ordered = programCourses ?? [];
  const completedSet = useMemo(() => {
    const set = new Set<string>();
    courseProgress?.forEach((value, key) => {
      if (value.status === "completed") set.add(key);
    });
    return set;
  }, [courseProgress]);

  function isLocked(pc: ProgramCourseRow, index: number): boolean {
    if (isPrivilegedViewer) return false;
    if (pc.unlock_after) {
      const prereq = ordered.find((row) => row.id === pc.unlock_after);
      if (prereq && !completedSet.has(prereq.course_id)) return true;
    }
    for (let i = 0; i < index; i += 1) {
      const previous = ordered[i];
      if (previous.required && !completedSet.has(previous.course_id)) return true;
    }
    return false;
  }

  const totalRequired = ordered.filter((course) => course.required).length;
  const doneRequired = ordered.filter((course) => course.required && completedSet.has(course.course_id)).length;
  const pct = totalRequired > 0 ? Math.round((doneRequired / totalRequired) * 100) : 0;

  const syncAssignment = useMutation({
    mutationFn: async () => {
      if (!assignment || !program || !user || !org) return;
      const newStatus = pct >= 100 ? "completed" : pct > 0 ? "in_progress" : "not_started";
      const completedAt = pct >= 100 ? new Date().toISOString() : null;
      const expiresAt = pct >= 100 && program.validity_months
        ? new Date(Date.now() + program.validity_months * 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { error } = await supabase
        .from("program_assignments")
        .update({ progress: pct, status: newStatus, completed_at: completedAt, expires_at: expiresAt })
        .eq("id", assignment.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["program-assignment", programId, user?.id] });
      qc.invalidateQueries({ queryKey: ["my-program-assignments"] });
    },
    onError: (error: Error) => {
      console.error("[ProgramPlayer] failed syncing assignment", error);
    },
  });

  useEffect(() => {
    if (assignment && assignment.progress !== pct && !isPrivilegedViewer) {
      syncAssignment.mutate();
    }
  }, [pct, assignment, isPrivilegedViewer, syncAssignment]);

  useEffect(() => {
    if (activeCourseId || !ordered.length) return;
    const next = ordered.find((course, index) => !isLocked(course, index) && !completedSet.has(course.course_id));
    setActiveCourseId(next?.course_id ?? ordered[0].course_id);
  }, [activeCourseId, ordered, completedSet, isPrivilegedViewer]);

  const ackMut = useMutation({
    mutationFn: async (courseId: string) => {
      if (!assignment || !user) throw new Error("Program assignment is required before acknowledging a module.");
      const { error } = await supabase.from("program_acknowledgements").upsert(
        { program_assignment_id: assignment.id, course_id: courseId, user_id: user.id },
        { onConflict: "program_assignment_id,course_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => toast.success("Acknowledged"),
    onError: (error: Error) => toast.error(error.message),
  });

  if (programLoading || coursesLoading || assignmentLoading || permissionsLoading) {
    return <p className="text-sm text-muted-foreground">Loading training player…</p>;
  }

  if (programError || coursesError || assignmentError || courseProgressError) {
    const message = programError?.message ?? coursesError?.message ?? assignmentError?.message ?? courseProgressError?.message ?? "Unknown program loading error.";
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <div>
            <p className="font-medium">The training player could not be loaded.</p>
            <p className="mt-1 text-destructive/80">{message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Program not found or you don't have access.
      </div>
    );
  }

  if (!isPrivilegedViewer && !assignment && !ensureAssignment.isPending) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        We couldn't create or find a program assignment for your account.
      </div>
    );
  }

  const activeCourse = ordered.find((course) => course.course_id === activeCourseId)?.course ?? null;
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
            {isPrivilegedViewer && <Badge variant="outline">Preview mode</Badge>}
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
            {ordered.map((programCourse, index) => {
              const course = programCourse.course;
              if (!course) return null;
              const status = courseProgress?.get(programCourse.course_id);
              const done = status?.status === "completed";
              const locked = isLocked(programCourse, index);
              const active = activeCourseId === programCourse.course_id;
              return (
                <li key={programCourse.id}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setActiveCourseId(programCourse.course_id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                      active ? "bg-accent/40" : "hover:bg-secondary/60"
                    } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <span className="mt-0.5">
                      {locked ? <Lock className="h-4 w-4 text-muted-foreground" />
                        : done ? <CheckCircle2 className="h-4 w-4 text-success" />
                        : <Circle className="h-4 w-4 text-muted-foreground" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">Module {index + 1}{programCourse.required ? " · Required" : " · Optional"}</span>
                      <span className="block truncate text-sm font-medium">{course.title}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {status?.progress ?? 0}% · {course.duration_minutes ?? 0} min
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {ordered.length === 0 && (
              <li className="p-6 text-sm text-muted-foreground">No modules are linked to this program yet.</li>
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
                <Button variant="outline" disabled={!assignment || ackMut.isPending || isPrivilegedViewer} onClick={() => ackMut.mutate(activeCourse.id)}>
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
