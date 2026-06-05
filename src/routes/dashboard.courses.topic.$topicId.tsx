import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, CheckCircle2, Sparkles, RotateCw } from "lucide-react";
import { toast } from "sonner";
import {
  TRAINING_TOPICS,
  TrainingModule,
  ESIGN_CONSENT_STATEMENT,
  TRAINING_ENGINE_VERSION,
  type AttestPayload,
} from "@/components/training/hive-training-engine";

export const Route = createFileRoute("/dashboard/courses/topic/$topicId")({
  component: TopicPlayer,
});

async function sha256Hex(input: string): Promise<string> {
  try {
    const buf = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

async function fetchClientIp(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { ip?: string };
    return j.ip ?? null;
  } catch {
    return null;
  }
}

function TopicPlayer() {
  const { topicId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [signature, setSignature] = useState("");
  const [esignConsent, setEsignConsent] = useState(false);
  const [attestAgree, setAttestAgree] = useState(false);
  const [retakeMode, setRetakeMode] = useState(false);

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

  const { data: progress, isLoading: progressLoading } = useQuery({
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

  const { data: latestCompletion } = useQuery({
    enabled: !!user && !!topic,
    queryKey: ["topic-latest-completion", "core", topicId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_completions")
        .select("id, typed_signature, completed_at")
        .eq("user_id", user!.id)
        .eq("topic_kind", "core")
        .eq("ref_id", topicId)
        .eq("is_current", true)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const isCompleted = progress?.status === "completed";

  // Only mark in_progress if we definitively know the user has NOT already
  // completed this topic. Never downgrade Completed → In progress on open.
  useEffect(() => {
    if (!user || !topic) return;
    if (progressLoading) return;
    if (progress?.status === "completed" || progress?.status === "in_progress") return;
    supabase
      .from("training_topic_progress")
      .upsert(
        { user_id: user.id, topic_kind: "core", ref_id: topicId, status: "in_progress", updated_at: new Date().toISOString() },
        { onConflict: "user_id,topic_kind,ref_id" },
      )
      .then(() => qc.invalidateQueries({ queryKey: ["my-core-progress"] }));
  }, [user, topic, progress?.status, progressLoading, topicId, qc]);

  const persistCompletion = async (payload: AttestPayload) => {
    if (!user || !topic) throw new Error("Missing data");
    const trimmed = payload.signature.trim();
    if (trimmed.length < 2) throw new Error("Type your full legal name to sign.");
    if (!payload.consentAccepted) throw new Error("Electronic signature consent is required.");

    const ip = await fetchClientIp();
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const timeZone =
      typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
    const completedAt = new Date().toISOString();

    // Pull signer's profile name for attribution.
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const signerFullName = prof?.full_name || trimmed;
    const signerEmail = prof?.email || user.email || null;

    const recordToHash = JSON.stringify({
      user_id: user.id,
      signer_full_name: signerFullName,
      signer_email: signerEmail,
      typed_signature: trimmed,
      topic_kind: "core",
      ref_id: topic.id,
      topic_code: topic.code,
      topic_title: topic.title,
      attestation_statement: topic.attestation_statement,
      consent_statement: payload.consentStatement,
      content_version: payload.contentVersion,
      completed_at: completedAt,
      ip_address: ip,
      user_agent: userAgent,
      time_zone: timeZone,
    });
    const contentHash = await sha256Hex(recordToHash);

    const { error: insErr } = await supabase.from("training_completions").insert({
      user_id: user.id,
      topic_kind: "core",
      ref_id: topic.id,
      topic_code: topic.code,
      topic_title: topic.title,
      dspd_letter: topic.dspd_letter,
      attestation_statement: topic.attestation_statement,
      typed_signature: trimmed,
      completed_at: completedAt,
      signer_full_name: signerFullName,
      signer_email: signerEmail,
      consent_statement: payload.consentStatement,
      consent_accepted: payload.consentAccepted,
      content_version: payload.contentVersion,
      ip_address: ip,
      user_agent: userAgent,
      time_zone: timeZone,
      content_hash: contentHash,
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
    qc.invalidateQueries({ queryKey: ["topic-latest-completion"] });
    qc.invalidateQueries({ queryKey: ["records-completions-all"] });
  };

  const completeMutation = useMutation({
    mutationFn: () =>
      persistCompletion({
        signature,
        consentStatement: ESIGN_CONSENT_STATEMENT,
        consentAccepted: true,
        contentVersion: TRAINING_ENGINE_VERSION,
      }),
    onSuccess: () => {
      toast.success("Training completed — signed record saved.");
      navigate({ to: "/dashboard/courses/core" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  // Reviewing a completed topic is read-only unless the user explicitly retakes.
  const reviewing = isCompleted && !retakeMode;

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
            // Force a fresh mount when toggling between review and retake so
            // the engine resets its internal step state cleanly.
            key={reviewing ? "review" : "retake"}
            topic={engineTopic}
            readOnly={reviewing}
            previousCompletion={
              latestCompletion
                ? { signedName: latestCompletion.typed_signature, completedAt: latestCompletion.completed_at }
                : null
            }
            onRetake={reviewing ? () => setRetakeMode(true) : undefined}
            onExit={() => navigate({ to: "/dashboard/courses/core" })}
            onComplete={reviewing ? undefined : async (payload) => {
              try {
                await persistCompletion(payload);
                toast.success("Training completed — signed record saved.");
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

  // Fallback: Mindsmith iframe + manual attestation
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

      <footer className="border-t border-border bg-card px-4 py-3 space-y-3">
        {reviewing ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <span className="inline-flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" /> You've already completed this topic.
              {latestCompletion && (
                <span className="font-normal text-emerald-700/80">
                  Signed by {latestCompletion.typed_signature} on{" "}
                  {new Date(latestCompletion.completed_at).toLocaleDateString()}.
                </span>
              )}
            </span>
            <Button size="sm" variant="outline" onClick={() => setRetakeMode(true)}>
              <RotateCw className="mr-1 h-3.5 w-3.5" /> Retake training
            </Button>
          </div>
        ) : (
          <>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Attestation:</span> {topic.attestation_statement}
            </p>
            <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2 text-[11px] leading-relaxed">
              <Checkbox
                checked={attestAgree}
                onCheckedChange={(v) => setAttestAgree(v === true)}
                className="mt-0.5"
              />
              <span>I have completed and understand the training content above.</span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] leading-relaxed">
              <Checkbox
                checked={esignConsent}
                onCheckedChange={(v) => setEsignConsent(v === true)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-semibold text-amber-900">Electronic signature consent (ESIGN / Utah UETA)</span>
                {ESIGN_CONSENT_STATEMENT}
              </span>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <Label htmlFor="sig" className="sr-only">Typed name signature</Label>
                <Input
                  id="sig"
                  placeholder="Type your full legal name to sign"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                />
              </div>
              <Button
                onClick={() => completeMutation.mutate()}
                disabled={
                  completeMutation.isPending ||
                  signature.trim().length < 2 ||
                  !esignConsent ||
                  !attestAgree
                }
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
