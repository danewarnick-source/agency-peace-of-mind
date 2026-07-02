import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/hive-training/course/$assignmentId")({
  component: CoursePlayer,
});

type Assignment = {
  id: string;
  user_id: string;
  course_id: string;
  status: string;
  progress_pct: number | null;
  completed_at: string | null;
  course: { id: string; title: string; description: string | null; cert_validity_months: number | null } | null;
};

type Module = {
  id: string;
  course_id: string;
  sort: number;
  title: string;
  body_md: string | null;
  video_url: string | null;
  quiz_json: unknown;
};

function CoursePlayer() {
  const { assignmentId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [attestation, setAttestation] = useState("");

  const { data: assignment, isLoading } = useQuery({
    queryKey: ["ht-assignment", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hive_training_assignments")
        .select("id, user_id, course_id, status, progress_pct, completed_at, course:hive_training_courses(id, title, description, cert_validity_months)")
        .eq("id", assignmentId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Assignment | null;
    },
  });

  const { data: modules } = useQuery({
    enabled: !!assignment?.course_id,
    queryKey: ["ht-course-modules", assignment?.course_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hive_training_course_modules")
        .select("id, course_id, sort, title, body_md, video_url, quiz_json")
        .eq("course_id", assignment!.course_id)
        .order("sort", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Module[];
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["ht-module-progress", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hive_training_module_progress")
        .select("module_id, completed_at, quiz_score")
        .eq("assignment_id", assignmentId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const completedIds = useMemo(() => new Set((progress ?? []).filter((p) => p.completed_at).map((p) => p.module_id)), [progress]);
  const total = modules?.length ?? 0;
  const done = completedIds.size;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const markModule = useMutation({
    mutationFn: async (moduleId: string) => {
      const { error } = await supabase
        .from("hive_training_module_progress")
        .upsert(
          { assignment_id: assignmentId, module_id: moduleId, completed_at: new Date().toISOString() },
          { onConflict: "assignment_id,module_id" },
        );
      if (error) throw error;
      // Recompute progress + optionally start.
      const newPct = total > 0 ? Math.round(((done + 1) / total) * 100) : 0;
      const patch: Record<string, unknown> = { progress_pct: newPct };
      if (assignment?.status === "not_started") patch.status = "in_progress";
      if (assignment && !assignment.started_at) patch.started_at = new Date().toISOString();
      await supabase.from("hive_training_assignments").update(patch).eq("id", assignmentId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ht-module-progress", assignmentId] });
      qc.invalidateQueries({ queryKey: ["ht-assignment", assignmentId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const finish = useMutation({
    mutationFn: async () => {
      if (!attestation.trim()) throw new Error("Type your full name to sign off.");
      if (done < total) throw new Error("Complete all modules first.");
      const now = new Date();
      const expires = assignment?.course?.cert_validity_months
        ? new Date(now.getTime() + assignment.course.cert_validity_months * 30 * 24 * 60 * 60 * 1000)
        : null;

      const { error: aErr } = await supabase
        .from("hive_training_assignments")
        .update({
          status: "completed",
          progress_pct: 100,
          completed_at: now.toISOString(),
          expires_at: expires?.toISOString() ?? null,
        })
        .eq("id", assignmentId);
      if (aErr) throw aErr;

      // Issue certificate (append-only).
      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
      const { error: cErr } = await supabase.from("hive_training_certificates").insert({
        assignment_id: assignmentId,
        code,
        issued_at: now.toISOString(),
        expires_at: expires?.toISOString() ?? null,
      });
      if (cErr) throw cErr;
      return code;
    },
    onSuccess: (code) => {
      toast.success(`Course completed. Certificate code: ${code}`);
      qc.invalidateQueries({ queryKey: ["ht-assignment", assignmentId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Sign-off failed"),
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>;
  if (!assignment) return <div className="p-6 text-center text-muted-foreground">Assignment not found.</div>;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard/hive-training" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg md:text-xl font-semibold text-[#1A2B47] truncate">{assignment.course?.title}</h1>
          <p className="text-xs text-muted-foreground">{done} of {total} modules · {pct}%</p>
        </div>
      </div>

      <Progress value={pct} className="h-2" />

      <div className="space-y-3">
        {(modules ?? []).map((m) => {
          const isDone = completedIds.has(m.id);
          return (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    {m.sort}. {m.title}
                  </CardTitle>
                  {isDone && <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />Done</Badge>}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {m.body_md && <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/80">{m.body_md}</pre>}
                {m.video_url && (
                  <video controls className="w-full rounded" src={m.video_url}>
                    Your browser does not support video.
                  </video>
                )}
                {!isDone && (
                  <Button
                    size="sm"
                    onClick={() => markModule.mutate(m.id)}
                    disabled={markModule.isPending}
                    className="bg-[#1A2B47] hover:bg-[#1A2B47]/90 text-white"
                  >
                    {markModule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark complete"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {done === total && total > 0 && assignment.status !== "completed" && (
        <Card className="border-[#C8881E]">
          <CardHeader>
            <CardTitle className="text-base text-[#1A2B47]">Competency sign-off</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              By typing your full name, you attest that you completed this course and understand the material.
            </p>
            <div>
              <Label>Typed signature (full legal name)</Label>
              <Input value={attestation} onChange={(e) => setAttestation(e.target.value)} placeholder="Your full name" />
            </div>
            <Button
              onClick={() => finish.mutate()}
              disabled={finish.isPending || !attestation.trim()}
              className="bg-[#C8881E] hover:bg-[#C8881E]/90 text-white w-full"
            >
              {finish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign off & issue certificate"}
            </Button>
          </CardContent>
        </Card>
      )}

      {assignment.status === "completed" && (
        <Card className="border-green-500">
          <CardContent className="p-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div className="flex-1">
              <p className="font-semibold text-[#1A2B47]">Course complete</p>
              {assignment.completed_at && (
                <p className="text-xs text-muted-foreground">
                  Completed {new Date(assignment.completed_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <Link to="/dashboard/hive-training"><Button size="sm" variant="outline">Back</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
