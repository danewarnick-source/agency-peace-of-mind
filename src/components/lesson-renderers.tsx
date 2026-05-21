import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  Info,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Play,
  FileText,
  Sparkles,
  RotateCcw,
} from "lucide-react";

export type LessonType =
  | "text"
  | "video"
  | "pdf"
  | "callout"
  | "accordion"
  | "quiz"
  | "scenario"
  | "acknowledgement"
  | "knowledge_check";

export type QuizQuestion = {
  q: string;
  choices: string[];
  correct: number; // index
  explanation?: string;
};

export type QuizData = {
  questions: QuizQuestion[];
  passing_score?: number; // 0-100, default 80
  max_attempts?: number; // default 3
};

export type ScenarioChoice = {
  label: string;
  correct: boolean;
  feedback: string;
};

export type ScenarioData = {
  prompt: string;
  context?: string;
  choices: ScenarioChoice[];
};

export type AccordionData = {
  sections: { title: string; body: string }[];
};

export type CalloutData = {
  variant?: "info" | "warning" | "critical" | "success";
  title?: string;
  body: string;
};

export type AcknowledgementData = {
  statement: string;
  signature_required?: boolean;
};

/* ---------- helpers ---------- */

function videoEmbedUrl(url: string): { src: string; iframe: boolean } {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return { src: `https://www.youtube.com/embed/${yt[1]}`, iframe: true };
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { src: `https://player.vimeo.com/video/${vimeo[1]}`, iframe: true };
  return { src: url, iframe: false };
}

function RichText({ body }: { body: string }) {
  // Lightweight rich-text: preserve newlines, render headings (## ), bullets (- )
  const blocks = body.split(/\n{2,}/);
  return (
    <div className="prose prose-sm max-w-none text-foreground">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        if (lines[0]?.startsWith("## ")) {
          return (
            <h3 key={i} className="text-lg font-semibold tracking-tight">
              {lines[0].slice(3)}
            </h3>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-muted-foreground">
            {block}
          </p>
        );
      })}
    </div>
  );
}

/* ---------- type renderers ---------- */

export function TextLesson({ data }: { data: { body?: string } }) {
  return <RichText body={data.body ?? ""} />;
}

export function VideoLesson({ url, data }: { url: string; data?: { caption?: string } }) {
  const { src, iframe } = videoEmbedUrl(url);
  return (
    <div className="space-y-2">
      <div className="aspect-video overflow-hidden rounded-xl border border-border bg-black">
        {iframe ? (
          <iframe src={src} title="Lesson video" className="h-full w-full" allowFullScreen />
        ) : (
          <video controls src={src} className="h-full w-full" />
        )}
      </div>
      {data?.caption && <p className="text-xs text-muted-foreground">{data.caption}</p>}
    </div>
  );
}

export function PdfLesson({ url }: { url: string }) {
  return (
    <div className="space-y-3">
      <div className="aspect-[4/5] overflow-hidden rounded-xl border border-border bg-secondary md:aspect-[16/10]">
        <iframe src={url} title="Lesson PDF" className="h-full w-full" />
      </div>
      <Button asChild variant="outline" size="sm">
        <a href={url} target="_blank" rel="noreferrer">
          <FileText className="mr-2 h-4 w-4" /> Open PDF
        </a>
      </Button>
    </div>
  );
}

export function CalloutLesson({ data }: { data: CalloutData }) {
  const variant = data.variant ?? "info";
  const Icon =
    variant === "critical"
      ? ShieldAlert
      : variant === "warning"
        ? AlertTriangle
        : variant === "success"
          ? CheckCircle2
          : Info;
  const cls =
    variant === "critical"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : variant === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : variant === "success"
          ? "border-success/40 bg-success/10 text-success"
          : "border-accent/40 bg-accent/10 text-accent";
  return (
    <Alert className={cls}>
      <Icon className="h-4 w-4" />
      {data.title && <AlertTitle>{data.title}</AlertTitle>}
      <AlertDescription className="text-foreground">
        <RichText body={data.body} />
      </AlertDescription>
    </Alert>
  );
}

export function AccordionLesson({ data }: { data: AccordionData }) {
  return (
    <Accordion type="single" collapsible className="rounded-xl border border-border bg-card">
      {data.sections.map((s, i) => (
        <AccordionItem key={i} value={`item-${i}`} className="px-4">
          <AccordionTrigger className="text-sm font-medium">{s.title}</AccordionTrigger>
          <AccordionContent>
            <RichText body={s.body} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function AcknowledgementLesson({
  data,
  onAcknowledge,
  acknowledged,
}: {
  data: AcknowledgementData;
  onAcknowledge: (signature: string) => void;
  acknowledged: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const [signature, setSignature] = useState("");

  if (acknowledged) {
    return (
      <Alert className="border-success/40 bg-success/10 text-success">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Acknowledged</AlertTitle>
        <AlertDescription className="text-foreground">
          You signed off on this section. A record has been added to your training file.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <Sparkles className="h-5 w-5 text-accent" />
      <RichText body={data.statement} />
      <div className="space-y-3 rounded-lg bg-secondary/40 p-4">
        <label className="flex items-start gap-3">
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
          <span className="text-sm">
            I have read, understood, and agree to comply with the policies described above.
          </span>
        </label>
        {data.signature_required !== false && (
          <div>
            <Label htmlFor="sig" className="text-xs">
              Type your full name as signature
            </Label>
            <Input
              id="sig"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Full name"
            />
          </div>
        )}
      </div>
      <Button
        disabled={!checked || (data.signature_required !== false && !signature.trim())}
        onClick={() => onAcknowledge(signature.trim() || "—")}
        className="bg-[image:var(--gradient-brand)] text-primary-foreground"
      >
        Sign & continue
      </Button>
    </div>
  );
}

export function ScenarioLesson({
  data,
  onResolve,
  resolved,
}: {
  data: ScenarioData;
  onResolve: (correct: boolean) => void;
  resolved: boolean;
}) {
  const [picked, setPicked] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent/40 bg-accent/5 p-5">
        <p className="text-xs font-medium text-accent">Scenario</p>
        {data.context && <p className="mt-2 text-sm text-muted-foreground">{data.context}</p>}
        <p className="mt-3 text-sm font-medium">{data.prompt}</p>
      </div>
      <div className="space-y-2">
        {data.choices.map((c, i) => {
          const isPicked = picked === i;
          const reveal = picked !== null && isPicked;
          return (
            <button
              key={i}
              type="button"
              disabled={picked !== null}
              onClick={() => {
                setPicked(i);
                onResolve(c.correct);
              }}
              className={`w-full rounded-xl border p-4 text-left transition ${
                reveal
                  ? c.correct
                    ? "border-success/50 bg-success/10"
                    : "border-destructive/50 bg-destructive/10"
                  : "border-border bg-card hover:bg-secondary/60"
              } ${picked !== null && !isPicked ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-sm font-medium">{String.fromCharCode(65 + i)}.</span>
                <div className="flex-1 text-sm">{c.label}</div>
                {reveal &&
                  (c.correct ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  ))}
              </div>
              {reveal && <p className="mt-2 text-xs text-muted-foreground">{c.feedback}</p>}
            </button>
          );
        })}
      </div>
      {resolved && (
        <p className="text-xs text-muted-foreground">Decision recorded — continue to the next lesson.</p>
      )}
    </div>
  );
}

export function QuizLesson({
  data,
  attempts,
  onSubmit,
  passed,
}: {
  data: QuizData;
  attempts: number;
  passed: boolean;
  onSubmit: (result: {
    score: number;
    total: number;
    passed: boolean;
    answers: { question: number; choice: number }[];
  }) => void;
}) {
  const questions = data.questions ?? [];
  const passingScore = data.passing_score ?? 80;
  const maxAttempts = data.max_attempts ?? 3;
  const remaining = Math.max(0, maxAttempts - attempts);

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState<null | {
    score: number;
    total: number;
    passed: boolean;
  }>(null);

  if (!questions.length) {
    return <p className="text-sm text-muted-foreground">No questions configured.</p>;
  }

  const handleSubmit = () => {
    const total = questions.length;
    const score = questions.reduce(
      (acc, q, i) => (answers[i] === q.correct ? acc + 1 : acc),
      0,
    );
    const pct = Math.round((score / total) * 100);
    const didPass = pct >= passingScore;
    const result = {
      score: pct,
      total,
      passed: didPass,
      answers: Object.entries(answers).map(([q, c]) => ({ question: Number(q), choice: c })),
    };
    setSubmitted({ score: pct, total, passed: didPass });
    onSubmit(result);
  };

  const reset = () => {
    setAnswers({});
    setSubmitted(null);
  };

  const allAnswered = questions.every((_, i) => answers[i] !== undefined);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Knowledge Check</p>
          <p className="text-xs text-muted-foreground">
            Passing score: {passingScore}% · Attempts used: {attempts}/{maxAttempts}
          </p>
        </div>
        {passed && (
          <Badge className="bg-success/15 text-success">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Passed
          </Badge>
        )}
      </div>

      {questions.map((q, i) => {
        const choice = answers[i];
        const isCorrect = submitted && choice === q.correct;
        return (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-medium">
              <span className="text-muted-foreground">Q{i + 1}.</span> {q.q}
            </p>
            <RadioGroup
              value={choice !== undefined ? String(choice) : ""}
              onValueChange={(v) => !submitted && setAnswers((a) => ({ ...a, [i]: Number(v) }))}
              disabled={!!submitted}
            >
              {q.choices.map((opt, j) => {
                const showCorrect = submitted && j === q.correct;
                const showWrong = submitted && choice === j && j !== q.correct;
                return (
                  <Label
                    key={j}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition ${
                      showCorrect
                        ? "border-success/50 bg-success/10"
                        : showWrong
                          ? "border-destructive/50 bg-destructive/10"
                          : "border-border hover:bg-secondary/60"
                    }`}
                  >
                    <RadioGroupItem value={String(j)} />
                    <span className="text-sm">{opt}</span>
                  </Label>
                );
              })}
            </RadioGroup>
            {submitted && q.explanation && (
              <p className={`text-xs ${isCorrect ? "text-success" : "text-muted-foreground"}`}>
                {q.explanation}
              </p>
            )}
          </div>
        );
      })}

      {!submitted ? (
        <Button
          disabled={!allAnswered || remaining <= 0}
          onClick={handleSubmit}
          className="bg-[image:var(--gradient-brand)] text-primary-foreground"
        >
          Submit answers
        </Button>
      ) : (
        <div
          className={`rounded-xl border p-5 ${
            submitted.passed
              ? "border-success/40 bg-success/10"
              : "border-destructive/40 bg-destructive/10"
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold">
                {submitted.passed ? "Passed" : "Did not pass"} — {submitted.score}%
              </p>
              <p className="text-xs text-muted-foreground">
                Need {passingScore}% to pass. Attempts used: {attempts + 1}/{maxAttempts}
              </p>
            </div>
            {!submitted.passed && remaining > 1 && (
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" /> Retry
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LessonTypeBadge({ type }: { type: LessonType }) {
  const map: Record<LessonType, { label: string; cls: string }> = {
    text: { label: "Reading", cls: "" },
    video: { label: "Video", cls: "" },
    pdf: { label: "Document", cls: "" },
    callout: { label: "Callout", cls: "" },
    accordion: { label: "Reference", cls: "" },
    quiz: { label: "Quiz", cls: "bg-accent/15 text-accent border-accent/30" },
    scenario: { label: "Scenario", cls: "bg-accent/15 text-accent border-accent/30" },
    acknowledgement: { label: "Sign-off", cls: "bg-warning/15 text-warning border-warning/30" },
    knowledge_check: { label: "Check", cls: "" },
  };
  const cfg = map[type] ?? map.text;
  return (
    <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>
      {cfg.label}
    </Badge>
  );
}

export function VideoIcon() {
  return <Play className="h-4 w-4" />;
}
