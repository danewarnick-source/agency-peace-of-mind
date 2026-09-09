import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ABI_OBLIGATION_TITLE,
  EXAM_MAX_ATTEMPTS,
  THIRTY_DAY_EXTRA_CODES,
  THIRTY_DAY_OBLIGATION_TITLE,
  THIRTY_DAY_SOW_LETTERS,
  THIRTY_DAY_TOPIC_CODES,
  allRequiredTopicsComplete,
  completedCodesFromProgress,
  buildExamAnswerRecords,
  buildThirtyDayCertificate,
  canIssueThirtyDayCertificate,
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
  scoreSegmentGate,
  nextTopicProgressStatus,
  choiceFollowUp,
  correctChoiceIsUniquelyLongest,
  buildSegmentProof,
  SEGMENT_GATE_PASS,
  SEGMENT_GATE_TOTAL,
  shuffleCopy,
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

describe("30-day topic codes", () => {
  it("keeps SOW A–W plus separately scored SAS extras", () => {
    assert.equal(THIRTY_DAY_SOW_LETTERS.length, 23);
    assert.equal(THIRTY_DAY_EXTRA_CODES.length, 7);
    assert.equal(THIRTY_DAY_TOPIC_CODES.length, 30);
    assert.equal(THIRTY_DAY_TOPIC_CODES[0], "A");
    assert.equal(THIRTY_DAY_TOPIC_CODES[22], "W");
    assert.deepEqual(THIRTY_DAY_TOPIC_CODES.slice(23), ["PG", "PO", "EV", "MD", "PB", "CB", "DC"]);
  });
});

describe("progress refs", () => {
  it("namespaces topic and exam rows so they do not collide with topic UUIDs", () => {
    assert.equal(inHiveProgressRef("thirty-day", "A"), "inhive:thirty-day:A");
    assert.equal(inHiveExamRef("abi"), "inhive:abi:__exam__");
    assert.equal(inHiveRefUuid("thirty-day", "A"), "a11ce000-1e8f-4000-8000-000000000141");
    assert.equal(inHiveRefUuid("abi", "__exam__"), "a11ce000-1e8f-4000-8000-0000000002ff");
    assert.notEqual(inHiveRefUuid("thirty-day", "A"), inHiveRefUuid("abi", "A"));
    assert.equal(inHiveRefUuid("thirty-day", "PG"), "a11ce000-1e8f-4000-8000-000000010101");
    assert.notEqual(inHiveRefUuid("thirty-day", "PG"), inHiveRefUuid("thirty-day", "A"));
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
    for (const letter of THIRTY_DAY_SOW_LETTERS) {
      assert.ok(thirtyLetters.has(letter), `missing 30-day exam item for ${letter}`);
    }
    for (const extra of THIRTY_DAY_EXTRA_CODES) {
      assert.ok(thirtyLetters.has(extra), `missing 30-day exam item for ${extra}`);
    }
    const abiLetters = new Set(abi.map((q) => q.topicCode));
    for (const letter of "ABCDEF") {
      assert.ok(abiLetters.has(letter), `missing ABI exam item for ${letter}`);
    }
    assert.ok(
      thirty.every((q) => q.sowCite.startsWith("1.8(4)") || q.sowCite.startsWith("SAS")),
    );
    assert.ok(abi.every((q) => q.sowCite.startsWith("1.8(8)")));
  });
});

describe("shuffleCopy", () => {
  it("keeps the same items and can move the first item off index 0", () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    let n = 0;
    const rng = () => {
      n += 0.17;
      return n % 1;
    };
    const out = shuffleCopy(src, rng);
    assert.deepEqual([...out].sort((a, b) => a - b), src);
    assert.notEqual(out[0], 1);
  });
});

describe("30-day certificate checklist", () => {
  it("requires every topic plus a passing exam before issue", () => {
    const titles = THIRTY_DAY_TOPIC_CODES.map((code) => ({ code, title: code }));
    const done = new Set(THIRTY_DAY_TOPIC_CODES);
    assert.equal(allRequiredTopicsComplete(THIRTY_DAY_TOPIC_CODES, done), true);
    assert.equal(
      canIssueThirtyDayCertificate({
        topicCodes: THIRTY_DAY_TOPIC_CODES,
        completedCodes: done,
        examPassed: true,
      }),
      true,
    );
    const missing = new Set(THIRTY_DAY_TOPIC_CODES.slice(0, -1));
    assert.equal(
      canIssueThirtyDayCertificate({
        topicCodes: THIRTY_DAY_TOPIC_CODES,
        completedCodes: missing,
        examPassed: true,
      }),
      false,
    );
    const cert = buildThirtyDayCertificate({
      staffName: "Jordan Rivera",
      organizationName: "Example Supports",
      completedAt: "2026-09-08T12:00:00.000Z",
      completedCodes: done,
      examPassed: true,
      examScorePct: 88,
      topicTitles: titles,
    });
    assert.equal(cert.topics.length, THIRTY_DAY_TOPIC_CODES.length);
    assert.ok(cert.topics.every((t) => t.passed));
    assert.match(cert.topics[0]?.sowCite ?? "", /1\.8\(4\)\(A\)/);
    assert.match(cert.courseName, /30-Day Essential Training/);
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

describe("segment gate", () => {
  it("requires 4 of 5 on a full SOW segment", () => {
    assert.equal(SEGMENT_GATE_TOTAL, 5);
    assert.equal(SEGMENT_GATE_PASS, 4);
    assert.equal(scoreSegmentGate([true, true, true, true, false]).passed, true);
    assert.equal(scoreSegmentGate([true, true, true, false, false]).passed, false);
    assert.equal(scoreSegmentGate([true, true, true, true, false]).correctCount, 4);
    assert.equal(scoreSegmentGate([true, true, true, true, true, false]).total, 5);
  });

  it("on a four-beat topic, three correct is enough; empty is not", () => {
    assert.equal(scoreSegmentGate([true, true, true, false]).passed, true);
    assert.equal(scoreSegmentGate([true, true, false, false]).passed, false);
    assert.equal(scoreSegmentGate([]).passed, false);
  });

  it("marks Success only from completed progress rows", () => {
    const codes = ["A", "B", "C", "D"];
    const done = completedCodesFromProgress(codes, {
      A: { status: "completed", position: 0 },
      B: { status: "in_progress", position: 2 },
      C: { status: "completed", position: 0 },
      D: null,
    });
    assert.deepEqual([...done].sort(), ["A", "C"]);
    assert.equal(done.has("D"), false);
  });

  it("never downgrades a completed topic to in_progress", () => {
    assert.equal(nextTopicProgressStatus("completed", "in_progress"), "completed");
    assert.equal(nextTopicProgressStatus("in_progress", "completed"), "completed");
    assert.equal(nextTopicProgressStatus(null, "in_progress"), "in_progress");
  });

  it("strips verdict words so follow-up is not an answer key", () => {
    assert.equal(choiceFollowUp("Right. Stay with them."), "Stay with them.");
    assert.equal(choiceFollowUp("Do not wait."), "Do not wait.");
  });

  it("keeps topic M diagnosis and ABI stems from a uniquely long correct choice", () => {
    assert.equal(
      correctChoiceIsUniquelyLongest([
        { t: "Intellectual disability and acquired brain injury are two names for the same thing.", correct: false },
        { t: "Intellectual disability starts before adulthood; acquired brain injury happens later.", correct: true },
        { t: "Acquired brain injury is always mild; intellectual disability is always severe.", correct: false },
      ]),
      false,
    );
    assert.equal(
      correctChoiceIsUniquelyLongest([
        { t: "They will need the same supports because they share one diagnosis and label.", correct: false },
        { t: "Their abilities and needs can differ a lot — learn each person as an individual.", correct: true },
        { t: "Neither person will be able to communicate in any useful way on their own.", correct: false },
      ]),
      false,
    );
  });

  it("flags a uniquely long correct choice", () => {
    assert.equal(
      correctChoiceIsUniquelyLongest([
        { t: "Short no", correct: false },
        { t: "This correct option is much longer than the other two choices by design", correct: true },
        { t: "Also short", correct: false },
      ]),
      true,
    );
    assert.equal(
      correctChoiceIsUniquelyLongest([
        { t: "They may have different needs — learn each person.", correct: true },
        { t: "They will need the same supports from a shared diagnosis.", correct: false },
        { t: "Neither person will be able to communicate at all.", correct: false },
      ]),
      false,
    );
  });

  it("builds a segment proof only from the gate score", () => {
    const proof = buildSegmentProof({
      topicCode: "D",
      correctFlags: [true, true, true, true, false],
      completedAt: "2026-09-09T12:00:00.000Z",
    });
    assert.equal(proof.kind, "segment-gate");
    assert.equal(proof.passed, true);
    assert.equal(proof.topicCode, "D");
  });

  it("keeps the certificate UUID distinct from exam and topic A", () => {
    assert.equal(inHiveRefUuid("thirty-day", "__cert__"), "a11ce000-1e8f-4000-8000-0000000001fe");
    assert.notEqual(inHiveRefUuid("thirty-day", "__cert__"), inHiveRefUuid("thirty-day", "__exam__"));
    assert.notEqual(inHiveRefUuid("thirty-day", "__cert__"), inHiveRefUuid("thirty-day", "A"));
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
