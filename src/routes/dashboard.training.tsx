import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/dashboard/training")({ component: TrainingPage });

function TrainingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["training_modules"],
    queryFn: async () => {
      const { data } = await supabase.from("training_modules").select("*").order("created_at");
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Active training courses</h2>
        <p className="text-sm text-muted-foreground">Track team progress on your assigned modules.</p>
      </div>

      <div className="grid gap-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading modules…</p>}
        {data?.map((m) => (
          <div key={m.id} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold tracking-tight">{m.title}</h3>
                  {m.category && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">{m.category}</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {m.duration_minutes} min
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{m.progress ?? 0}%</span>
              </div>
              <Progress value={m.progress ?? 0} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
