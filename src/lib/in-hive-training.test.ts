import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ABI_OBLIGATION_TITLE,
  EXAM_MAX_ATTEMPTS,
  THIRTY_DAY_OBLIGATION_TITLE,
  buildExamAnswerRecords,
  examLocked,
  examUnlocked,
  firstIncompleteTopicIndex,
  formatExamExportCsv,
  appendExamResetNote,
  inHiveCourseIdForTitle,
  inHiveExamRef,
  inHiveProgressRef,
  inHiveRefUuid,
  lastExamResetAt,
  remainingExamAttempts,
  scoreExam,
  topicUnlocked,
  type ExamQuestion,
} from "./in-hive-training.ts";
import { examQuestionsFor } from "./in-hive-training-exams.ts";

const Q: ExamQuestion[] = [
  {
    id: "q1",
    topicCode: "A",
    stem: "What first?",
    options: [
      { k: "A", t: "Wait", correct: false },
      { k: "B", t: "Call 911", correct: true },
    ],
    sowCite: "1.8(4)(A)",
  },
  {
    id: "q2",
    topicCode: "B",
    stem: "Fever?",
    options: [
      { k: "A", t: "Nurse line", correct: true },
      { k: "B", t: "Ignore", correct: false },
    ],
    sowCite: "1.8(4)(B)",
  },
];

describe("inHiveCourseIdForTitle", () => {
  it("maps the seeded 30-day and ABI obligation titles", () => {
    assert.equal(inHiveCourseIdForTitle(THIRTY_DAY_OBLIGATION_TITLE), "thirty-day");
    assert.equal(inHiveCourseIdForTitle(ABI_OBLIGATION_TITLE), "abi");
    assert.equal(inHiveCourseIdForTitle("ABI Training — extra"), "abi");
    assert.equal(inHiveCourseIdForTitle("CPR/First Aid Certification — Initial"), null);
  });
});

describe("progress refs", () => {
  it("namespaces topic and exam rows so they do not collide with topic UUIDs", () => {
    assert.equal(inHiveProgressRef("thirty-day", "A"), "inhive:thirty-day:A");
    assert.equal(inHiveExamRef("abi"), "inhive:abi:__exam__");
    assert.equal(inHiveRefUuid("thirty-day", "A"), "a11ce000-1e8f-4000-8000-000000000141");
    assert.equal(inHiveRefUuid("abi", "__exam__"), "a11ce000-1e8f-4000-8000-0000000002ff");
    assert.notEqual(inHiveRefUuid("thirty-day", "A"), inHiveRefUuid("abi", "A"));
  });
});

describe("exam reset notes", () => {
  it("records a per-staff reset timestamp without wiping other notes", () => {
    const next = appendExamResetNote("keep this", "staff-1", "2026-08-31T12:00:00.000Z");
    assert.match(next, /keep this/);
    assert.equal(lastExamResetAt(next, "staff-1"), "2026-08-31T12:00:00.000Z");
    assert.equal(lastExamResetAt(next, "staff-2"), null);
  });
});

describe("exam coverage", () => {
  it("covers every 30-day letter and every ABI letter", () => {
    const thirty = examQuestionsFor("thirty-day");
    const abi = examQuestionsFor("abi");
    const thirtyLetters = new Set(thirty.map((q) => q.topicCode));
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVW") {
      assert.ok(thirtyLetters.has(letter), `missing 30-day exam item for ${letter}`);
    }
    const abiLetters = new Set(abi.map((q) => q.topicCode));
    for (const letter of "ABCDEF") {
      assert.ok(abiLetters.has(letter), `missing ABI exam item for ${letter}`);
    }
    assert.ok(thirty.every((q) => q.sowCite.startsWith("1.8(4)")));
    assert.ok(abi.every((q) => q.sowCite.startsWith("1.8(8)")));
  });
});

describe("scoreExam", () => {
  it("requires 80% and never rounds a summed total", () => {
    const allRight = scoreExam(Q, { q1: "B", q2: "A" });
    assert.equal(allRight.passed, true);
    assert.equal(allRight.scorePct, 100);

    const half = scoreExam(Q, { q1: "B", q2: "B" });
    assert.equal(half.passed, false);
    assert.equal(half.correctCount, 1);
    assert.equal(half.scorePct, 50);

    const eightOfTen: ExamQuestion[] = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      topicCode: "A",
      stem: "x",
      options: [
        { k: "A", t: "yes", correct: true },
        { k: "B", t: "no", correct: false },
      ],
      sowCite: "1.8(4)(A)",
    }));
    const chosen: Record<string, string> = {};
    for (let i = 0; i < 10; i++) chosen[`n${i}`] = i < 8 ? "A" : "B";
    const edge = scoreExam(eightOfTen, chosen);
    assert.equal(edge.passed, true);
    assert.equal(edge.correctCount, 8);
  });
});

describe("exam lock", () => {
  it("locks after three failed attempts", () => {
    assert.equal(examLocked(2, false), false);
    assert.equal(examLocked(3, false), true);
    assert.equal(examLocked(3, true), false);
    assert.equal(remainingExamAttempts(2, false), 1);
    assert.equal(EXAM_MAX_ATTEMPTS, 3);
  });
});

describe("sequential unlock", () => {
  const codes = ["A", "B", "C"];
  it("opens the first incomplete topic and locks later ones when sequential", () => {
    const done = new Set(["A"]);
    assert.equal(firstIncompleteTopicIndex(codes, done), 1);
    assert.equal(topicUnlocked(0, done, codes, true), true);
    assert.equal(topicUnlocked(1, done, codes, true), true);
    assert.equal(topicUnlocked(2, done, codes, true), false);
    assert.equal(examUnlocked(codes, done, true), false);
    assert.equal(examUnlocked(codes, new Set(codes), true), true);
    assert.equal(topicUnlocked(2, done, codes, false), true);
  });
});

describe("auditor export", () => {
  it("includes the question, their answer, result, and SOW cite", () => {
    const answers = buildExamAnswerRecords(Q, { q1: "A", q2: "A" });
    const csv = formatExamExportCsv({
      courseTitle: "30-day staff orientation",
      staffName: "Jordan Rivera",
      completedAt: "2026-08-31T12:00:00.000Z",
      snapshot: {
        attempt: 1,
        scorePct: 50,
        correctCount: 1,
        total: 2,
        passed: false,
        answers,
        completedAt: "2026-08-31T12:00:00.000Z",
      },
    });
    assert.match(csv, /1\.8\(4\)\(A\)/);
    assert.match(csv, /Wait/);
    assert.match(csv, /incorrect/);
    assert.match(csv, /Nurse line/);
    assert.match(csv, /correct/);
    assert.doesNotMatch(csv, /cheat/i);
  });
});
