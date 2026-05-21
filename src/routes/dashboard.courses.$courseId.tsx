import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Lock, FileText, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/courses/$courseId")({ component: CourseDetail });

function CourseDetail() {
  const { courseId } = Route.useParams();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [active, setActive] = useState<number>(0);

  const { data: course } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").eq("id", courseId).maybeSingle();
      return data;
    },
  });

  const { data: modules } = useQuery({
    queryKey: ["course-modules", courseId],
    queryFn: async () => {
      const { data } = await supabase.from("course_modules").select("*").eq("course_id", courseId).order("order_index");
      return data ?? [];
    },
  });

  const { data: assignment } = useQuery({
    enabled: !!user,
    queryKey: ["assignment", courseId, user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("course_assignments").select("*").eq("course_id", courseId).eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: progressByModule } = useQuery({
    enabled: !!user,
    queryKey: ["module-progress", courseId, user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("module_progress").select("module_id, completed").eq("user_id", user!.id);
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((p) => { if (p.completed) map[p.module_id] = true; });
      return map;
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (moduleId: string) => {
      if (!assignment) {
        if (!org) throw new Error("No workspace");
        const { data, error } = await supabase.from("course_assignments")
          .insert({ course_id: courseId, user_id: user!.id, organization_id: org.organization_id, assigned_by: user!.id })
          .select().single();
        if (error) throw error;
        await markComplete(moduleId, data.id);
      } else {
        await markComplete(moduleId, assignment.id);
      }
    },
    onSuccess: () => {
      toast.success("Module completed");
      qc.invalidateQueries({ queryKey: ["module-progress"] });
      qc.invalidateQueries({ queryKey: ["assignment"] });
      qc.invalidateQueries({ queryKey: ["my-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markComplete = async (moduleId: string, assignmentId: string) => {
    await supabase.from("module_progress").upsert(
      { module_id: moduleId, assignment_id: assignmentId, user_id: user!.id, completed: true, completed_at: new Date().toISOString() },
      { onConflict: "module_id,user_id" },
    );
    const total = modules?.length ?? 0;
    const done = (modules ?? []).filter((m) => progressByModule?.[m.id] || m.id === moduleId).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const status = pct >= 100 ? "completed" : "in_progress";
    await supabase.from("course_assignments").update({
      progress: pct, status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    }).eq("id", assignmentId);
  };

  if (!course) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const current = modules?.[active];
  const completedCount = modules?.filter((m) => progressByModule?.[m.id]).length ?? 0;
  const totalCount = modules?.length ?? 0;
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to="/dashboard/courses"><ArrowLeft className="mr-1 h-4 w-4" /> Library</Link></Button>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <p className="text-xs font-medium text-accent">{course.category}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{course.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-[image:var(--gradient-brand)]" style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-xs text-muted-foreground">{completedCount} / {totalCount} modules complete · {pct}%</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
          <ul className="space-y-1">
            {modules?.map((m, i) => {
              const done = !!progressByModule?.[m.id];
              const locked = i > 0 && !progressByModule?.[modules[i - 1].id] && !done;
              return (
                <li key={m.id}>
                  <button
                    onClick={() => !locked && setActive(i)}
                    disabled={locked}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      i === active ? "bg-secondary" : "hover:bg-secondary/60"
                    } ${locked ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    {locked ? <Lock className="h-4 w-4 text-muted-foreground" /> :
                     done ? <CheckCircle2 className="h-4 w-4 text-success" /> :
                     <Circle className="h-4 w-4 text-muted-foreground" />}
                    <span className="flex-1 truncate">{m.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          {!current ? (
            <p className="text-sm text-muted-foreground">No modules yet.</p>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-tight">{current.title}</h2>
              {current.video_url && (
                <div className="mt-4 aspect-video overflow-hidden rounded-xl bg-black">
                  <iframe src={current.video_url} className="h-full w-full" allow="accelerometer; autoplay; encrypted-media" allowFullScreen />
                </div>
              )}
              {current.body && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{current.body}</p>}
              {current.pdf_url && (
                <a href={current.pdf_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline">
                  <FileText className="h-4 w-4" /> Download PDF resource
                </a>
              )}
              <div className="mt-6 flex items-center justify-between">
                <Button variant="outline" disabled={active === 0} onClick={() => setActive((i) => i - 1)}>Previous</Button>
                {progressByModule?.[current.id] ? (
                  <Button disabled={active >= (modules?.length ?? 0) - 1} onClick={() => setActive((i) => i + 1)}>Next module</Button>
                ) : (
                  <Button className="bg-[image:var(--gradient-brand)] text-primary-foreground" onClick={() => completeMutation.mutate(current.id)} disabled={completeMutation.isPending}>
                    Mark complete
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
