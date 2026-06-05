import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { TRAINING_TOPICS, TrainingModule } from "@/components/training/hive-training-engine";

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

  const persistCompletion = async (sig: string) => {
    if (!user || !topic) throw new Error("Missing data");
    const trimmed = sig.trim();
    if (trimmed.length < 3) throw new Error("Type your full name to attest.");
    const { error: insErr } = await supabase.from("training_completions").insert({
      user_id: user.id,
      topic_kind: "core",
      ref_id: topic.id,
      topic_code: topic.code,
      topic_title: topic.title,
      dspd_letter: topic.dspd_letter,
      attestation_statement: topic.attestation_statement,
      typed_signature: trimmed,
    });
    if (insErr) throw insErr;
    const { error: progErr } = await supabase.from("training_topic_progress").upsert(
      { user_id: user.id, topic_kind: "core", ref_id: topic.id, status: "completed", updated_at: new Date().toISOString() },
      { onConflict: "user_id,topic_kind,ref_id" },
    );
    if (progErr) throw progErr;
    qc.invalidateQueries({ queryKey: ["my-core-progress"] });
    qc.invalidateQueries({ queryKey: ["my-core-progress-count"] });
    qc.invalidateQueries({ queryKey: ["topic-progress"] });
  };

  const completeMutation = useMutation({
    mutationFn: () => persistCompletion(signature),
    onSuccess: () => {
      toast.success("Training completed — record saved.");
      navigate({ to: "/dashboard/courses/core" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Find rich content from the bundled engine registry (by DSPD letter, or
  // by slug→letter fallback for topics whose dspd_letter isn't populated).
  const SLUG_TO_LETTER: Record<string, string> = {
    call_911: "A", call_medical: "B", call_mental_health: "C", incident_reporting: "D",
    seizure_disorders: "E", whereabouts_unknown: "F", choking_rescue: "G", choking_prevention: "H",
    positive_behavior_supports: "I", legal_rights_ada: "J", ane_reporting: "K", hipaa_confidentiality: "L",
    idrc_abi_orientation: "M", communicable_disease: "N", person_specific: "O", agency_policies: "P",
    dspd_philosophy: "Q", dhhs_medicaid_101: "R", oig_fraud_reporting: "S", hcbs_settings_rule: "T",
    crisis_deescalation: "U", trauma_informed: "V", suicide_prevention: "W",
  };
  const engineTopic = useMemo(() => {
    if (!topic) return null;
    const letter = (topic.dspd_letter || SLUG_TO_LETTER[topic.code ?? ""] || "").toUpperCase();
    if (!letter) return null;
    return TRAINING_TOPICS.find((t) => t.code.toUpperCase() === letter && t.status === "ready" && t.steps?.length) || null;
  }, [topic]);

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

  // Rich engine path — replaces the Mindsmith iframe + manual attestation
  // when we have full lesson content for this topic.
  if (engineTopic) {
    return (
      <div className="-mx-4 -my-5 flex h-full min-h-[calc(100dvh-9rem)] flex-col bg-[#eef0f5] md:min-h-[600px]">
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
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
        </header>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <TrainingModule
            topic={engineTopic}
            onExit={() => navigate({ to: "/dashboard/courses/core" })}
            onComplete={async (sig) => {
              try {
                await persistCompletion(sig);
                toast.success("Training completed — record saved.");
              } catch (e) {
                toast.error((e as Error).message);
                throw e;
              }
            }}
          />
        </div>
      </div>
    );
  }

  // Fallback: Mindsmith iframe or empty-state with manual attestation
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
