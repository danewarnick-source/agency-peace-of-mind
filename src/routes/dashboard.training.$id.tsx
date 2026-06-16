import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/training/$id")({
  component: TrainingPlayer,
});

function TrainingPlayer() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: mod, isLoading } = useQuery({
    queryKey: ["training-module", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_modules")
        .select("id, title, description, sequence_order, mindsmith_url")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: progress } = useQuery({
    enabled: !!user && !!mod,
    queryKey: ["training-module-progress", id, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_training_progress")
        .select("is_completed")
        .eq("user_id", user!.id)
        .eq("module_id", id)
        .maybeSingle();
      return data;
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("user_training_progress").upsert(
        {
          user_id: user!.id,
          module_id: id,
          is_completed: true,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,module_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Module marked as complete");
      qc.invalidateQueries({ queryKey: ["my-training-progress"] });
      qc.invalidateQueries({ queryKey: ["training-module-progress", id] });
      navigate({ to: "/dashboard/courses" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading module…</p>;
  }
  if (!mod) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Module not found.</p>
        <Button variant="outline" size="sm" onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/courses" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to roadmap
        </Button>
      </div>
    );
  }

  const isCompleted = !!progress?.is_completed;
  const isQuiz = mod.sequence_order === 6;

  return (
    // Span the full shell main area (cancel the shell's px-4 py-5) and lay out
    // header + content as a flex column that fills the visible space without
    // colliding with the bottom "Clocked in" bar or tabs.
    <div className="-mx-4 -my-5 flex h-full min-h-[calc(100dvh-9rem)] flex-col bg-background md:min-h-[600px]">
      {/* Compact, consistent header — no truncation, title wraps */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <Button variant="ghost" size="sm" className="-ml-2 shrink-0" onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/courses" })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Roadmap
          </Button>
          <Button
            size="sm"
            className={
              isCompleted
                ? ""
                : "bg-[image:var(--gradient-brand)] text-primary-foreground shrink-0"
            }
            variant={isCompleted ? "outline" : "default"}
            disabled={completeMutation.isPending || isCompleted || !user}
            onClick={() => completeMutation.mutate()}
          >
            <CheckCircle2 className="mr-1 h-4 w-4" />
            {isCompleted ? "Completed" : "Mark Complete"}
          </Button>
        </div>
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            {isQuiz ? "Certification Quiz" : `Module ${mod.sequence_order} of 6`}
          </p>
          <h1 className="mt-0.5 text-base font-semibold leading-snug tracking-tight text-foreground">
            {mod.title}
          </h1>
          {mod.description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {mod.description}
            </p>
          )}
        </div>
      </header>

      {/* Lesson body — fills remaining space, scrolls internally if needed */}
      <div className="flex-1 min-h-0 bg-card">
        {mod.mindsmith_url ? (
          <iframe
            src={mod.mindsmith_url}
            title={mod.title}
            scrolling="yes"
            className="h-full w-full border-none"
            allow="fullscreen; autoplay; clipboard-write"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            No lesson content has been configured for this module yet.
          </div>
        )}
      </div>
    </div>
  );
}
