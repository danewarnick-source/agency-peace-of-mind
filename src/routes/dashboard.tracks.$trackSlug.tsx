import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BookOpen, ShieldCheck, CalendarClock, RefreshCw, FileCheck2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/dashboard/tracks/$trackSlug")({
  component: TrackDetailPage,
});

function TrackDetailPage() {
  const { trackSlug } = useParams({ from: "/dashboard/tracks/$trackSlug" });
  const router = useRouter();

  const { data: track, isLoading } = useQuery({
    queryKey: ["track", trackSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_tracks")
        .select("*")
        .eq("slug", trackSlug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: programs } = useQuery({
    queryKey: ["track-programs", track?.id],
    enabled: !!track?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("track_programs")
        .select("required, order_index, program:training_programs(id, slug, name, description, estimated_minutes, category)")
        .eq("track_id", track!.id)
        .order("order_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: certTypes } = useQuery({
    queryKey: ["track-cert-types", track?.id],
    enabled: !!track?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certification_types")
        .select("id, code, name, description, validity_months")
        .eq("track_id", track!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: myCerts } = useQuery({
    queryKey: ["my-ext-certs", track?.id],
    enabled: !!certTypes && certTypes.length > 0,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("external_certifications")
        .select("id, certification_type_id, status, expires_at, cert_name, issuer")
        .eq("user_id", user.id)
        .in("certification_type_id", certTypes!.map((c) => c.id));
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!track) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold">Track not found</h2>
        <Button variant="link" onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/tracks" })}>Back to tracks</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <button type="button" onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/tracks" })} className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All tracks
        </button>
        <h1 className="text-3xl font-bold tracking-tight mt-2">{track.name}</h1>
        <p className="text-muted-foreground mt-1">{track.description}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {track.due_within_days && <Badge variant="outline"><CalendarClock className="h-3 w-3 mr-1" />Due {track.due_within_days}d</Badge>}
          {track.recurrence_months && <Badge variant="outline"><RefreshCw className="h-3 w-3 mr-1" />Renews {track.recurrence_months}mo</Badge>}
          {track.min_annual_hours && <Badge variant="outline">{track.min_annual_hours} hrs/year</Badge>}
        </div>
      </div>

      {programs && programs.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Training Programs
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {programs.map((tp: any) => (
              <Link key={tp.program.id} to="/dashboard/programs/$programId" params={{ programId: tp.program.id }}>
                <Card className="h-full hover:border-primary/50 transition-all cursor-pointer">
                  <CardHeader>
                    <div className="flex justify-between items-start gap-2">
                      <CardTitle className="text-base">{tp.program.name}</CardTitle>
                      {tp.required ? <Badge>Required</Badge> : <Badge variant="secondary">Optional</Badge>}
                    </div>
                    <CardDescription className="line-clamp-2">{tp.program.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground flex gap-3">
                      {tp.program.category && <span>{tp.program.category}</span>}
                      {tp.program.estimated_minutes && <span>~{tp.program.estimated_minutes} min</span>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {certTypes && certTypes.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Required Certifications
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {certTypes.map((ct) => {
              const mine = myCerts?.find((m) => m.certification_type_id === ct.id);
              const expired = mine?.expires_at && new Date(mine.expires_at) < new Date();
              const expiringSoon = mine?.expires_at && !expired && (new Date(mine.expires_at).getTime() - Date.now()) < 1000 * 60 * 60 * 24 * 30;
              return (
                <Card key={ct.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <CardTitle className="text-base">{ct.name}</CardTitle>
                        <CardDescription>Valid {ct.validity_months} months</CardDescription>
                      </div>
                      {mine?.status === "approved" && !expired && (
                        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">Active</Badge>
                      )}
                      {mine?.status === "pending" && <Badge variant="secondary">Pending review</Badge>}
                      {mine?.status === "rejected" && <Badge variant="destructive">Rejected</Badge>}
                      {expired && <Badge variant="destructive">Expired</Badge>}
                      {!mine && <Badge variant="outline">Not submitted</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {mine?.expires_at && (
                      <div className={`text-xs flex items-center gap-1 ${expiringSoon ? "text-orange-600" : "text-muted-foreground"}`}>
                        {expiringSoon && <AlertCircle className="h-3 w-3" />}
                        Expires {new Date(mine.expires_at).toLocaleDateString()}
                      </div>
                    )}
                    <Link to="/dashboard/external-certifications">
                      <Button size="sm" variant={mine ? "outline" : "default"} className="w-full">
                        <FileCheck2 className="h-4 w-4 mr-2" />
                        {mine ? "Manage upload" : "Upload certificate"}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {(!programs || programs.length === 0) && (!certTypes || certTypes.length === 0) && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No programs or certifications have been linked to this track yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
