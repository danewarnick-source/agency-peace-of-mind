import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, RefreshCw, ShieldCheck, GraduationCap, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/dashboard/tracks")({
  component: TracksPage,
});

const TYPE_META: Record<string, { label: string; icon: typeof ShieldCheck; tone: string }> = {
  onboarding_30: { label: "Onboarding", icon: GraduationCap, tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  certification_90: { label: "Certification", icon: ShieldCheck, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  behavioral: { label: "Behavioral", icon: AlertTriangle, tone: "bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  abi_specialty: { label: "ABI Specialty", icon: GraduationCap, tone: "bg-purple-500/10 text-purple-700 dark:text-purple-300" },
  annual: { label: "Annual", icon: RefreshCw, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  custom: { label: "Custom", icon: ShieldCheck, tone: "bg-muted text-foreground" },
};

function TracksPage() {
  const { data: tracks, isLoading } = useQuery({
    queryKey: ["training-tracks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_tracks")
        .select("id, name, slug, description, track_type, due_within_days, recurrence_months, min_annual_hours")
        .eq("is_published", true)
        .order("track_type");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["track-assignments-mine"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("track_assignments")
        .select("track_id, status, progress, due_date, expires_at, completed_at")
        .eq("user_id", user.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compliance Training Tracks</h1>
        <p className="text-muted-foreground mt-1">
          Grouped compliance requirements, certifications, and recurring education.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tracks?.map((t) => {
            const meta = TYPE_META[t.track_type] ?? TYPE_META.custom;
            const Icon = meta.icon;
            const a = assignments?.find((x) => x.track_id === t.id);
            const progress = a?.progress ?? 0;
            return (
              <Link key={t.id} to="/dashboard/tracks/$trackSlug" params={{ trackSlug: t.slug }}>
                <Card className="h-full transition-all hover:shadow-lg hover:border-primary/50 cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className={`rounded-lg p-2 ${meta.tone}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <Badge variant="outline" className="text-xs">{meta.label}</Badge>
                    </div>
                    <CardTitle className="text-lg mt-3">{t.name}</CardTitle>
                    <CardDescription className="line-clamp-2">{t.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {t.due_within_days && (
                        <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />Due in {t.due_within_days}d</span>
                      )}
                      {t.recurrence_months && (
                        <span className="inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" />Renews every {t.recurrence_months}mo</span>
                      )}
                      {t.min_annual_hours && (
                        <span className="inline-flex items-center gap-1">{t.min_annual_hours}h/yr min</span>
                      )}
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                    {a?.status === "completed" ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">Completed</Badge>
                    ) : a?.status === "in_progress" ? (
                      <Badge variant="secondary">In progress</Badge>
                    ) : (
                      <Badge variant="outline">Not started</Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
