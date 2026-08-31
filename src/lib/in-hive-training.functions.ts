import { supabase } from "@/integrations/supabase/client";
import {
  IN_HIVE_PROGRESS_KIND,
  appendExamResetNote,
  inHiveExamRef,
  inHiveRefUuid,
  lastExamResetAt,
  type ExamAttemptSnapshot,
  type InHiveCourseId,
} from "@/lib/in-hive-training";

export async function loadInHiveTopicProgress(
  userId: string,
  courseId: InHiveCourseId,
  topicCode: string,
): Promise<{ status: string; position: number } | null> {
  const refId = inHiveRefUuid(courseId, topicCode);
  const { data, error } = await (supabase as any)
    .from("training_topic_progress")
    .select("status, position")
    .eq("user_id", userId)
    .eq("topic_kind", IN_HIVE_PROGRESS_KIND)
    .eq("ref_id", refId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    status: String(data.status ?? "not_started"),
    position: Number(data.position ?? 0),
  };
}

export async function hasAnyInHiveProgress(
  userId: string,
  courseId: InHiveCourseId,
  topicCodes: string[],
): Promise<boolean> {
  const refs = topicCodes.map((code) => inHiveRefUuid(courseId, code));
  if (refs.length === 0) return false;
  const { data, error } = await (supabase as any)
    .from("training_topic_progress")
    .select("status")
    .eq("user_id", userId)
    .eq("topic_kind", IN_HIVE_PROGRESS_KIND)
    .in("ref_id", refs);
  if (error) throw error;
  return (data ?? []).some(
    (row: { status?: string }) =>
      row.status === "in_progress" || row.status === "completed",
  );
}

export async function saveInHiveTopicProgress(args: {
  userId: string;
  courseId: InHiveCourseId;
  topicCode: string;
  status: "in_progress" | "completed";
  position: number;
}): Promise<void> {
  const refId = inHiveRefUuid(args.courseId, args.topicCode);
  const { error } = await (supabase as any)
    .from("training_topic_progress")
    .upsert(
      {
        user_id: args.userId,
        topic_kind: IN_HIVE_PROGRESS_KIND,
        ref_id: refId,
        status: args.status,
        position: args.position,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,topic_kind,ref_id" },
    );
  if (error) throw error;
}

function parseSnapshot(raw: unknown): ExamAttemptSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Partial<ExamAttemptSnapshot> & { kind?: string };
  if (!Array.isArray(o.answers) || typeof o.scorePct !== "number") return null;
  return o as ExamAttemptSnapshot;
}

export async function loadInHiveExamAttempts(
  userId: string,
  courseId: InHiveCourseId,
  resetAfterIso: string | null,
): Promise<ExamAttemptSnapshot[]> {
  const refId = inHiveRefUuid(courseId, "__exam__");
  const { data, error } = await (supabase as any)
    .from("training_completions")
    .select("question_answers, completed_at")
    .eq("user_id", userId)
    .eq("topic_kind", IN_HIVE_PROGRESS_KIND)
    .eq("ref_id", refId)
    .order("completed_at", { ascending: true });
  if (error) throw error;
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

export async function insertInHiveExamAttempt(args: {
  userId: string;
  courseId: InHiveCourseId;
  signedName: string;
  signerEmail: string | null;
  snapshot: ExamAttemptSnapshot;
}): Promise<void> {
  const refId = inHiveRefUuid(args.courseId, "__exam__");
  const title =
    args.courseId === "thirty-day"
      ? "30-day orientation competency exam"
      : "ABI competency exam";
  const { error } = await (supabase as any).from("training_completions").insert({
    user_id: args.userId,
    topic_kind: IN_HIVE_PROGRESS_KIND,
    ref_id: refId,
    topic_code: "EXAM",
    topic_title: title,
    dspd_letter: null,
    attestation_statement: `${title} — competency record (SOW exam).`,
    typed_signature: args.signedName,
    signer_full_name: args.signedName,
    signer_email: args.signerEmail,
    consent_accepted: true,
    question_answers: args.snapshot,
    completed_at: args.snapshot.completedAt,
  });
  if (error) throw error;

  await (supabase as any).from("training_topic_progress").upsert(
    {
      user_id: args.userId,
      topic_kind: IN_HIVE_PROGRESS_KIND,
      ref_id: refId,
      status: args.snapshot.passed ? "completed" : "in_progress",
      position: args.snapshot.attempt,
      updated_at: args.snapshot.completedAt,
    },
    { onConflict: "user_id,topic_kind,ref_id" },
  );
}

export async function resetInHiveExamAttempts(args: {
  instanceId: string;
  staffId: string;
}): Promise<void> {
  const { data, error } = await (supabase as any)
    .from("company_obligation_instances")
    .select("admin_notes")
    .eq("id", args.instanceId)
    .maybeSingle();
  if (error) throw error;
  const next = appendExamResetNote(
    data?.admin_notes ?? null,
    args.staffId,
    new Date().toISOString(),
  );
  const { error: upErr } = await (supabase as any)
    .from("company_obligation_instances")
    .update({ admin_notes: next })
    .eq("id", args.instanceId);
  if (upErr) throw upErr;
}

export { lastExamResetAt, inHiveExamRef };
