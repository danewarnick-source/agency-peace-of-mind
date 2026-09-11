import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  IN_HIVE_PROGRESS_KIND,
  examLocked,
  inHiveRefUuid,
  type ExamAttemptSnapshot,
  type InHiveCourseId,
} from "./in-hive-training.ts";
import {
  PCT_COURSE_ID,
  PCT_COURSE_TITLE,
  PCT_LESSON_ID_TO_CODE,
  gradePctExam,
  gradePctFormative,
  publicCourseFromContent,
  publicQuizFromContent,
  type PctContentFile,
  type PctPublicCourse,
  type PctPublicQuizItem,
} from "./in-hive-training-pct.ts";
import contentJson from "./person-centered-training-content.json";

const PCT_CONTENT = contentJson as PctContentFile;
const COURSE_ID = PCT_COURSE_ID as InHiveCourseId;

function parseSnapshot(raw: unknown): ExamAttemptSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Partial<ExamAttemptSnapshot>;
  if (!Array.isArray(o.answers) || typeof o.scorePct !== "number") return null;
  return o as ExamAttemptSnapshot;
}

async function loadExamAttempts(
  supabase: unknown,
  userId: string,
  resetAfterIso: string | null,
): Promise<ExamAttemptSnapshot[]> {
  const refId = inHiveRefUuid(COURSE_ID, "__exam__");
  const { data, error } = await (supabase as any)
    .from("training_completions")
    .select("question_answers, completed_at")
    .eq("user_id", userId)
    .eq("topic_kind", IN_HIVE_PROGRESS_KIND)
    .eq("ref_id", refId)
    .order("completed_at", { ascending: true });
  if (error) throw new Error(error.message ?? "Could not load exam attempts.");
  const cutoff = resetAfterIso ? Date.parse(resetAfterIso) : 0;
  const out: ExamAttemptSnapshot[] = [];
  for (const row of data ?? []) {
    const at = Date.parse(String(row.completed_at ?? ""));
    if (cutoff && Number.isFinite(at) && at <= cutoff) continue;
    const snap = parseSnapshot(row.question_answers);
    if (snap) out.push(snap);
  }
  return out;
}

export const getPctCoursePublic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PctPublicCourse> => {
    if (!context.userId) throw new Error("Sign in to open this course.");
    return publicCourseFromContent(PCT_CONTENT);
  });

export const getPctExamPublic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PctPublicQuizItem[]> => {
    if (!context.userId) throw new Error("Sign in to open this course.");
    return publicQuizFromContent(PCT_CONTENT);
  });

export const gradePctFormativeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        lessonId: z.string().min(1),
        chosenIndex: z.number().int(),
        signedName: z.string().min(1),
        signerEmail: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ passed: boolean; feedback: string }> => {
    const userId = context.userId;
    if (!userId) throw new Error("Sign in to save this check.");
    const result = gradePctFormative(PCT_CONTENT, data.lessonId, data.chosenIndex);
    if (!result.passed) return result;

    const topicCode = PCT_LESSON_ID_TO_CODE[data.lessonId] ?? "A";
    const lesson = PCT_CONTENT.lessons.find((l) => l.id === data.lessonId);
    const refId = inHiveRefUuid(COURSE_ID, topicCode);
    const completedAt = new Date().toISOString();
    const supabase = context.supabase as any;

    const progress = await supabase.from("training_topic_progress").upsert(
      {
        user_id: userId,
        topic_kind: IN_HIVE_PROGRESS_KIND,
        ref_id: refId,
        status: "completed",
        position: 0,
        updated_at: completedAt,
      },
      { onConflict: "user_id,topic_kind,ref_id" },
    );
    if (progress.error) throw new Error(progress.error.message ?? "Could not save topic progress.");

    const proof = await supabase.from("training_completions").insert({
      user_id: userId,
      topic_kind: IN_HIVE_PROGRESS_KIND,
      ref_id: refId,
      topic_code: topicCode,
      topic_title: `PCT segment ${topicCode}`,
      dspd_letter: topicCode,
      attestation_statement: `PCT formative passed (1/1) — ${lesson?.title ?? topicCode}.`,
      typed_signature: data.signedName,
      signer_full_name: data.signedName,
      signer_email: data.signerEmail,
      consent_accepted: true,
      question_answers: {
        kind: "segment-gate",
        topicCode,
        correctCount: 1,
        total: 1,
        passed: true,
        completedAt,
      },
      completed_at: completedAt,
    });
    if (proof.error && !/duplicate|unique/i.test(proof.error.message ?? "")) {
      throw new Error(proof.error.message ?? "Could not save the topic record.");
    }
    return result;
  });

export const submitPctExamFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        chosenById: z.record(z.string(), z.number().int()),
        signedName: z.string().min(1),
        signerEmail: z.string().nullable(),
        examResetAfterIso: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      passed: boolean;
      correctCount: number;
      total: number;
      scorePct: number;
      attempt: number;
      locked: boolean;
    }> => {
      const userId = context.userId;
      if (!userId) throw new Error("Sign in to submit the exam.");
      const attempts = await loadExamAttempts(context.supabase, userId, data.examResetAfterIso);
      const alreadyPassed = attempts.some((a) => a.passed);
      const failedCount = attempts.filter((a) => !a.passed).length;
      if (examLocked(failedCount, alreadyPassed)) {
        throw new Error("Three attempts were used. An admin must reassign this exam.");
      }
      if (alreadyPassed) {
        const last = [...attempts].reverse().find((a) => a.passed) ?? attempts[attempts.length - 1]!;
        return {
          passed: true,
          correctCount: last.correctCount,
          total: last.total,
          scorePct: last.scorePct,
          attempt: last.attempt,
          locked: false,
        };
      }

      const graded = gradePctExam(PCT_CONTENT, data.chosenById);
      const completedAt = new Date().toISOString();
      const snapshot: ExamAttemptSnapshot = {
        attempt: attempts.length + 1,
        scorePct: graded.scorePct,
        correctCount: graded.correctCount,
        total: graded.total,
        passed: graded.passed,
        answers: graded.answers,
        completedAt,
      };

      const refId = inHiveRefUuid(COURSE_ID, "__exam__");
      const title = `${PCT_COURSE_TITLE} competency exam`;
      const supabase = context.supabase as any;
      const inserted = await supabase.from("training_completions").insert({
        user_id: userId,
        topic_kind: IN_HIVE_PROGRESS_KIND,
        ref_id: refId,
        topic_code: "EXAM",
        topic_title: title,
        dspd_letter: null,
        attestation_statement: `${title} — competency record (hire-level PCT).`,
        typed_signature: data.signedName,
        signer_full_name: data.signedName,
        signer_email: data.signerEmail,
        consent_accepted: true,
        question_answers: snapshot,
        completed_at: completedAt,
      });
      if (inserted.error) throw new Error(inserted.error.message ?? "Could not save the exam.");

      const progress = await supabase.from("training_topic_progress").upsert(
        {
          user_id: userId,
          topic_kind: IN_HIVE_PROGRESS_KIND,
          ref_id: refId,
          status: snapshot.passed ? "completed" : "in_progress",
          position: snapshot.attempt,
          updated_at: completedAt,
        },
        { onConflict: "user_id,topic_kind,ref_id" },
      );
      if (progress.error) throw new Error(progress.error.message ?? "Could not save exam progress.");

      return {
        passed: snapshot.passed,
        correctCount: snapshot.correctCount,
        total: snapshot.total,
        scorePct: snapshot.scorePct,
        attempt: snapshot.attempt,
        locked: examLocked(failedCount + (snapshot.passed ? 0 : 1), snapshot.passed),
      };
    },
  );
