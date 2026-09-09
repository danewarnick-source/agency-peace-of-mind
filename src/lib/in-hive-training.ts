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

export function inHiveCertificateRef(courseId: InHiveCourseId): string {
  return `inhive:${courseId}:__cert__`;
}

export function isInHiveProgressRef(refId: string): boolean {
  return refId.startsWith("inhive:");
}

/** Official DHHS91172 SOW §1.8(4) letters — do not reorder; progress UUIDs depend on them. */
export const THIRTY_DAY_SOW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVW".split("");

/**
 * Extra SAS 30-day essential topics that are separately completable.
 * Not SOW letters — UUID namespace is `00000001{course}{index}` so A–W stays stable.
 */
export const THIRTY_DAY_EXTRA_CODES = ["PG", "PO", "EV", "MD", "PB", "CB", "DC"] as const;
export type ThirtyDayExtraCode = (typeof THIRTY_DAY_EXTRA_CODES)[number];

export const THIRTY_DAY_EXTRA_UUID_INDEX: Record<ThirtyDayExtraCode, string> = {
  PG: "01",
  PO: "02",
  EV: "03",
  MD: "04",
  PB: "05",
  CB: "06",
  DC: "07",
};

export const THIRTY_DAY_TOPIC_CODES = [...THIRTY_DAY_SOW_LETTERS, ...THIRTY_DAY_EXTRA_CODES];

export const THIRTY_DAY_TOPIC_CITE: Record<string, string> = {
  A: "DHHS91172 SOW §1.8(4)(A) — When to call 911",
  B: "DHHS91172 SOW §1.8(4)(B) — When to call a medical professional",
  C: "DHHS91172 SOW §1.8(4)(C) — When to call a mental health professional",
  D: "DHHS91172 SOW §1.8(4)(D) — Incident reporting",
  E: "DHHS91172 SOW §1.8(4)(E) — Seizure management orientation",
  F: "DHHS91172 SOW §1.8(4)(F) — Whereabouts unknown",
  G: "DHHS91172 SOW §1.8(4)(G) — Choking rescue (not a CPR certificate)",
  H: "DHHS91172 SOW §1.8(4)(H) — Choking and swallowing prevention",
  I: "DHHS91172 SOW §1.8(4)(I) — Positive behavior supports",
  J: "DHHS91172 SOW §1.8(4)(J) — Legal rights and the Americans with Disabilities Act",
  K: "DHHS91172 SOW §1.8(4)(K) — Abuse, neglect, exploitation, and mandatory reporting",
  L: "DHHS91172 SOW §1.8(4)(L) — Confidentiality and the Health Insurance Portability and Accountability Act",
  M: "DHHS91172 SOW §1.8(4)(M) — Orientation to intellectual disability / related conditions and acquired brain injury",
  N: "DHHS91172 SOW §1.8(4)(N) — Communicable disease prevention",
  O: "DHHS91172 SOW §1.8(4)(O) — Person-specific / person-centered support plan awareness",
  P: "DHHS91172 SOW §1.8(4)(P) — Agency policies",
  Q: "DHHS91172 SOW §1.8(4)(Q) — Division of Services for People with Disabilities philosophy",
  R: "DHHS91172 SOW §1.8(4)(R) — Medicaid 101",
  S: "DHHS91172 SOW §1.8(4)(S) — Fraud, waste, and abuse (Utah Office of Inspector General)",
  T: "DHHS91172 SOW §1.8(4)(T) — Home and Community-Based Services Settings Rule",
  U: "DHHS91172 SOW §1.8(4)(U) — Crisis de-escalation",
  V: "DHHS91172 SOW §1.8(4)(V) — Trauma-informed care",
  W: "DHHS91172 SOW §1.8(4)(W) — Suicide prevention",
  PG: "SAS 30-day essential — When to call a parent or guardian",
  PO: "SAS 30-day essential — When to call poison control",
  EV: "SAS 30-day essential — Emergency evacuation, fire, and disaster",
  MD: "SAS 30-day essential — Medications, allergies, and dietary orientation",
  PB: "SAS 30-day essential — Prohibited behavior methods (Utah Administrative Code Rule R539)",
  CB: "SAS 30-day essential — Caregiver burnout and staff wellness",
  DC: "SAS 30-day essential — Department of Health and Human Services Code of Conduct and critical incident policy",
};

/**
 * Live `training_topic_progress.ref_id` / `training_completions.ref_id` are
 * uuid columns. Encode the in-Hive ref as a stable UUID so we do not need a
 * migration. Pattern: a11ce000-1e8f-4000-8000-00000000{course}{topic}.
 * Extra SAS topics use 00000001{course}{index} so A–W UUIDs never change.
 */
export function inHiveRefUuid(courseId: InHiveCourseId, topicCode: string): string {
  const courseByte = courseId === "thirty-day" ? "01" : "02";
  if (topicCode === "__exam__") {
    return `a11ce000-1e8f-4000-8000-00000000${courseByte}ff`;
  }
  if (topicCode === "__cert__") {
    return `a11ce000-1e8f-4000-8000-00000000${courseByte}fe`;
  }
  if (topicCode.length === 1) {
    const topicByte = topicCode.charCodeAt(0).toString(16).padStart(2, "0");
    return `a11ce000-1e8f-4000-8000-00000000${courseByte}${topicByte}`;
  }
  const extraIdx = THIRTY_DAY_EXTRA_UUID_INDEX[topicCode as ThirtyDayExtraCode];
  if (extraIdx) {
    return `a11ce000-1e8f-4000-8000-00000001${courseByte}${extraIdx}`;
  }
  return `a11ce000-1e8f-4000-8000-00000000${courseByte}00`;
}

/** Fisher–Yates copy. Inject `rng` in tests. */
export function shuffleCopy<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const atI = a[i];
    const atJ = a[j];
    if (atI === undefined || atJ === undefined) continue;
    a[i] = atJ;
    a[j] = atI;
  }
  return a;
}

export function allRequiredTopicsComplete(
  topicCodes: readonly string[],
  completed: ReadonlySet<string>,
): boolean {
  return topicCodes.every((c) => completed.has(c));
}

export function completedCodesFromProgress(
  topicCodes: readonly string[],
  map: Record<string, { status: string; position: number } | null | undefined>,
): Set<string> {
  return new Set(topicCodes.filter((code) => map[code]?.status === "completed"));
}

/** Staff checklist / certificate row: Success only after the segment is passed. */
export function topicChecklistLabel(status: string | null | undefined): "Success" | "Open" {
  return status === "completed" ? "Success" : "Open";
}

/** Reviewing a passed topic must not write a new in_progress row. */
export function shouldPersistTopicStep(existingStatus: string | null | undefined): boolean {
  return existingStatus !== "completed";
}

/**
 * Resume-step writes must not land on the complete slide (that races the
 * completed upsert) and must not touch a topic that already passed.
 */
export function shouldPersistResumeStep(args: {
  existingStatus: string | null | undefined;
  destinationStepType: string | null | undefined;
}): boolean {
  if (args.destinationStepType === "complete" || args.destinationStepType === "attest") {
    return false;
  }
  return shouldPersistTopicStep(args.existingStatus);
}

export type TopicProgressWritePlan = {
  apply: boolean;
  status: "in_progress" | "completed";
  /** in_progress updates must skip rows that already say completed. */
  requireOpenRow: boolean;
};

/** Completed always wins. A late in_progress write must not overwrite a pass. */
export function planTopicProgressWrite(args: {
  existingStatus: string | null | undefined;
  requested: "in_progress" | "completed";
}): TopicProgressWritePlan {
  if (args.requested === "in_progress" && args.existingStatus === "completed") {
    return { apply: false, status: "completed", requireOpenRow: true };
  }
  return {
    apply: true,
    status: nextTopicProgressStatus(args.existingStatus, args.requested),
    requireOpenRow: args.requested === "in_progress",
  };
}

export function topicCodesForCourse(courseId: InHiveCourseId): string[] {
  return courseId === "thirty-day" ? [...THIRTY_DAY_TOPIC_CODES] : "ABCDEF".split("");
}

export function staffCourseProgressLabel(completed: number, total: number): string {
  if (total <= 0) return "";
  return `${completed} of ${total} topics passed`;
}

/** Completed-tab copy when the 30-day course is still open. */
export function staffCompletedTabEmptyCopy(args: {
  inProgressCourseTitle: string | null;
  completedTopics: number;
  totalTopics: number;
}): string {
  if (args.inProgressCourseTitle && args.completedTopics > 0 && args.totalTopics > 0) {
    return `${args.inProgressCourseTitle} is still open — ${args.completedTopics} of ${args.totalTopics} topics passed. Finish the remaining topics and the competency exam to complete it. It stays on All until then.`;
  }
  if (args.inProgressCourseTitle) {
    return `${args.inProgressCourseTitle} is still open. Open it from All to continue.`;
  }
  return "Nothing here.";
}

/** End of each SOW segment: 4 of 5 scored beats to pass. */
export const SEGMENT_GATE_TOTAL = 5;
export const SEGMENT_GATE_PASS = 4;

export type SegmentGateResult = {
  correctCount: number;
  total: number;
  passed: boolean;
};

export function scoreSegmentGate(correctFlags: readonly boolean[]): SegmentGateResult {
  if (correctFlags.length >= SEGMENT_GATE_TOTAL) {
    const gate = correctFlags.slice(0, SEGMENT_GATE_TOTAL);
    const correctCount = gate.filter(Boolean).length;
    return {
      correctCount,
      total: SEGMENT_GATE_TOTAL,
      passed: correctCount >= SEGMENT_GATE_PASS,
    };
  }
  const total = correctFlags.length;
  const correctCount = correctFlags.filter(Boolean).length;
  const need = total >= 4 ? 3 : total;
  return { correctCount, total, passed: total > 0 && correctCount >= need };
}

/** Reviewing a passed topic must not un-complete it. */
export function nextTopicProgressStatus(
  existing: string | null | undefined,
  requested: "in_progress" | "completed",
): "in_progress" | "completed" {
  if (existing === "completed") return "completed";
  return requested;
}

export function choiceFollowUp(fb: string): string {
  return fb.replace(/^(Right|Correct|Exactly|Yes)\.\s*/i, "").trim();
}

export type LengthCheckedChoice = { t: string; correct: boolean };

/** True when the correct choice is the unique longest by more than 12 characters. */
export function correctChoiceIsUniquelyLongest(
  options: readonly LengthCheckedChoice[],
): boolean {
  if (options.length < 2) return false;
  const correct = options.find((o) => o.correct);
  if (!correct) return false;
  const others = options.filter((o) => !o.correct);
  if (others.length === 0) return false;
  const maxOther = Math.max(...others.map((o) => o.t.length));
  return correct.t.length > maxOther + 12;
}

export type SegmentProof = {
  kind: "segment-gate";
  topicCode: string;
  correctCount: number;
  total: number;
  passed: boolean;
  completedAt: string;
};

export function buildSegmentProof(args: {
  topicCode: string;
  correctFlags: readonly boolean[];
  completedAt: string;
}): SegmentProof {
  const gate = scoreSegmentGate(args.correctFlags);
  return {
    kind: "segment-gate",
    topicCode: args.topicCode,
    correctCount: gate.correctCount,
    total: gate.total,
    passed: gate.passed,
    completedAt: args.completedAt,
  };
}

export function canIssueThirtyDayCertificate(args: {
  topicCodes: readonly string[];
  completedCodes: ReadonlySet<string>;
  examPassed: boolean;
}): boolean {
  return args.examPassed && allRequiredTopicsComplete(args.topicCodes, args.completedCodes);
}

export type ThirtyDayWritePlan = {
  writeSegmentProof: boolean;
  writeCertificate: boolean;
  writeObligation: boolean;
};

/**
 * What the course player writes after a segment or exam.
 * Certificate + obligation require every required topic completed and a passing exam.
 * TNS / training-only seats skip the office obligation write.
 */
export function planThirtyDayWrites(args: {
  examPassed: boolean;
  topicCodes: readonly string[];
  completedCodes: ReadonlySet<string>;
  skipObligation: boolean;
  alreadyComplete: boolean;
  segmentPassed: boolean;
}): ThirtyDayWritePlan {
  const ready = canIssueThirtyDayCertificate({
    topicCodes: args.topicCodes,
    completedCodes: args.completedCodes,
    examPassed: args.examPassed,
  });
  return {
    writeSegmentProof: args.segmentPassed,
    writeCertificate: ready,
    writeObligation: ready && !args.skipObligation && !args.alreadyComplete,
  };
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
    ? "30-Day Essential Training"
    : "ABI training — before working alone";
}

export function courseCitation(courseId: InHiveCourseId): string {
  return courseId === "thirty-day"
    ? "DHHS91172 SOW §1.8(4)(A)–(W) plus SAS 30-day essential topics"
    : "DHHS91172 SOW §1.8(8)(A)–(F)";
}

export type CertificateTopicLine = {
  code: string;
  title: string;
  sowCite: string;
  passed: boolean;
};

export type ThirtyDayCertificateRecord = {
  courseName: string;
  citation: string;
  staffName: string;
  organizationName: string;
  completedAt: string;
  examPassed: boolean;
  examScorePct: number | null;
  topics: CertificateTopicLine[];
};

export function buildThirtyDayCertificate(args: {
  staffName: string;
  organizationName: string;
  completedAt: string;
  completedCodes: ReadonlySet<string>;
  examPassed: boolean;
  examScorePct?: number | null;
  topicTitles: ReadonlyArray<{ code: string; title: string }>;
}): ThirtyDayCertificateRecord {
  return {
    courseName: courseTitle("thirty-day"),
    citation: courseCitation("thirty-day"),
    staffName: args.staffName.trim() || "Staff",
    organizationName: args.organizationName.trim() || "Provider agency",
    completedAt: args.completedAt,
    examPassed: args.examPassed,
    examScorePct: args.examScorePct ?? null,
    topics: args.topicTitles.map((t) => ({
      code: t.code,
      title: t.title,
      sowCite: THIRTY_DAY_TOPIC_CITE[t.code] ?? `Topic ${t.code}`,
      passed: args.completedCodes.has(t.code),
    })),
  };
}
