import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, GraduationCap, RotateCcw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/programs")({ component: ProgramsPage });

function ProgramsPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: programs, isLoading } = useQuery({
    queryKey: ["training-programs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_programs")
        .select("id, name, slug, description, category, cover_url, annual_renewal, validity_months, estimated_minutes, is_global, organization_id")
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: assignments } = useQuery({
    enabled: !!user,
    queryKey: ["my-program-assignments", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("program_assignments")
        .select("id, program_id, status, progress, completed_at, expires_at, due_date")
        .eq("user_id", user!.id);
      return data ?? [];
    },
  });

  const enroll = useMutation({
    mutationFn: async (programId: string) => {
      if (!user || !org) throw new Error("Missing org context");
      const { error } = await supabase.from("program_assignments").insert({
        program_id: programId,
        user_id: user.id,
        organization_id: org.organization_id,
        assigned_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enrolled in program");
      qc.invalidateQueries({ queryKey: ["my-program-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byProgram = new Map(assignments?.map((a) => [a.program_id, a]) ?? []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Training Programs</h2>
        <p className="text-sm text-muted-foreground">
          Multi-module compliance programs. Complete every required module to earn certification.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !programs?.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          No programs published yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {programs.map((p) => {
            if (!p.id) {
              console.error("[ProgramsPage] Program missing ID", p);
              return null;
            }
            const a = byProgram.get(p.id);
            const isComplete = a?.status === "completed";
            return (
              <div key={p.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-elegant)]">
                {p.cover_url && <img src={p.cover_url} alt="" className="h-36 w-full object-cover" />}
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-accent">{p.category ?? "Program"}</p>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight">{p.name}</h3>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {p.annual_renewal && (
                        <Badge variant="outline" className="gap-1 text-[10px]"><RotateCcw className="h-3 w-3" /> Annual</Badge>
                      )}
                      {isComplete && (
                        <Badge className="gap-1 bg-success/15 text-success text-[10px]"><CheckCircle2 className="h-3 w-3" /> Certified</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3">{p.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> ~{p.estimated_minutes} min</span>
                    <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3" /> Valid {p.validity_months} mo</span>
                  </div>
                  {a && (
                    <div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full bg-[image:var(--gradient-brand)]" style={{ width: `${a.progress}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{a.progress}% complete</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {a ? (
                      <Button asChild className="flex-1 bg-[image:var(--gradient-brand)] text-primary-foreground">
                        <Link to="/dashboard/programs/$programId" params={{ programId: p.id }}>
                          {isComplete ? "Review" : a.progress > 0 ? "Resume" : "Start"}
                        </Link>
                      </Button>
                    ) : (
                      <>
                        <Button asChild variant="outline" className="flex-1">
                          <Link to="/dashboard/programs/$programId" params={{ programId: p.id }}>View</Link>
                        </Button>
                        <Button
                          className="flex-1 bg-[image:var(--gradient-brand)] text-primary-foreground"
                          disabled={!org || enroll.isPending}
                          onClick={() => enroll.mutate(p.id)}
                        >
                          Enroll
                        </Button>
                      </>
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
