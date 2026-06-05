import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/courses/person-module/$assignmentId")({
  component: PersonModulePlayer,
});

function PersonModulePlayer() {
  const { assignmentId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [signature, setSignature] = useState("");

  const { data: mod, isLoading } = useQuery({
    queryKey: ["person-module", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_person_modules")
        .select("id, title, description, mindsmith_url, attestation_statement")
        .eq("id", assignmentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: progress } = useQuery({
    enabled: !!user && !!mod,
    queryKey: ["topic-progress", "person", assignmentId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_topic_progress")
        .select("status")
        .eq("user_id", user!.id)
        .eq("topic_kind", "person")
        .eq("ref_id", assignmentId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!user || !mod) return;
    if (progress?.status === "completed" || progress?.status === "in_progress") return;
    supabase
      .from("training_topic_progress")
      .upsert(
        { user_id: user.id, topic_kind: "person", ref_id: assignmentId, status: "in_progress", updated_at: new Date().toISOString() },
        { onConflict: "user_id,topic_kind,ref_id" },
      )
      .then(() => qc.invalidateQueries({ queryKey: ["my-person-progress"] }));
  }, [user, mod, progress?.status, assignmentId, qc]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!user || !mod) throw new Error("Missing data");
      const sig = signature.trim();
      if (sig.length < 3) throw new Error("Type your full name to attest.");
      const { error: insErr } = await supabase.from("training_completions").insert({
        user_id: user.id,
        topic_kind: "person",
        ref_id: mod.id,
        topic_code: null,
        topic_title: mod.title,
        dspd_letter: "o",
        attestation_statement: mod.attestation_statement,
        typed_signature: sig,
      });
      if (insErr) throw insErr;
      const { error: progErr } = await supabase.from("training_topic_progress").upsert(
        { user_id: user.id, topic_kind: "person", ref_id: mod.id, status: "completed", updated_at: new Date().toISOString() },
        { onConflict: "user_id,topic_kind,ref_id" },
      );
      if (progErr) throw progErr;
    },
    onSuccess: () => {
      toast.success("Person-specific training completed — record saved.");
      qc.invalidateQueries({ queryKey: ["my-person-progress"] });
      qc.invalidateQueries({ queryKey: ["my-person-progress-count"] });
      qc.invalidateQueries({ queryKey: ["topic-progress"] });
      navigate({ to: "/dashboard/courses/person" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading module…</p>;
  if (!mod)
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Module not found.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/courses/person">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Person-Specific
          </Link>
        </Button>
      </div>
    );

  const isCompleted = progress?.status === "completed";

  return (
    <div className="-mx-4 -my-5 flex h-full min-h-[calc(100dvh-9rem)] flex-col bg-background md:min-h-[600px]">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2 shrink-0">
            <Link to="/dashboard/courses/person">
              <ArrowLeft className="mr-1 h-4 w-4" /> Person-Specific
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/ask-nectar">
              <Sparkles className="mr-1 h-4 w-4" /> Ask Nectar
            </Link>
          </Button>
        </div>
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Person-Specific · DSPD §1.8(4)(o)
          </p>
          <h1 className="mt-0.5 text-base font-semibold leading-snug tracking-tight">{mod.title}</h1>
          {mod.description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mod.description}</p>
          )}
        </div>
      </header>

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
            Lesson content for this person-specific module has not been configured yet. Complete the attestation below to record this training.
          </div>
        )}
      </div>

      <footer className="border-t border-border bg-card px-4 py-3 space-y-2">
        {isCompleted ? (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> You've already completed this module.
          </div>
        ) : (
          <>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Attestation:</span> {mod.attestation_statement}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <Label htmlFor="sig" className="sr-only">Typed name signature</Label>
                <Input
                  id="sig"
                  placeholder="Type your full name to sign"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                />
              </div>
              <Button
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending || signature.trim().length < 3}
                className="bg-[image:var(--gradient-brand)] text-primary-foreground"
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                {completeMutation.isPending ? "Saving…" : "Sign & Complete"}
              </Button>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
