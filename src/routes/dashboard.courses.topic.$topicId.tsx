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

export const Route = createFileRoute("/dashboard/courses/topic/$topicId")({
  component: TopicPlayer,
});

function TopicPlayer() {
  const { topicId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [signature, setSignature] = useState("");

  const { data: topic, isLoading } = useQuery({
    queryKey: ["training-topic", topicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_topics")
        .select("id, code, title, description, dspd_letter, mindsmith_url, attestation_statement")
        .eq("id", topicId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: progress } = useQuery({
    enabled: !!user && !!topic,
    queryKey: ["topic-progress", "core", topicId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_topic_progress")
        .select("status")
        .eq("user_id", user!.id)
        .eq("topic_kind", "core")
        .eq("ref_id", topicId)
        .maybeSingle();
      return data;
    },
  });

  // Mark as in_progress on open if not already completed
  useEffect(() => {
    if (!user || !topic) return;
    if (progress?.status === "completed" || progress?.status === "in_progress") return;
    supabase
      .from("training_topic_progress")
      .upsert(
        { user_id: user.id, topic_kind: "core", ref_id: topicId, status: "in_progress", updated_at: new Date().toISOString() },
        { onConflict: "user_id,topic_kind,ref_id" },
      )
      .then(() => qc.invalidateQueries({ queryKey: ["my-core-progress"] }));
  }, [user, topic, progress?.status, topicId, qc]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!user || !topic) throw new Error("Missing data");
      const sig = signature.trim();
      if (sig.length < 3) throw new Error("Type your full name to attest.");
      const { error: insErr } = await supabase.from("training_completions").insert({
        user_id: user.id,
        topic_kind: "core",
        ref_id: topic.id,
        topic_code: topic.code,
        topic_title: topic.title,
        dspd_letter: topic.dspd_letter,
        attestation_statement: topic.attestation_statement,
        typed_signature: sig,
      });
      if (insErr) throw insErr;
      const { error: progErr } = await supabase.from("training_topic_progress").upsert(
        { user_id: user.id, topic_kind: "core", ref_id: topic.id, status: "completed", updated_at: new Date().toISOString() },
        { onConflict: "user_id,topic_kind,ref_id" },
      );
      if (progErr) throw progErr;
    },
    onSuccess: () => {
      toast.success("Training completed — record saved.");
      qc.invalidateQueries({ queryKey: ["my-core-progress"] });
      qc.invalidateQueries({ queryKey: ["my-core-progress-count"] });
      qc.invalidateQueries({ queryKey: ["topic-progress"] });
      navigate({ to: "/dashboard/courses/core" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading topic…</p>;
  if (!topic)
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Topic not found.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/courses/core">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Core Training
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
            <Link to="/dashboard/courses/core">
              <ArrowLeft className="mr-1 h-4 w-4" /> Core Training
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
            Core Topic{topic.dspd_letter ? ` · DSPD §1.8(4)(${topic.dspd_letter})` : ""}
          </p>
          <h1 className="mt-0.5 text-base font-semibold leading-snug tracking-tight">{topic.title}</h1>
          {topic.description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{topic.description}</p>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 bg-card">
        {topic.mindsmith_url ? (
          <iframe
            src={topic.mindsmith_url}
            title={topic.title}
            scrolling="yes"
            className="h-full w-full border-none"
            allow="fullscreen; autoplay; clipboard-write"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Lesson content for this topic has not been configured yet. Complete the attestation below to record this training.
          </div>
        )}
      </div>

      <footer className="border-t border-border bg-card px-4 py-3 space-y-2">
        {isCompleted ? (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> You've already completed this topic.
          </div>
        ) : (
          <>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Attestation:</span> {topic.attestation_statement}
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
