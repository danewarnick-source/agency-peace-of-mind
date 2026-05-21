import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Plus, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/courses/")({ component: CourseLibrary });

function CourseLibrary() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: courses, isLoading } = useQuery({
    queryKey: ["courses-library"],
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("id, title, description, category, cover_url, duration_minutes, is_global")
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: mine } = useQuery({
    enabled: !!user,
    queryKey: ["my-assignments-ids", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("course_assignments").select("course_id").eq("user_id", user!.id);
      return new Set((data ?? []).map((a) => a.course_id));
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const { error } = await supabase.from("course_assignments").insert({
        course_id: courseId, user_id: user!.id, organization_id: org!.organization_id, assigned_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enrolled — find it under My Training");
      qc.invalidateQueries({ queryKey: ["my-assignments-ids"] });
      qc.invalidateQueries({ queryKey: ["my-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Course Library</h2>
        <p className="text-sm text-muted-foreground">Enroll in any course to add it to your training queue.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses?.map((c) => {
            const enrolled = mine?.has(c.id);
            const hasId = typeof c.id === "string" && c.id.length > 0;
            if (!hasId) {
              console.error("[CourseLibrary] Course is missing an id; skipping View link", c);
            }
            return (
              <div key={c.id ?? c.title} className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]">
                {c.cover_url && <img src={c.cover_url} alt="" className="h-36 w-full object-cover" />}
                <div className="p-5">
                  <p className="text-xs font-medium text-accent">{c.category}</p>
                  <h3 className="mt-1 font-semibold tracking-tight">{c.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {c.duration_minutes} min</span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {hasId ? (
                      <Button asChild variant="outline" size="sm" className="flex-1">
                        <Link
                          to="/dashboard/courses/$courseId"
                          params={{ courseId: c.id }}
                          onClick={() => {
                            if (!c.id) console.error("[CourseLibrary] View clicked with no course id");
                          }}
                        >
                          View
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="flex-1" disabled>
                        Unavailable
                      </Button>
                    )}
                    {enrolled ? (
                      <Button size="sm" disabled className="flex-1">Enrolled</Button>
                    ) : (
                      <Button size="sm" className="flex-1 bg-[image:var(--gradient-brand)] text-primary-foreground" disabled={enrollMutation.isPending || !org || !hasId} onClick={() => hasId && enrollMutation.mutate(c.id)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Enroll
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
