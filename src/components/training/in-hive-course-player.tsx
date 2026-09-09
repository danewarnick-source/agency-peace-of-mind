import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, Circle, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  TrainingModule,
  thirtyDayTopicsInSowOrder,
  type AttestPayload,
  type Topic,
} from "@/components/training/hive-training-engine";
import { ABI_TOPICS } from "@/lib/in-hive-training-abi";
import { examQuestionsFor, examTitleFor } from "@/lib/in-hive-training-exams";
import {
  EXAM_MAX_ATTEMPTS,
  EXAM_PASS_RATIO,
  IN_HIVE_COURSE_EVIDENCE,
  allRequiredTopicsComplete,
  completedCodesFromProgress,
  buildExamAnswerRecords,
  buildThirtyDayCertificate,
  canIssueThirtyDayCertificate,
  courseTitle,
  examLocked,
  examUnlocked,
  remainingExamAttempts,
  scoreExam,
  shuffleCopy,
  topicUnlocked,
  type ExamAttemptSnapshot,
  type ExamQuestion,
  type InHiveCourseId,
  type SegmentProof,
} from "@/lib/in-hive-training";
import { InHiveCertificate } from "@/components/training/in-hive-certificate";
import {
  insertInHiveCourseCertificate,
  insertInHiveExamAttempt,
  insertInHiveSegmentProof,
  loadInHiveCourseProgress,
  loadInHiveExamAttempts,
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
  /** Public training-only seats have no office obligation to close. */
  skipObligation?: boolean;
  organizationName?: string;
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
  skipObligation = false,
  organizationName = "Provider agency",
}: Props) {
  const qc = useQueryClient();
  const recordFn = useServerFn(recordCompletion);
  const topics = useMemo(() => topicsForCourse(courseId), [courseId]);
  const questions = useMemo(() => examQuestionsFor(courseId), [courseId]);
  const topicCodes = useMemo(() => topics.map((t) => t.code), [topics]);
  const [activeCode, setActiveCode] = useState<string | "exam" | null>(null);

  const progressQ = useQuery({
    queryKey: ["in-hive-progress", userId, courseId],
    queryFn: () => loadInHiveCourseProgress(userId, courseId, topicCodes),
  });

  const examQ = useQuery({
    queryKey: ["in-hive-exam", userId, courseId, examResetAfterIso],
    queryFn: () => loadInHiveExamAttempts(userId, courseId, examResetAfterIso),
  });

  const completedCodes = useMemo(
    () => completedCodesFromProgress(topicCodes, progressQ.data ?? {}),
    [progressQ.data, topicCodes],
  );

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

  const persistCertificateIfReady = useCallback(
    async (codes: ReadonlySet<string>, examPassed: boolean, examScorePct: number | null, completedAt: string) => {
      if (courseId !== "thirty-day") return;
      if (!canIssueThirtyDayCertificate({ topicCodes, completedCodes: codes, examPassed })) return;
      await insertInHiveCourseCertificate({
        userId,
        courseId,
        signedName,
        signerEmail,
        certificate: buildThirtyDayCertificate({
          staffName: signedName,
          organizationName,
          completedAt,
          completedCodes: codes,
          examPassed: true,
          examScorePct,
          topicTitles: topics.map((t) => ({ code: t.code, title: t.title })),
        }),
      });
    },
    [courseId, organizationName, signedName, signerEmail, topicCodes, topics, userId],
  );

  const markObligation = useCallback(async (freshCodes?: ReadonlySet<string>) => {
    const codes = freshCodes ?? completedCodesFromProgress(
      topicCodes,
      await loadInHiveCourseProgress(userId, courseId, topicCodes),
    );
    if (!allRequiredTopicsComplete(topicCodes, codes)) return;
    const examAttempts = await loadInHiveExamAttempts(userId, courseId, examResetAfterIso);
    const passedExam = examAttempts.some((a) => a.passed);
    const lastPass = [...examAttempts].reverse().find((a) => a.passed);
    await persistCertificateIfReady(
      codes,
      passedExam,
      lastPass?.scorePct ?? null,
      lastPass?.completedAt ?? new Date().toISOString(),
    );
    if (skipObligation || !organizationId) return;
    await recordFn({
      data: {
        organizationId,
        instanceId,
        evidenceTypeUsed: IN_HIVE_COURSE_EVIDENCE,
        attestationSignedAt: new Date().toISOString(),
        attestationTextSnapshot: `${obligationTitle} completed in Provider Interface.`,
      },
    });
  }, [
    courseId,
    examResetAfterIso,
    instanceId,
    obligationTitle,
    organizationId,
    persistCertificateIfReady,
    recordFn,
    skipObligation,
    topicCodes,
    userId,
  ]);

  const finishCourse = useMutation({
    mutationFn: markObligation,
    onSuccess: () => {
      toast.success("Obligation marked complete.");
      void qc.invalidateQueries({ queryKey: ["my-obligation-instances"] });
      void qc.invalidateQueries({ queryKey: ["my-obligation-completions"] });
      void qc.invalidateQueries({ queryKey: ["obligation-instance-context"] });
      void qc.invalidateQueries({ queryKey: ["obligation-pack-matrix"] });
      void qc.invalidateQueries({ queryKey: ["company-obligations"] });
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
      if (snapshot.passed) {
        const fresh = completedCodesFromProgress(
          topicCodes,
          await loadInHiveCourseProgress(userId, courseId, topicCodes),
        );
        if (!alreadyComplete) {
          await markObligation(fresh);
        } else {
          await persistCertificateIfReady(
            fresh,
            true,
            snapshot.scorePct,
            snapshot.completedAt,
          );
        }
      }
      return snapshot;
    },
    onSuccess: (snap) => {
      void qc.invalidateQueries({ queryKey: ["in-hive-exam"] });
      void qc.invalidateQueries({ queryKey: ["in-hive-progress", userId, courseId] });
      void qc.invalidateQueries({ queryKey: ["my-obligation-instances"] });
      void qc.invalidateQueries({ queryKey: ["my-obligation-completions"] });
      void qc.invalidateQueries({ queryKey: ["obligation-instance-context"] });
      void qc.invalidateQueries({ queryKey: ["obligation-pack-matrix"] });
      void qc.invalidateQueries({ queryKey: ["company-obligations"] });
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
    (code: string, payload?: AttestPayload) => {
      if (completedCodes.has(code) || completedOnce.current.has(code)) return;
      completedOnce.current.add(code);
      const completedAt = new Date().toISOString();
      const proof: SegmentProof | null = payload?.segment
        ? {
            kind: "segment-gate",
            topicCode: code,
            correctCount: payload.segment.correctCount,
            total: payload.segment.total,
            passed: payload.segment.passed,
            completedAt,
          }
        : null;
      void (async () => {
        await saveInHiveTopicProgress({
          userId,
          courseId,
          topicCode: code,
          status: "completed",
          position: 0,
        });
        if (proof?.passed) {
          await insertInHiveSegmentProof({
            userId,
            courseId,
            topicCode: code,
            signedName,
            signerEmail,
            proof,
          });
        }
        void qc.invalidateQueries({ queryKey: ["in-hive-progress", userId, courseId] });
      })();
    },
    [completedCodes, courseId, qc, signedName, signerEmail, userId],
  );

  const onStepChange = useCallback(
    (code: string, step: number) => {
      if (completedCodes.has(code)) return;
      saveTopic.mutate({
        userId,
        courseId,
        topicCode: code,
        status: "in_progress",
        position: step,
      });
    },
    [completedCodes, courseId, saveTopic, userId],
  );

  const goNextAfterTopic = (code: string) => {
    const idx = topicCodes.indexOf(code);
    const next = topics[idx + 1];
    setActiveCode(next ? next.code : "exam");
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
        {skipObligation ? (
          <p className="text-xs text-muted-foreground">Training-only course</p>
        ) : (
          <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2" asChild>
            <Link to="/dashboard/my-obligations">
              <ArrowLeft className="h-4 w-4 mr-1" />
              My Compliance
            </Link>
          </Button>
        )}
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
            const unlocked =
              done ||
              alreadyComplete ||
              passed ||
              topicUnlocked(i, completedCodes, topicCodes, sequential);
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
                  <Circle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Lock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                )}
                <span className="leading-snug">
                  <span className="font-medium">
                    {done ? "Success" : "Open"} · {t.code}. {t.title}
                  </span>
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
            key={`${activeTopic.code}-${completedCodes.has(activeTopic.code) ? "review" : "take"}`}
            topic={activeTopic}
            onExit={() => setActiveCode(passed || alreadyComplete ? "exam" : firstOpen)}
            onFinished={() => goNextAfterTopic(activeTopic.code)}
            onComplete={(payload) => onTopicComplete(activeTopic.code, payload)}
            skipAttest
            hideAllTopics
            readOnly={completedCodes.has(activeTopic.code)}
            initialStep={completedCodes.has(activeTopic.code) ? 0 : resumeStep}
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
            alreadyComplete={alreadyComplete}
            finishPending={finishCourse.isPending}
            onMarkObligation={() => finishCourse.mutate()}
            hideObligation={skipObligation}
            certificate={
              courseId === "thirty-day"
                ? buildThirtyDayCertificate({
                    staffName: signedName,
                    organizationName,
                    completedAt:
                      [...attempts].reverse().find((a) => a.passed)?.completedAt ??
                      new Date().toISOString(),
                    completedCodes,
                    examPassed: passed,
                    examScorePct: [...attempts].reverse().find((a) => a.passed)?.scorePct ?? null,
                    topicTitles: topics.map((t) => ({ code: t.code, title: t.title })),
                  })
                : null
            }
            certificateIssued={
              courseId === "thirty-day" &&
              canIssueThirtyDayCertificate({
                topicCodes,
                completedCodes,
                examPassed: passed,
              })
            }
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
  alreadyComplete,
  finishPending,
  onMarkObligation,
  hideObligation = false,
  certificate,
  certificateIssued,
}: {
  title: string;
  questions: ExamQuestion[];
  attempts: ExamAttemptSnapshot[];
  locked: boolean;
  passed: boolean;
  submitting: boolean;
  onSubmit: (answers: Record<string, string>) => void;
  alreadyComplete: boolean;
  finishPending: boolean;
  onMarkObligation: () => void;
  hideObligation?: boolean;
  certificate: ReturnType<typeof buildThirtyDayCertificate> | null;
  certificateIssued: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [shuffled, setShuffled] = useState(() =>
    questions.map((q) => ({ ...q, options: shuffleCopy(q.options) })),
  );
  useEffect(() => {
    setShuffled(questions.map((q) => ({ ...q, options: shuffleCopy(q.options) })));
    setAnswers({});
  }, [attempts.length, questions]);
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
          <p className="text-xs text-muted-foreground">
            Your attempts are saved on your staff file. An administrator can download the
            auditor export if one is needed.
          </p>
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
          <p>
            Score {last?.scorePct ?? "—"}%.
            {hideObligation
              ? " Course complete."
              : certificateIssued
                ? " This obligation is complete when the course is recorded."
                : " Finish every topic on the checklist, then record the obligation."}
          </p>
          {certificate && (
            <InHiveCertificate record={certificate} issued={certificateIssued} />
          )}
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            Completion is submitted and saved on your staff file. An administrator can
            download the auditor export if one is needed. You can reopen any topic above to
            review the material anytime.
          </div>
          {!alreadyComplete && !hideObligation && certificateIssued && (
            <Button variant="outline" disabled={finishPending} onClick={onMarkObligation}>
              Record on My Compliance
            </Button>
          )}
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
        {shuffled.map((q, i) => (
          <fieldset key={q.id} className="space-y-2">
            <legend className="text-sm font-medium">
              {i + 1}. {q.stem}
            </legend>
            <div className="space-y-1.5">
              {q.options.map((c, oi) => {
                const label = String.fromCharCode(65 + oi);
                return (
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
                    <span className="font-medium">{label}.</span> {c.t}
                  </span>
                </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <Button
          className="w-full sm:w-auto"
          disabled={submitting || Object.keys(answers).length < shuffled.length}
          onClick={() => onSubmit(answers)}
        >
          {submitting ? "Scoring…" : "Submit exam"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {EXAM_MAX_ATTEMPTS} attempts maximum. Results are saved on your staff file.
        </p>
      </CardContent>
    </Card>
  );
}
