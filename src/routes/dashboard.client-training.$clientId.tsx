import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getStaffClientSpecificTraining,
  completeClientSpecificTraining,
  checkAnswerRelevance,
  type CSTContent,
  type CSTReviewQuestion,
  type CSTGoal,
} from "@/lib/client-specific-training.functions";
import { SectionsView, GoalsView } from "@/components/clients/client-specific-training-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Shield, Loader2, AlertTriangle, BookOpen } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({
  trainingType: z.enum(["person_specific", "support_strategies"]).optional(),
});

export const Route = createFileRoute("/dashboard/client-training/$clientId")({
  validateSearch: searchSchema,
  component: ClientTrainingViewer,
});

// ── Question answer state ────────────────────────────────────────────────────
type QAnswer = { question: string; answer: string; tab: string; relevant: boolean | null; hint: string; checking: boolean };

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const MIN_WORDS = 25;

function ClientTrainingViewer() {
  const { clientId } = Route.useParams();
  const { trainingType: rawType } = Route.useSearch();
  const trainingType = rawType ?? "person_specific";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getStaffClientSpecificTraining);
  const completeFn = useServerFn(completeClientSpecificTraining);
  const checkFn = useServerFn(checkAnswerRelevance);
  const [signature, setSignature] = useState("");
  const [answers, setAnswers] = useState<QAnswer[]>([]);
  const [lastTrainingId, setLastTrainingId] = useState<string | null>(null);
  const [contentRead, setContentRead] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const queryKey = ["staff-client-training", clientId, trainingType];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => getFn({ data: { clientId, trainingType } }),
    retry: false,
  });

  const training = data?.training ?? null;
  const completion = data?.completion ?? null;
  const pinned = data?.pinnedToCurrent ?? false;
  const questions: CSTReviewQuestion[] = (training as { review_questions?: CSTReviewQuestion[] | null } | null)?.review_questions ?? [];

  // Reset answers when training changes (type switch or data reload)
  if (training?.id && training.id !== lastTrainingId) {
    setLastTrainingId(training.id);
    setAnswers(questions.map((q) => ({ question: q.prompt, answer: "", tab: q.tab, relevant: null, hint: "", checking: false })));
    setContentRead(false);
  }

  // Short-content safety: if there's nothing to scroll, mark as read.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !training) return;
    if (el.scrollHeight <= el.clientHeight + 4) setContentRead(true);
  }, [training, lastTrainingId]);

  function patchAnswer(idx: number, p: Partial<QAnswer>) {
    setAnswers((prev) => { const next = [...prev]; next[idx] = { ...next[idx], ...p }; return next; });
  }

  const checkAllRelevance = useCallback(async (qs: CSTReviewQuestion[], ans: QAnswer[]): Promise<boolean> => {
    if (!qs.length) return true;
    let allOk = true;
    for (let i = 0; i < qs.length; i++) {
      if (!ans[i]?.answer?.trim()) {
        patchAnswer(i, { relevant: false, hint: "Please write an answer before submitting." });
        allOk = false;
        continue;
      }
      patchAnswer(i, { checking: true });
      try {
        const res = await checkFn({ data: { question: qs[i].prompt, answer: ans[i].answer, context: training?.title } });
        patchAnswer(i, { relevant: res.relevant, hint: res.hint, checking: false });
        if (!res.relevant) allOk = false;
      } catch {
        patchAnswer(i, { checking: false, relevant: true, hint: "" });
      }
    }
    return allOk;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkFn, training?.title]);

  const completeMut = useMutation({
    mutationFn: async () => {
      // 1. Check relevance of all answers
      const ok = await checkAllRelevance(questions, answers);
      if (!ok) throw new Error("Please address the flagged questions before submitting.");
      // 2. Submit completion
      return completeFn({
        data: {
          clientId,
          trainingType,
          typedSignature: signature.trim(),
          questionAnswers: questions.length
            ? answers.map((a) => ({ question: a.question, answer: a.answer, tab: a.tab }))
            : [],
        },
      });
    },
    onSuccess: () => {
      toast.success("Training completed — record saved.");
      qc.invalidateQueries({ queryKey });
      setSignature("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const typeLabel = trainingType === "support_strategies" ? "Support Strategies" : "Client-Specific Training";
  const otherType = trainingType === "support_strategies" ? "person_specific" : "support_strategies";
  const otherLabel = otherType === "support_strategies" ? "Support Strategies" : "Client-Specific Training";

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        <Loader2 className="inline h-3.5 w-3.5 animate-spin mr-1.5" />Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{(error as Error).message}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  if (!training) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-muted-foreground">No published {typeLabel.toLowerCase()} training is available for this client yet.</p>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  const alreadyCurrent = completion?.is_current && pinned;
  const goals = (training as { goals?: CSTGoal[] | null }).goals ?? null;

  const allAnswered = questions.length === 0 || answers.every((a) => wordCount(a.answer) >= MIN_WORDS);
  const anyChecking = answers.some((a) => a.checking);

  return (
    <div className="-mx-4 -my-5 flex h-full min-h-[calc(100dvh-9rem)] flex-col bg-background md:min-h-[600px]">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2 shrink-0">
            <Link to="/dashboard">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/dashboard/client-training/$clientId", params: { clientId }, search: { trainingType: otherType } })}
          >
            Switch to {otherLabel}
          </Button>
        </div>
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            {typeLabel} · v{training.version}
          </p>
          <h1 className="mt-0.5 text-base font-semibold leading-snug tracking-tight">{training.title}</h1>
        </div>
        {alreadyCurrent && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Completed {completion?.completed_at ? new Date(completion.completed_at).toLocaleDateString() : ""}</span>
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto bg-card px-4 py-4 space-y-6">
        <div className="rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 flex gap-2">
          <Shield className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            This content is your agency's published snapshot of this client's documented needs. Review every section carefully -- your typed-name attestation is recorded.
          </span>
        </div>

        <SectionsView
          content={training.content as CSTContent}
          editing={false}
          onChange={() => {}}
        />

        {trainingType === "person_specific" && goals && goals.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">PCSP Goals</h3>
              <Badge variant="outline" className="text-xs">{goals.length}</Badge>
            </div>
            <GoalsView goals={goals} />
          </div>
        )}

        {questions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Review questions</h3>
              <span className="text-xs text-muted-foreground">Answer before signing</span>
            </div>
            {questions.map((q, idx) => {
              const ans = answers[idx];
              return (
                <div key={q.id} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono text-accent shrink-0 mt-0.5">{q.tab}</span>
                    <p className="text-sm font-medium">{q.prompt}</p>
                  </div>
                  <Textarea
                    placeholder="Your answer..."
                    value={ans?.answer ?? ""}
                    rows={3}
                    onChange={(e) => patchAnswer(idx, { answer: e.target.value, relevant: null, hint: "" })}
                    className={ans?.relevant === false ? "border-destructive" : ""}
                    disabled={alreadyCurrent}
                  />
                  {ans?.checking && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Checking relevance...</p>
                  )}
                  {ans?.relevant === false && ans.hint && (
                    <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{ans.hint}</p>
                  )}
                  {ans?.relevant === true && ans.answer.trim() && (
                    <p className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Looks good.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer className="border-t border-border bg-card px-4 py-3 space-y-2">
        {alreadyCurrent ? (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Completed for the current version on{" "}
            {completion?.completed_at ? new Date(completion.completed_at).toLocaleDateString() : ""}.
          </div>
        ) : (
          <>
            {completion && !pinned && (
              <p className="text-[11px] text-amber-800">
                You previously completed an earlier version. The training has been updated -- please re-attest.
              </p>
            )}
            {questions.length > 0 && !allAnswered && (
              <p className="text-[11px] text-amber-800">
                Please answer all review questions above before signing.
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Attestation:</span> {training.attestation_statement}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <Label htmlFor="sig" className="sr-only">Typed name signature</Label>
                <Input
                  id="sig"
                  placeholder="Type your full name to sign"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  maxLength={120}
                />
              </div>
              <Button
                onClick={() => completeMut.mutate()}
                disabled={completeMut.isPending || anyChecking || signature.trim().length < 3 || !allAnswered}
                className="bg-[image:var(--gradient-brand)] text-primary-foreground"
              >
                {completeMut.isPending || anyChecking
                  ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="mr-1 h-4 w-4" />}
                {completeMut.isPending ? "Saving..." : anyChecking ? "Checking..." : "Sign & Complete"}
              </Button>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
