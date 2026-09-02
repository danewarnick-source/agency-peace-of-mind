import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, Download, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  TrainingModule,
  thirtyDayTopicsInSowOrder,
  type Topic,
} from "@/components/training/hive-training-engine";
import { ABI_TOPICS } from "@/lib/in-hive-training-abi";
import { examQuestionsFor, examTitleFor } from "@/lib/in-hive-training-exams";
import {
  EXAM_MAX_ATTEMPTS,
  EXAM_PASS_RATIO,
  IN_HIVE_COURSE_EVIDENCE,
  buildExamAnswerRecords,
  courseTitle,
  examLocked,
  examUnlocked,
  formatExamExportCsv,
  remainingExamAttempts,
  scoreExam,
  topicUnlocked,
  type ExamAttemptSnapshot,
  type ExamQuestion,
  type InHiveCourseId,
} from "@/lib/in-hive-training";
import {
  insertInHiveExamAttempt,
  loadInHiveExamAttempts,
  loadInHiveTopicProgress,
  saveInHiveTopicProgress,
} from "@/lib/in-hive-training.functions";
import { recordCompletion } from "@/lib/company-obligations.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const sequential = !import.meta.env.DEV;

type Props = {
  organizationId: string;
  userId: string;
  signedName: string;
  signerEmail: string | null;
  courseId: InHiveCourseId;
  instanceId: string;
  obligationTitle: string;
  alreadyComplete: boolean;
  examResetAfterIso: string | null;
};

function topicsForCourse(courseId: InHiveCourseId): Topic[] {
  return courseId === "thirty-day" ? thirtyDayTopicsInSowOrder() : ABI_TOPICS;
}

export function InHiveCoursePlayer({
  organizationId,
  userId,
  signedName,
  signerEmail,
  courseId,
  instanceId,
  obligationTitle,
  alreadyComplete,
  examResetAfterIso,
}: Props) {
  const qc = useQueryClient();
  const recordFn = useServerFn(recordCompletion);
  const topics = useMemo(() => topicsForCourse(courseId), [courseId]);
  const questions = useMemo(() => examQuestionsFor(courseId), [courseId]);
  const topicCodes = useMemo(() => topics.map((t) => t.code), [topics]);
  const [activeCode, setActiveCode] = useState<string | "exam" | null>(null);

  const progressQ = useQuery({
    queryKey: ["in-hive-progress", userId, courseId],
    queryFn: async () => {
      const rows = await Promise.all(
        topics.map(async (t) => {
          const row = await loadInHiveTopicProgress(userId, courseId, t.code);
          return [t.code, row] as const;
        }),
      );
      return Object.fromEntries(rows) as Record<
        string,
        { status: string; position: number } | null
      >;
    },
  });

  const examQ = useQuery({
    queryKey: ["in-hive-exam", userId, courseId, examResetAfterIso],
    queryFn: () => loadInHiveExamAttempts(userId, courseId, examResetAfterIso),
  });

  const completedCodes = useMemo(() => {
    const map = progressQ.data ?? {};
    return new Set(topics.filter((t) => map[t.code]?.status === "completed").map((t) => t.code));
  }, [progressQ.data, topics]);

  const attempts = examQ.data ?? [];
  const passed = attempts.some((a) => a.passed);
  const failedCount = attempts.filter((a) => !a.passed).length;
  const locked = examLocked(failedCount, passed);
  const examOpen = examUnlocked(topicCodes, completedCodes, sequential) || passed;
  const firstOpen = topics.find((t) => !completedCodes.has(t.code))?.code ?? "exam";

  useEffect(() => {
    if (activeCode !== null) return;
    if (!progressQ.isSuccess) return;
    setActiveCode(alreadyComplete || passed ? "exam" : firstOpen);
  }, [activeCode, alreadyComplete, firstOpen, passed, progressQ.isSuccess]);

  const saveTopic = useMutation({
    mutationFn: saveInHiveTopicProgress,
    onSuccess: (_d, vars) => {
      if (vars.status === "completed") {
        void qc.invalidateQueries({ queryKey: ["in-hive-progress", userId, courseId] });
      }
    },
  });

  const markObligation = useCallback(async () => {
    await recordFn({
      data: {
        organizationId,
        instanceId,
        evidenceTypeUsed: IN_HIVE_COURSE_EVIDENCE,
        attestationSignedAt: new Date().toISOString(),
        attestationTextSnapshot: `${obligationTitle} completed in Provider Interface.`,
      },
    });
  }, [recordFn, organizationId, instanceId, obligationTitle]);

  const finishCourse = useMutation({
    mutationFn: markObligation,
    onSuccess: () => {
      toast.success("Obligation marked complete.");
      void qc.invalidateQueries({ queryKey: ["my-obligation-instances"] });
      void qc.invalidateQueries({ queryKey: ["my-obligation-completions"] });
      void qc.invalidateQueries({ queryKey: ["obligation-instance-context"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitExam = useMutation({
    mutationFn: async (chosenById: Record<string, string>) => {
      const scored = scoreExam(questions, chosenById);
      const snapshot: ExamAttemptSnapshot = {
        attempt: attempts.length + 1,
        scorePct: scored.scorePct,
        correctCount: scored.correctCount,
        total: scored.total,
        passed: scored.passed,
        answers: buildExamAnswerRecords(questions, chosenById),
        completedAt: new Date().toISOString(),
      };
      await insertInHiveExamAttempt({
        userId,
        courseId,
        signedName,
        signerEmail,
        snapshot,
      });
      if (snapshot.passed && !alreadyComplete) {
        await markObligation();
      }
      return snapshot;
    },
    onSuccess: (snap) => {
      void qc.invalidateQueries({ queryKey: ["in-hive-exam"] });
      void qc.invalidateQueries({ queryKey: ["my-obligation-instances"] });
      void qc.invalidateQueries({ queryKey: ["my-obligation-completions"] });
      void qc.invalidateQueries({ queryKey: ["obligation-instance-context"] });
      if (snap.passed) toast.success(`Exam passed at ${snap.scorePct}%.`);
      else if (examLocked(failedCount + 1, false)) {
        toast.error("Three attempts used. An admin must reassign this exam.");
      } else {
        toast.error(`Score ${snap.scorePct}%. Need ${Math.round(EXAM_PASS_RATIO * 100)}% to pass.`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completedOnce = useRef<Set<string>>(new Set());
  const onTopicComplete = useCallback(
    (code: string) => {
      if (completedOnce.current.has(code)) return;
      completedOnce.current.add(code);
      saveTopic.mutate({
        userId,
        courseId,
        topicCode: code,
        status: "completed",
        position: 0,
      });
    },
    [userId, courseId, saveTopic],
  );

  const onStepChange = useCallback(
    (code: string, step: number) => {
      saveTopic.mutate({
        userId,
        courseId,
        topicCode: code,
        status: "in_progress",
        position: step,
      });
    },
    [userId, courseId, saveTopic],
  );

  const goNextAfterTopic = (code: string) => {
    const idx = topicCodes.indexOf(code);
    const next = topics[idx + 1];
    setActiveCode(next ? next.code : "exam");
  };

  const downloadExport = () => {
    const last = [...attempts].reverse().find((a) => a.passed) ?? attempts[attempts.length - 1];
    if (!last) return;
    const csv = formatExamExportCsv({
      courseTitle: examTitleFor(courseId),
      staffName: signedName,
      completedAt: last.completedAt,
      snapshot: last,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${courseId}-exam-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (progressQ.isLoading || examQ.isLoading || activeCode === null) {
    return <p className="text-sm text-muted-foreground p-4">Loading course…</p>;
  }

  const activeTopic = topics.find((t) => t.code === activeCode) ?? null;
  const progressRow = activeTopic ? progressQ.data?.[activeTopic.code] : null;
  const resumeStep =
    progressRow && progressRow.status !== "completed" ? Math.max(0, progressRow.position) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:items-start">
      <aside className="w-full shrink-0 space-y-3 md:sticky md:top-4 md:w-72 lg:w-80">
        <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2" asChild>
          <Link to="/dashboard/my-obligations">
            <ArrowLeft className="h-4 w-4 mr-1" />
            My Obligations
          </Link>
        </Button>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">In-platform course</p>
          <h1 className="text-lg font-semibold leading-tight">{courseTitle(courseId)}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {completedCodes.size} of {topics.length} topics done
            {passed ? " · exam passed" : locked ? " · exam locked" : ""}
          </p>
        </div>
        <nav
          className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible"
          aria-label="Topics"
        >
          {topics.map((t, i) => {
            const done = completedCodes.has(t.code);
            const unlocked = done || topicUnlocked(i, completedCodes, topicCodes, sequential);
            const isActive = activeCode === t.code;
            return (
              <button
                key={t.code}
                type="button"
                disabled={!unlocked}
                onClick={() => unlocked && setActiveCode(t.code)}
                className={cn(
                  "flex min-w-[9.5rem] items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm md:min-w-0",
                  isActive && "border-primary bg-primary/5",
                  !unlocked && "opacity-50",
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                ) : unlocked ? (
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]">
                    {t.code}
                  </span>
                ) : (
                  <Lock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                )}
                <span className="leading-snug font-medium">
                  {t.code}. {t.title}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            disabled={!examOpen}
            onClick={() => examOpen && setActiveCode("exam")}
            className={cn(
              "flex min-w-[9.5rem] items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm md:min-w-0",
              activeCode === "exam" && "border-primary bg-primary/5",
              !examOpen && "opacity-50",
            )}
          >
            {passed ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]">
                EX
              </span>
            )}
            <span className="font-medium">Competency exam</span>
          </button>
        </nav>
        {!sequential && (
          <p className="text-[11px] text-muted-foreground">
            Dev only: topic skip is on. Production is sequential.
          </p>
        )}
      </aside>

      <div className="min-w-0 flex-1">
        {activeTopic && (
          <TrainingModule
            key={activeTopic.code}
            topic={activeTopic}
            onExit={() => undefined}
            onFinished={() => goNextAfterTopic(activeTopic.code)}
            onComplete={() => onTopicComplete(activeTopic.code)}
            skipAttest
            hideAllTopics
            initialStep={resumeStep}
            onStepChange={(step) => onStepChange(activeTopic.code, step)}
          />
        )}
        {activeCode === "exam" && (
          <ExamPane
            title={examTitleFor(courseId)}
            questions={questions}
            attempts={attempts}
            locked={locked}
            passed={passed}
            submitting={submitExam.isPending}
            onSubmit={(answers) => submitExam.mutate(answers)}
            onDownload={downloadExport}
            alreadyComplete={alreadyComplete}
            finishPending={finishCourse.isPending}
            onMarkObligation={() => finishCourse.mutate()}
          />
        )}
      </div>
    </div>
  );
}

function ExamPane({
  title,
  questions,
  attempts,
  locked,
  passed,
  submitting,
  onSubmit,
  onDownload,
  alreadyComplete,
  finishPending,
  onMarkObligation,
}: {
  title: string;
  questions: ExamQuestion[];
  attempts: ExamAttemptSnapshot[];
  locked: boolean;
  passed: boolean;
  submitting: boolean;
  onSubmit: (answers: Record<string, string>) => void;
  onDownload: () => void;
  alreadyComplete: boolean;
  finishPending: boolean;
  onMarkObligation: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const last = attempts[attempts.length - 1];
  const failedCount = attempts.filter((a) => !a.passed).length;
  const triesLeft = remainingExamAttempts(failedCount, passed);

  if (locked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Exam locked</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Three attempts were used without a passing score. An admin must reassign this exam
            before you can try again.
          </p>
          {last && (
            <Button variant="outline" onClick={onDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download attempt record
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (passed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Exam passed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Score {last?.scorePct ?? "—"}%. This obligation is complete when the course is recorded.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download auditor export
            </Button>
            {!alreadyComplete && (
              <Button variant="outline" disabled={finishPending} onClick={onMarkObligation}>
                Record on My Obligations
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            The export includes each question, your answer, correct/incorrect, and the SOW cite.
            Cites are not shown during the test.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          {Math.round(EXAM_PASS_RATIO * 100)}% to pass. {triesLeft}{" "}
          {triesLeft === 1 ? "try" : "tries"} left. No notes during the test.
        </p>
        {questions.map((q, i) => (
          <fieldset key={q.id} className="space-y-2">
            <legend className="text-sm font-medium">
              {i + 1}. {q.stem}
            </legend>
            <div className="space-y-1.5">
              {q.options.map((c) => (
                <label
                  key={c.k}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border p-2.5 text-sm cursor-pointer",
                    answers[q.id] === c.k && "border-primary bg-primary/5",
                  )}
                >
                  <input
                    type="radio"
                    name={q.id}
                    className="mt-1"
                    checked={answers[q.id] === c.k}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: c.k }))}
                  />
                  <span>
                    <span className="font-medium">{c.k}.</span> {c.t}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <Button
          className="w-full sm:w-auto"
          disabled={submitting || Object.keys(answers).length < questions.length}
          onClick={() => onSubmit(answers)}
        >
          {submitting ? "Scoring…" : "Submit exam"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {EXAM_MAX_ATTEMPTS} attempts maximum. An auditor export is available after you submit.
        </p>
      </CardContent>
    </Card>
  );
}
