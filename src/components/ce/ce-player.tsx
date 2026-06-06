// CE module player — active-time timer + completion gates + e-signature.
// Phase 1 of Continuing Education. Mobile-friendly.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { saveCeProgress, completeCeModule, type CeModule, type CeStep, type CeStepCheck } from "@/lib/ce.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, Circle, Pause, Play, Save, Lock, AlertCircle } from "lucide-react";
import { SourceCitationChip } from "@/components/nectar/source-citation-chip";

interface Props {
  module: CeModule;
  minActiveMinutes: number;
  onClose: () => void;
  onCompleted: () => void;
}

const ATTESTATION = `I attest that I personally completed the agency's Continuing Education review for this period, drawn from the agency's Authoritative Sources (state requirements, the provider's policies & procedures, and applicable person-specific care plans) and from my own factual event records. I understood the material and will apply it in my work supporting people with disabilities. I understand this attestation is a legally meaningful electronic signature under the federal ESIGN Act and applicable state Uniform Electronic Transactions Act, and that this record is retained for audit purposes. The platform organizes what the agency uploads but does not independently verify accuracy or guarantee compliance.`;

const IDLE_LIMIT_MS = 90_000;
const TICK_MS = 1_000;
const SAVE_INTERVAL_MS = 15_000;

export function CePlayer({ module, minActiveMinutes, onClose, onCompleted }: Props) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveCeProgress);
  const completeFn = useServerFn(completeCeModule);

  const [steps] = useState<CeStep[]>(module.steps);
  const [currentStep, setCurrentStep] = useState<number>(module.current_step ?? 0);
  const [activeSeconds, setActiveSeconds] = useState<number>(module.active_seconds ?? 0);
  const [reflections, setReflections] = useState<Record<string, string>>(
    (module.reflections as Record<string, string>) ?? {},
  );
  const [viewed, setViewed] = useState<Set<number>>(new Set([module.current_step ?? 0]));
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showSig, setShowSig] = useState(false);
  const [sigName, setSigName] = useState("");

  const lastInteractionRef = useRef<number>(Date.now());
  const visibleRef = useRef<boolean>(typeof document !== "undefined" ? !document.hidden : true);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reflectIndex = useMemo(() => steps.findIndex((s) => s.type === "reflect"), [steps]);
  const checkIndices = useMemo(() => steps.map((s, i) => (s.type === "check" ? i : -1)).filter((i) => i >= 0), [steps]);

  // Mark step viewed when navigating.
  useEffect(() => { setViewed((v) => { const n = new Set(v); n.add(currentStep); return n; }); }, [currentStep]);

  // Interaction listeners.
  useEffect(() => {
    const mark = () => { lastInteractionRef.current = Date.now(); };
    const onVis = () => { visibleRef.current = !document.hidden; mark(); };
    const ev = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    ev.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ev.forEach((e) => window.removeEventListener(e, mark));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Active-time tick.
  useEffect(() => {
    tickRef.current = setInterval(() => {
      const idle = Date.now() - lastInteractionRef.current > IDLE_LIMIT_MS;
      if (visibleRef.current && !idle) setActiveSeconds((s) => s + 1);
    }, TICK_MS);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // Periodic save.
  const lastSavedRef = useRef<number>(activeSeconds);
  useEffect(() => {
    const iv = setInterval(() => {
      if (activeSeconds === lastSavedRef.current) return;
      lastSavedRef.current = activeSeconds;
      saveFn({ data: { moduleId: module.id, activeSeconds, currentStep, reflections } }).catch(() => {});
    }, SAVE_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [activeSeconds, currentStep, reflections, module.id, saveFn]);

  const isPaused = !visibleRef.current || Date.now() - lastInteractionRef.current > IDLE_LIMIT_MS;
  const minSec = minActiveMinutes * 60;
  const reflectText = (reflections[String(reflectIndex)] ?? "").trim();
  const allViewed = steps.every((_, i) => viewed.has(i));
  const allChecksCorrect = checkIndices.every((i) => {
    const s = steps[i] as CeStepCheck;
    const a = answers[i];
    return typeof a === "number" && s.options[a]?.correct;
  });
  const reflectionOk = reflectText.length >= 150;
  const timeOk = activeSeconds >= minSec;
  const canComplete = allViewed && allChecksCorrect && reflectionOk && timeOk;

  const saveAndClose = async () => {
    await saveFn({ data: { moduleId: module.id, activeSeconds, currentStep, reflections } });
    toast.success("Progress saved.");
    qc.invalidateQueries({ queryKey: ["ce-status"] });
    onClose();
  };

  const completeMut = useMutation({
    mutationFn: () =>
      completeFn({
        data: {
          moduleId: module.id,
          signatureName: sigName,
          attestationText: ATTESTATION,
          activeSeconds,
          reflections,
        },
      }),
    onSuccess: () => {
      toast.success("Hour credited to your CE ledger.");
      qc.invalidateQueries({ queryKey: ["ce-status"] });
      onCompleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const step = steps[currentStep];

  const mm = String(Math.floor(activeSeconds / 60)).padStart(2, "0");
  const ss = String(activeSeconds % 60).padStart(2, "0");
  const goalMin = String(minActiveMinutes).padStart(2, "0");
  const remainMin = Math.max(0, Math.ceil((minSec - activeSeconds) / 60));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Continuing Education</div>
            <div className="truncate text-sm font-semibold">Monthly Review · {module.period}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isPaused ? "secondary" : "default"} className="gap-1">
              {isPaused ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              <span className="font-mono">{mm}:{ss} / {goalMin}:00</span>
            </Badge>
            <Button size="sm" variant="outline" onClick={saveAndClose} className="gap-1">
              <Save className="h-3 w-3" /> Save & close
            </Button>
          </div>
        </div>
        {!timeOk && (
          <div className="mx-auto mt-2 max-w-3xl text-xs text-muted-foreground">
            You've logged {mm}:{ss} of ~{goalMin}:00 — about {remainMin} more minute{remainMin === 1 ? "" : "s"} of material remaining before this hour can be credited.
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Stepper */}
          <div className="flex flex-wrap gap-1">
            {steps.map((s, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`flex h-7 min-w-7 items-center gap-1 rounded-full px-2 text-xs font-semibold transition ${
                  i === currentStep
                    ? "bg-primary text-primary-foreground"
                    : viewed.has(i)
                    ? "bg-muted text-foreground"
                    : "bg-muted/40 text-muted-foreground"
                }`}
                aria-label={`Step ${i + 1}`}
              >
                {viewed.has(i) ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                {i + 1}
              </button>
            ))}
          </div>

          {step && <StepView step={step} index={currentStep} reflections={reflections} setReflections={setReflections} answers={answers} setAnswers={setAnswers} />}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button variant="outline" disabled={currentStep === 0} onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
            {currentStep < steps.length - 1 ? (
              <Button onClick={() => setCurrentStep((s) => Math.min(steps.length - 1, s + 1))}>Next</Button>
            ) : showSig ? null : (
              <Button onClick={() => setShowSig(true)} disabled={!canComplete} className="gap-1">
                {canComplete ? null : <Lock className="h-4 w-4" />}
                Sign & complete
              </Button>
            )}
          </div>

          {/* Completion gate panel */}
          {currentStep === steps.length - 1 && !canComplete && (
            <Card className="border-amber-300/40 bg-amber-50/40 p-4 text-sm dark:bg-amber-900/10">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4 text-amber-700" /> Before you can sign:
              </div>
              <ul className="space-y-1 text-muted-foreground">
                <li>{allViewed ? "✅" : "•"} View every section</li>
                <li>{allChecksCorrect ? "✅" : "•"} Answer every scenario correctly ({Object.keys(answers).filter((k) => {
                  const i = Number(k); const s = steps[i] as CeStepCheck; return s?.options?.[answers[i]]?.correct;
                }).length}/{checkIndices.length})</li>
                <li>{reflectionOk ? "✅" : "•"} Write a reflection of at least 150 characters ({reflectText.length}/150)</li>
                <li>{timeOk ? "✅" : "•"} Log {minActiveMinutes} minutes of active time ({Math.floor(activeSeconds / 60)}/{minActiveMinutes} min)</li>
              </ul>
            </Card>
          )}

          {showSig && canComplete && (
            <Card className="space-y-3 p-4">
              <div className="text-sm font-semibold">Sign & complete</div>
              <p className="text-xs text-muted-foreground whitespace-pre-line">{ATTESTATION}</p>
              <Input
                placeholder="Type your full legal name"
                value={sigName}
                onChange={(e) => setSigName(e.target.value)}
                aria-label="Typed signature"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSig(false)}>Cancel</Button>
                <Button onClick={() => completeMut.mutate()} disabled={sigName.trim().length < 2 || completeMut.isPending}>
                  {completeMut.isPending ? "Signing…" : "Sign & credit this hour"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function StepView({
  step, index, reflections, setReflections, answers, setAnswers,
}: {
  step: CeStep;
  index: number;
  reflections: Record<string, string>;
  setReflections: (r: Record<string, string>) => void;
  answers: Record<number, number>;
  setAnswers: (r: Record<number, number>) => void;
}) {
  if (step.type === "nectar") {
    return (
      <Card className="border-accent/40 bg-accent/5 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-accent">From NECTAR</div>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{step.body}</p>
      </Card>
    );
  }
  if (step.type === "lesson") {
    return (
      <Card className="space-y-3 p-5">
        {step.kicker && <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{step.kicker}</div>}
        <h2 className="text-lg font-semibold tracking-tight">{step.title}</h2>
        <SourceCitationChip citation={step.citation ?? null} />
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{step.body}</p>
        {step.facts && step.facts.length > 0 && (
          <ul className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
            {step.facts.map(([lead, detail], i) => (
              <li key={i}><span className="font-semibold">{lead}.</span> <span className="text-muted-foreground">{detail}</span></li>
            ))}
          </ul>
        )}
      </Card>
    );
  }
  if (step.type === "check") {
    const chosen = answers[index];
    const chosenOpt = typeof chosen === "number" ? step.options[chosen] : null;
    return (
      <Card className="space-y-3 p-5">
        {step.kicker && <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{step.kicker}</div>}
        <h2 className="text-base font-semibold">{step.stem}</h2>
        <div className="space-y-2">
          {step.options.map((o, i) => {
            const isChosen = chosen === i;
            const reveal = isChosen;
            return (
              <button
                key={i}
                onClick={() => setAnswers({ ...answers, [index]: i })}
                className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                  isChosen
                    ? o.correct
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-destructive/60 bg-destructive/10"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="font-semibold">{o.label}. {o.text}</div>
                {reveal && (
                  <div className={`mt-1 text-xs ${o.correct ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>
                    {o.correct ? "Correct — " : "Not quite — "}{o.feedback}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {chosenOpt && !chosenOpt.correct && (
          <p className="text-xs text-muted-foreground">Pick again — try another option.</p>
        )}
      </Card>
    );
  }
  // reflect
  return (
    <Card className="space-y-3 p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{step.kicker ?? "Reflection"}</div>
      <p className="text-sm">{step.prompt}</p>
      <Textarea
        rows={6}
        value={reflections[String(index)] ?? ""}
        onChange={(e) => setReflections({ ...reflections, [String(index)]: e.target.value })}
        placeholder="Write at least 150 characters about what you'll do differently…"
      />
      <div className="text-right text-xs text-muted-foreground">
        {(reflections[String(index)] ?? "").length}/150
      </div>
    </Card>
  );
}
