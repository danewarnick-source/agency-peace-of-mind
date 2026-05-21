import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowLeft, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/courses/$courseId")({ component: CourseDetail });

type LessonRow = { id: string; title: string; content: string | null; order_index: number; duration_minutes: number | null };
type ModuleRow = { id: string; title: string; order_index: number; lessons: LessonRow[] };

function CourseDetail() {
  const { courseId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: course } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").eq("id", courseId).maybeSingle();
      return data;
    },
  });

  const { data: modules } = useQuery<ModuleRow[]>({
    queryKey: ["course-structure", courseId],
    queryFn: async () => {
      const { data: mods } = await supabase
        .from("course_modules")
        .select("id, title, order_index")
        .eq("course_id", courseId)
        .order("order_index");
      const ids = (mods ?? []).map((m) => m.id);
      if (ids.length === 0) return [];
      const { data: lessons } = await supabase
        .from("lessons")
        .select("id, module_id, title, content, order_index, duration_minutes")
        .in("module_id", ids)
        .order("order_index");
      return (mods ?? []).map((m) => ({
        ...m,
        lessons: (lessons ?? []).filter((l) => l.module_id === m.id) as LessonRow[],
      }));
    },
  });

  const { data: assignment } = useQuery({
    enabled: !!user,
    queryKey: ["assignment", courseId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_assignments")
        .select("id, progress, status")
        .eq("course_id", courseId)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: doneLessons } = useQuery<Set<string>>({
    enabled: !!user,
    queryKey: ["lesson-progress", courseId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_progress")
        .select("lesson_id, completed")
        .eq("user_id", user!.id);
      return new Set((data ?? []).filter((p) => p.completed).map((p) => p.lesson_id));
    },
  });

  const completeLesson = useMutation({
    mutationFn: async (lessonId: string) => {
      const { error } = await supabase.from("lesson_progress").upsert(
        {
          lesson_id: lessonId,
          user_id: user!.id,
          assignment_id: assignment?.id ?? null,
          completed: true,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "lesson_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lesson completed");
      qc.invalidateQueries({ queryKey: ["lesson-progress"] });
      qc.invalidateQueries({ queryKey: ["assignment"] });
      qc.invalidateQueries({ queryKey: ["my-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!course) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const allLessons = (modules ?? []).flatMap((m) => m.lessons);
  const total = allLessons.length;
  const done = allLessons.filter((l) => doneLessons?.has(l.id)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/dashboard/courses"><ArrowLeft className="mr-1 h-4 w-4" /> Library</Link>
      </Button>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <p className="text-xs font-medium text-accent">{course.category}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{course.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-[image:var(--gradient-brand)]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {done} / {total} lessons complete · {pct}%
          </p>
        </div>
      </div>

      {modules?.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">No modules yet for this course.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {modules?.map((mod, mi) => {
            const modDone = mod.lessons.filter((l) => doneLessons?.has(l.id)).length;
            return (
              <section key={mod.id} className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
                <header className="flex items-center justify-between border-b border-border px-6 py-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Module {mi + 1}</p>
                    <h2 className="text-base font-semibold tracking-tight">{mod.title}</h2>
                  </div>
                  <span className="text-xs text-muted-foreground">{modDone} / {mod.lessons.length}</span>
                </header>
                {mod.lessons.length === 0 ? (
                  <p className="px-6 py-5 text-sm text-muted-foreground">No lessons yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {mod.lessons.map((l) => {
                      const isDone = doneLessons?.has(l.id);
                      return (
                        <li key={l.id} className="flex items-center gap-4 px-6 py-4">
                          {isDone ? (
                            <CheckCircle2 className="h-5 w-5 text-success" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-medium">{l.title}</p>
                            {l.content && (
                              <p className="line-clamp-1 text-xs text-muted-foreground">{l.content}</p>
                            )}
                          </div>
                          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                            <Clock className="h-3 w-3" /> {l.duration_minutes ?? 5}m
                          </span>
                          <Button
                            size="sm"
                            variant={isDone ? "outline" : "default"}
                            disabled={isDone || completeLesson.isPending}
                            onClick={() => completeLesson.mutate(l.id)}
                            className={isDone ? "" : "bg-[image:var(--gradient-brand)] text-primary-foreground"}
                          >
                            {isDone ? "Completed" : "Mark complete"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
