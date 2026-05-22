import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/courses">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to roadmap
          </Link>
        </Button>
      </div>
    );
  }

  const isCompleted = !!progress?.is_completed;

  return (
    <div className="h-screen overflow-hidden -m-6 flex flex-col">
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border bg-card">
        <div className="min-w-0">
          <p className="text-xs font-medium text-accent">
            Module {mod.sequence_order} of 6
          </p>
          <h2 className="text-base font-semibold tracking-tight truncate">{mod.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/courses">
              <ArrowLeft className="mr-1 h-4 w-4" /> Roadmap
            </Link>
          </Button>
          <Button
            size="sm"
            className={isCompleted ? "" : "bg-[image:var(--gradient-brand)] text-primary-foreground"}
            variant={isCompleted ? "outline" : "default"}
            disabled={completeMutation.isPending || isCompleted || !user}
            onClick={() => completeMutation.mutate()}
          >
            <CheckCircle2 className="mr-1 h-4 w-4" />
            {isCompleted ? "Completed" : "Mark Module as Complete"}
          </Button>
        </div>
      </div>
      <div className="w-full h-[calc(100vh-5rem)] overflow-hidden bg-card">
        {mod.mindsmith_url ? (
          <iframe
            src={mod.mindsmith_url}
            title={mod.title}
            scrolling="yes"
            className="w-full h-full border-none"
            allow="fullscreen; autoplay; clipboard-write"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            No lesson URL has been configured for this module yet.
          </div>
        )}
      </div>
    </div>
  );
}
