/**
 * In-Hive staff courses opened from My Obligations.
 * 30-day orientation (SOW §1.8(4)(A)–(W)) and ABI (SOW §1.8(8)(A)–(F)).
 * Progress uses existing training_topic_progress / training_completions.
 */

export const THIRTY_DAY_OBLIGATION_TITLE = "30-Day New Hire Orientation Training";
export const ABI_OBLIGATION_TITLE = "ABI Training — Before Working Alone";

export type InHiveCourseId = "thirty-day" | "abi";

export const IN_HIVE_COURSE_EVIDENCE = "in_hive_course";

export const EXAM_PASS_RATIO = 0.8;
export const EXAM_MAX_ATTEMPTS = 3;

export const IN_HIVE_PROGRESS_KIND = "core" as const;

export function inHiveCourseIdForTitle(title: string): InHiveCourseId | null {
  const t = title.trim();
  if (t === THIRTY_DAY_OBLIGATION_TITLE) return "thirty-day";
  if (t === ABI_OBLIGATION_TITLE || t.startsWith("ABI Training")) return "abi";
  return null;
}

export function isInHiveCourseTitle(title: string): boolean {
  return inHiveCourseIdForTitle(title) !== null;
}

export function inHiveProgressRef(courseId: InHiveCourseId, topicCode: string): string {
  return `inhive:${courseId}:${topicCode}`;
}

export function inHiveExamRef(courseId: InHiveCourseId): string {
  return `inhive:${courseId}:__exam__`;
}

export function isInHiveProgressRef(refId: string): boolean {
  return refId.startsWith("inhive:");
}

/**
 * Live `training_topic_progress.ref_id` / `training_completions.ref_id` are
 * uuid columns. Encode the in-Hive ref as a stable UUID so we do not need a
 * migration. Pattern: a11ce000-1e8f-4000-8000-00000000{course}{topic}.
 */
export function inHiveRefUuid(courseId: InHiveCourseId, topicCode: string): string {
  const courseByte = courseId === "thirty-day" ? "01" : "02";
  const topicByte =
    topicCode === "__exam__"
      ? "ff"
      : topicCode.length === 1
        ? topicCode.charCodeAt(0).toString(16).padStart(2, "0")
        : "00";
  return `a11ce000-1e8f-4000-8000-00000000${courseByte}${topicByte}`;
}

export const EXAM_RESET_PREFIX = "inhive-exam-reset:";

export function appendExamResetNote(
  existing: string | null | undefined,
  staffId: string,
  atIso: string,
): string {
  const line = `${EXAM_RESET_PREFIX}${staffId}:${atIso}`;
  const base = (existing ?? "").trim();
  return base ? `${base}\n${line}` : line;
}

export function lastExamResetAt(
  adminNotes: string | null | undefined,
  staffId: string,
): string | null {
  if (!adminNotes) return null;
  const prefix = `${EXAM_RESET_PREFIX}${staffId}:`;
  let latest: string | null = null;
  for (const line of adminNotes.split("\n")) {
    const t = line.trim();
    if (!t.startsWith(prefix)) continue;
    const iso = t.slice(prefix.length);
    if (!latest || iso > latest) latest = iso;
  }
  return latest;
}

export type ExamOption = { k: string; t: string; correct: boolean };

export type ExamQuestion = {
  id: string;
  topicCode: string;
  stem: string;
  options: ExamOption[];
  /** SOW cite for the auditor export only — never shown during the test. */
  sowCite: string;
};

export type ExamAnswerRecord = {
  questionId: string;
  topicCode: string;
  stem: string;
  chosenKey: string;
  chosenText: string;
  correctKey: string;
  correctText: string;
  correct: boolean;
  sowCite: string;
};

export type ExamAttemptSnapshot = {
  attempt: number;
  scorePct: number;
  correctCount: number;
  total: number;
  passed: boolean;
  answers: ExamAnswerRecord[];
  completedAt: string;
};

export function scoreExam(
  questions: ExamQuestion[],
  chosenById: Record<string, string>,
): { correctCount: number; total: number; scorePct: number; passed: boolean } {
  const total = questions.length;
  if (total === 0) return { correctCount: 0, total: 0, scorePct: 0, passed: false };
  let correctCount = 0;
  for (const q of questions) {
    const chosen = chosenById[q.id];
    const correct = q.options.find((o) => o.correct);
    if (chosen && correct && chosen === correct.k) correctCount += 1;
  }
  const scorePct = Math.round((correctCount / total) * 100);
  return {
    correctCount,
    total,
    scorePct,
    passed: correctCount / total >= EXAM_PASS_RATIO,
  };
}

export function buildExamAnswerRecords(
  questions: ExamQuestion[],
  chosenById: Record<string, string>,
): ExamAnswerRecord[] {
  return questions.map((q) => {
    const correct = q.options.find((o) => o.correct);
    const chosenKey = chosenById[q.id] ?? "";
    const chosen = q.options.find((o) => o.k === chosenKey);
    return {
      questionId: q.id,
      topicCode: q.topicCode,
      stem: q.stem,
      chosenKey,
      chosenText: chosen?.t ?? "(no answer)",
      correctKey: correct?.k ?? "",
      correctText: correct?.t ?? "",
      correct: !!(chosen && correct && chosen.k === correct.k),
      sowCite: q.sowCite,
    };
  });
}

export function examLocked(failedAttempts: number, passed: boolean): boolean {
  return !passed && failedAttempts >= EXAM_MAX_ATTEMPTS;
}

export function remainingExamAttempts(failedAttempts: number, passed: boolean): number {
  if (passed) return 0;
  return Math.max(0, EXAM_MAX_ATTEMPTS - failedAttempts);
}

export function firstIncompleteTopicIndex(
  topicCodes: string[],
  completedCodes: ReadonlySet<string>,
): number {
  const idx = topicCodes.findIndex((c) => !completedCodes.has(c));
  return idx === -1 ? topicCodes.length : idx;
}

export function topicUnlocked(
  topicIndex: number,
  completedCodes: ReadonlySet<string>,
  topicCodes: string[],
  sequential: boolean,
): boolean {
  if (!sequential) return true;
  if (topicIndex <= 0) return true;
  const prev = topicCodes[topicIndex - 1];
  return prev ? completedCodes.has(prev) : true;
}

export function examUnlocked(
  topicCodes: string[],
  completedCodes: ReadonlySet<string>,
  sequential: boolean,
): boolean {
  if (!sequential) return true;
  return topicCodes.every((c) => completedCodes.has(c));
}

export function formatExamExportCsv(args: {
  courseTitle: string;
  staffName: string;
  completedAt: string;
  snapshot: ExamAttemptSnapshot;
}): string {
  const header = [
    "Course",
    "Staff",
    "Completed at",
    "Attempt",
    "Score",
    "Passed",
    "Topic",
    "Question",
    "Their answer",
    "Correct answer",
    "Result",
    "SOW cite",
  ];
  const rows = args.snapshot.answers.map((a) =>
    [
      args.courseTitle,
      args.staffName,
      args.completedAt,
      String(args.snapshot.attempt),
      `${args.snapshot.correctCount}/${args.snapshot.total} (${args.snapshot.scorePct}%)`,
      args.snapshot.passed ? "pass" : "fail",
      a.topicCode,
      a.stem,
      a.chosenText,
      a.correctText,
      a.correct ? "correct" : "incorrect",
      a.sowCite,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

function csvCell(value: string): string {
  const s = value.replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${s}"`;
}

export function courseTitle(courseId: InHiveCourseId): string {
  return courseId === "thirty-day"
    ? "30-day staff orientation"
    : "ABI training — before working alone";
}

export function courseCitation(courseId: InHiveCourseId): string {
  return courseId === "thirty-day" ? "DHHS91172 SOW §1.8(4)(A)–(W)" : "DHHS91172 SOW §1.8(8)(A)–(F)";
}
