/**
 * Person-centered foundations — hire-level in-Hive course.
 * Answer keys live only in person-centered-training-content.json and are
 * scored on the server. This module never imports that file.
 */
import { PCT_HIRE_COURSE_TITLE } from "./client-form-obligations.ts";

export const PCT_COURSE_ID = "pi-person-centered-foundations" as const;
export const PCT_COURSE_TITLE = "Person-centered thinking in everyday support";
export const PCT_OBLIGATION_TITLE = PCT_HIRE_COURSE_TITLE;

/** Course button is on the hire-level PCT card. Flip off to hide Open course. */
export const PCT_IN_HIVE_COURSE_ENABLED = true;

/** Passing the exam does not write SOW evidence until this is released. */
export const PCT_COURSE_FULFILLS_OBLIGATION = false;

export const PCT_PASS_SCORE = 12;
export const PCT_EXAM_TOTAL = 15;
export const PCT_TOPIC_CODES = ["A", "B", "C", "D", "E", "F"] as const;

export const PCT_ATTRIBUTION =
  "This is Provider Interface education informed by NCAPPS resources. It is not official NCAPPS training and does not replace a person's plan or the per-client Person-Centered Thinking form.";

export const PCT_LESSON_ID_TO_CODE: Record<string, (typeof PCT_TOPIC_CODES)[number]> = {
  start: "A",
  whole: "B",
  choice: "C",
  community: "D",
  team: "E",
  follow: "F",
};

export function isPctHireObligationTitle(title: string): boolean {
  const t = title.trim();
  return t === PCT_OBLIGATION_TITLE || t.startsWith("Person-Centered Thinking and Practices");
}

export type PctContentSource = {
  id: string;
  title: string;
  url: string;
  note: string;
};

export type PctContentLesson = {
  id: string;
  title: string;
  kicker: string;
  minutes: number;
  objective: string;
  intro: string;
  source: string;
  principles: [string, string][];
  scene: string;
  context: string;
  takeaway: string;
  question: string;
  options: string[];
  correct: number;
  feedback: string[];
};

export type PctContentQuizItem = {
  id: string;
  lesson: string;
  q: string;
  options: string[];
  correct: number;
  why: string;
};

export type PctContentFile = {
  id: string;
  version: string;
  title: string;
  passScore: number;
  estimatedMinutes: number;
  sources: PctContentSource[];
  lessons: PctContentLesson[];
  quiz: PctContentQuizItem[];
};

export type PctPublicSource = {
  id: string;
  title: string;
  url: string;
  note: string;
};

export type PctPublicLesson = {
  id: string;
  code: string;
  title: string;
  kicker: string;
  minutes: number;
  objective: string;
  intro: string;
  principles: [string, string][];
  scene: string;
  context: string;
  takeaway: string;
  question: string;
  options: string[];
  sourceTitle: string;
  sourceNote: string;
};

export type PctPublicQuizItem = {
  id: string;
  lesson: string;
  topicCode: string;
  stem: string;
  options: string[];
};

export type PctPublicCourse = {
  courseId: typeof PCT_COURSE_ID;
  title: string;
  version: string;
  estimatedMinutes: number;
  passScore: number;
  examTotal: number;
  maxAttempts: number;
  attribution: string;
  fulfillsObligation: boolean;
  sources: PctPublicSource[];
  lessons: PctPublicLesson[];
};

export function publicCourseFromContent(content: PctContentFile): PctPublicCourse {
  const sourceById = new Map(content.sources.map((s) => [s.id, s]));
  return {
    courseId: PCT_COURSE_ID,
    title: content.title,
    version: content.version,
    estimatedMinutes: content.estimatedMinutes,
    passScore: content.passScore,
    examTotal: content.quiz.length,
    maxAttempts: 3,
    attribution: PCT_ATTRIBUTION,
    fulfillsObligation: PCT_COURSE_FULFILLS_OBLIGATION,
    sources: content.sources.map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      note: s.note,
    })),
    lessons: content.lessons.map((lesson) => {
      const src = sourceById.get(lesson.source);
      return {
        id: lesson.id,
        code: PCT_LESSON_ID_TO_CODE[lesson.id] ?? "A",
        title: lesson.title,
        kicker: lesson.kicker,
        minutes: lesson.minutes,
        objective: lesson.objective,
        intro: lesson.intro,
        principles: lesson.principles,
        scene: lesson.scene,
        context: lesson.context,
        takeaway: lesson.takeaway,
        question: lesson.question,
        options: lesson.options,
        sourceTitle: src?.title ?? "NCAPPS-informed source",
        sourceNote: src?.note ?? "",
      };
    }),
  };
}

export function publicQuizFromContent(content: PctContentFile): PctPublicQuizItem[] {
  return content.quiz.map((item) => ({
    id: item.id,
    lesson: item.lesson,
    topicCode: PCT_LESSON_ID_TO_CODE[item.lesson] ?? "A",
    stem: item.q,
    options: item.options,
  }));
}

export function pctTopicsFromPublic(lessons: readonly PctPublicLesson[]) {
  return lessons.map((lesson) => ({
    code: lesson.code,
    title: lesson.title,
    category: "PCT",
    status: "ready",
    estMin: lesson.minutes,
    intro: lesson.intro,
    steps: [
      {
        type: "lesson",
        kicker: lesson.kicker,
        title: lesson.title,
        lead: lesson.intro,
        facts: lesson.principles.map(([t, b]) => ({ t, b })),
        dropHeading: "Objective",
        drops: [["This topic", lesson.objective]],
      },
      {
        type: "lesson",
        kicker: "Scene",
        title: "A fictional support moment",
        lead: lesson.context,
        callout: { v: "info", t: "What they said", b: lesson.scene },
        facts: [{ t: "Takeaway.", b: lesson.takeaway }],
        dropHeading: "Source",
        drops: [[lesson.sourceTitle, lesson.sourceNote || "NCAPPS-informed Provider Interface education."]],
      },
    ],
    attest: "",
  }));
}

export function gradePctFormative(
  content: PctContentFile,
  lessonId: string,
  chosenIndex: number,
): { passed: boolean; feedback: string } {
  const lesson = content.lessons.find((l) => l.id === lessonId);
  if (!lesson) return { passed: false, feedback: "That topic is not in this course." };
  if (!Number.isInteger(chosenIndex) || chosenIndex < 0 || chosenIndex >= lesson.options.length) {
    return { passed: false, feedback: "Choose one of the listed answers." };
  }
  const passed = chosenIndex === lesson.correct;
  const feedback = lesson.feedback[chosenIndex] ?? (passed ? "That is the stronger response." : "Try again.");
  return { passed, feedback };
}

export function gradePctExam(
  content: PctContentFile,
  chosenById: Record<string, number>,
): {
  correctCount: number;
  total: number;
  scorePct: number;
  passed: boolean;
  answers: Array<{
    questionId: string;
    topicCode: string;
    stem: string;
    chosenKey: string;
    chosenText: string;
    correctKey: string;
    correctText: string;
    correct: boolean;
    sowCite: string;
  }>;
} {
  const total = content.quiz.length;
  let correctCount = 0;
  const answers = content.quiz.map((item) => {
    const chosen = chosenById[item.id];
    const chosenOk = Number.isInteger(chosen);
    const isCorrect = chosenOk && chosen === item.correct;
    if (isCorrect) correctCount += 1;
    const chosenText =
      chosenOk && chosen !== undefined && item.options[chosen] !== undefined
        ? item.options[chosen]
        : "(no answer)";
    return {
      questionId: item.id,
      topicCode: PCT_LESSON_ID_TO_CODE[item.lesson] ?? "A",
      stem: item.q,
      chosenKey: chosenOk ? String(chosen) : "",
      chosenText,
      correctKey: String(item.correct),
      correctText: item.options[item.correct] ?? "",
      correct: isCorrect,
      sowCite: "NCAPPS-informed · hire-level PCT",
    };
  });
  const scorePct = total === 0 ? 0 : Math.round((correctCount / total) * 100);
  return {
    correctCount,
    total,
    scorePct,
    passed: correctCount >= content.passScore,
    answers,
  };
}
