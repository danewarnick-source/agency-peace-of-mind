import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PlayCircle, Calendar } from "lucide-react";

export const Route = createFileRoute("/dashboard/training")({ component: MyTraining });

function MyTraining() {
  const { user } = useAuth();
  const { data: assignments, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["my-assignments", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_assignments")
        .select("id, status, progress, due_date, course_id, courses(id, title, description, category, cover_url, duration_minutes)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Assigned to you</h2>
        <p className="text-sm text-muted-foreground">Complete each course to earn its certification.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !assignments?.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">No training assigned yet.</p>
          <Button asChild className="mt-4"><Link to="/dashboard/courses">Browse Course Library</Link></Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {assignments.map((a) => {
            const c = a.courses as { id: string; title: string; description: string | null; category: string | null; cover_url: string | null; duration_minutes: number | null } | null;
            if (!c) return null;
            return (
              <div key={a.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
                {c.cover_url && <img src={c.cover_url} alt="" className="h-40 w-full object-cover" />}
                <div className="p-5">
                  <p className="text-xs font-medium text-accent">{c.category}</p>
                  <h3 className="mt-1 font-semibold tracking-tight">{c.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                  <div className="mt-4">
                    <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-[image:var(--gradient-brand)]" style={{ width: `${a.progress}%` }} /></div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{a.progress}% complete</span>
                      {a.due_date && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Due {new Date(a.due_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <Button asChild className="mt-5 w-full bg-[image:var(--gradient-brand)] text-primary-foreground">
                    <Link to="/dashboard/courses/$courseId" params={{ courseId: c.id }}>
                      <PlayCircle className="mr-2 h-4 w-4" /> {a.progress > 0 ? "Continue" : "Start"} course
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
