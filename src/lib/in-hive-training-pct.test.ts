import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PCT_COURSE_ID,
  PCT_COURSE_TITLE,
  PCT_COURSE_FULFILLS_OBLIGATION,
  PCT_EXAM_TOTAL,
  PCT_LESSON_ID_TO_CODE,
  PCT_PASS_SCORE,
  gradePctExam,
  gradePctFormative,
  publicCourseFromContent,
  publicQuizFromContent,
  type PctContentFile,
} from "./in-hive-training-pct.ts";

const jsonPath = fileURLToPath(new URL("./person-centered-training-content.json", import.meta.url));
const content = JSON.parse(readFileSync(jsonPath, "utf8")) as PctContentFile;

const LESSON_TITLES = [
  "Start with the person",
  "See the whole person",
  "Support real choices",
  "Build a life beyond services",
  "Keep the person in the conversation",
  "Make the plan show up tomorrow",
];

describe("person-centered-training-content.json", () => {
  it("keeps the attached course id, title, six lessons, and 15 exam items", () => {
    assert.equal(content.id, PCT_COURSE_ID);
    assert.equal(content.title, PCT_COURSE_TITLE);
    assert.equal(content.passScore, PCT_PASS_SCORE);
    assert.equal(content.lessons.length, 6);
    assert.equal(content.quiz.length, PCT_EXAM_TOTAL);
    assert.deepEqual(
      content.lessons.map((l) => l.title),
      LESSON_TITLES,
    );
  });

  it("uses zero-based correct indexes that stay inside each option list", () => {
    for (const lesson of content.lessons) {
      assert.equal(Number.isInteger(lesson.correct), true);
      assert.ok(lesson.correct >= 0 && lesson.correct < lesson.options.length);
      assert.equal(lesson.feedback.length, lesson.options.length);
    }
    for (const item of content.quiz) {
      assert.equal(Number.isInteger(item.correct), true);
      assert.ok(item.correct >= 0 && item.correct < item.options.length);
    }
  });
});

describe("PCT public payload", () => {
  it("strips answer keys from lessons and the exam", () => {
    const pub = publicCourseFromContent(content);
    const quiz = publicQuizFromContent(content);
    assert.equal(pub.lessons.length, 6);
    assert.equal(quiz.length, 15);
    assert.equal("correct" in pub.lessons[0]!, false);
    assert.equal("feedback" in pub.lessons[0]!, false);
    assert.equal("correct" in quiz[0]!, false);
    assert.equal("why" in quiz[0]!, false);
    assert.equal(pub.fulfillsObligation, PCT_COURSE_FULFILLS_OBLIGATION);
    assert.match(pub.attribution, /not official NCAPPS/);
  });
});

describe("PCT server grading", () => {
  it("scores formative checks from zero-based indexes", () => {
    const lesson = content.lessons[0]!;
    const pass = gradePctFormative(content, lesson.id, lesson.correct);
    assert.equal(pass.passed, true);
    const fail = gradePctFormative(content, lesson.id, lesson.correct === 0 ? 1 : 0);
    assert.equal(fail.passed, false);
  });

  it("passes the exam at 12 of 15 and fails at 11", () => {
    const allRight: Record<string, number> = {};
    const eleven: Record<string, number> = {};
    content.quiz.forEach((item, i) => {
      allRight[item.id] = item.correct;
      eleven[item.id] = i < 11 ? item.correct : (item.correct + 1) % item.options.length;
    });
    const pass = gradePctExam(content, allRight);
    assert.equal(pass.correctCount, 15);
    assert.equal(pass.passed, true);
    const twelveOnly: Record<string, number> = {};
    content.quiz.forEach((item, i) => {
      twelveOnly[item.id] = i < 12 ? item.correct : (item.correct + 1) % item.options.length;
    });
    assert.equal(gradePctExam(content, twelveOnly).passed, true);
    assert.equal(gradePctExam(content, twelveOnly).correctCount, 12);
    const fail = gradePctExam(content, eleven);
    assert.equal(fail.correctCount, 11);
    assert.equal(fail.passed, false);
  });

  it("maps each lesson id to a unique A–F topic code", () => {
    const codes = content.lessons.map((l) => PCT_LESSON_ID_TO_CODE[l.id]);
    assert.deepEqual(codes, ["A", "B", "C", "D", "E", "F"]);
  });
});

describe("PCT client lock", () => {
  it("does not import the answer-key JSON from the course shell or staff card", () => {
    const player = readFileSync(
      new URL("../components/training/in-hive-course-player.tsx", import.meta.url),
      "utf8",
    );
    const card = readFileSync(
      new URL("../routes/dashboard.my-obligations.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(player, /person-centered-training-content\.json/);
    assert.doesNotMatch(card, /person-centered-training-content\.json/);
  });
});
