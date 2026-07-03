import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  BASELINE_STAFF_TRAININGS,
  isBaselineApplicable,
  type BaselineTraining,
} from "@/lib/staff-training-requirements";

/**
 * Per-staff HIVE Training status against the fixed DSPD baseline list.
 *
 * For every active org member we return, for each *applicable* baseline
 * training, either `certified` (with completion/expiration dates + course
 * id) or `missing` (with the mapped course id so the UI can deep-link to
 * the "Buy / Assign" flow on the HIVE Training page).
 */
export type StaffTrainingStatus = {
  baselineKey: string;
  title: string;
  status: "certified" | "missing";
  completedAt: string | null;
  expiresAt: string | null;
  courseId: string | null;
};

export type StaffTrainingRow = {
  userId: string;
  trainings: StaffTrainingStatus[];
};

export const getRosterTrainingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    // 1. Active members with the applicability signals we need.
    const { data: mems, error: memErr } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organizationId)
      .eq("active", true);
    if (memErr) throw memErr;

    const ids = (mems ?? []).map((m) => m.user_id);
    if (ids.length === 0) return [] as StaffTrainingRow[];

    const { data: profs, error: profErr } = await supabase
      .from("profiles")
      .select("id, hire_date, requires_deescalation, requires_abi")
      .in("id", ids);
    if (profErr) throw profErr;

    // 2. Baseline-tagged courses (single source of truth for course_id lookup).
    const { data: courses, error: cErr } = await supabase
      .from("hive_training_courses")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id, baseline_key" as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .not("baseline_key" as any, "is", null);
    if (cErr) throw cErr;
    const courseByBaseline = new Map<string, string>();
    for (const c of ((courses ?? []) as unknown) as Array<{ id: string; baseline_key: string | null }>) {
      if (c.baseline_key && !courseByBaseline.has(c.baseline_key)) {
        courseByBaseline.set(c.baseline_key, c.id);
      }
    }

    // 3. All assignments for these users; pick the most-recent active/completed
    //    row per (user, course).
    const { data: assigns, error: aErr } = await supabase
      .from("hive_training_assignments")
      .select("user_id, course_id, status, completed_at, expires_at")
      .in("user_id", ids);
    if (aErr) throw aErr;

    // key: `${userId}:${courseId}` → best row
    const bestByPair = new Map<
      string,
      { status: string; completed_at: string | null; expires_at: string | null }
    >();
    const nowIso = new Date().toISOString();
    for (const row of (assigns ?? []) as Array<{
      user_id: string;
      course_id: string;
      status: string;
      completed_at: string | null;
      expires_at: string | null;
    }>) {
      const key = `${row.user_id}:${row.course_id}`;
      const isCertified =
        row.status === "completed" && (!row.expires_at || row.expires_at > nowIso);
      const cur = bestByPair.get(key);
      if (!cur) {
        bestByPair.set(key, row);
        continue;
      }
      const curCertified =
        cur.status === "completed" && (!cur.expires_at || cur.expires_at > nowIso);
      // Prefer a certified row; otherwise keep the newer completed_at.
      if (isCertified && !curCertified) bestByPair.set(key, row);
      else if (isCertified === curCertified) {
        if ((row.completed_at ?? "") > (cur.completed_at ?? "")) bestByPair.set(key, row);
      }
    }

    return (profs ?? []).map((p) => {
      const hire = p.hire_date ? new Date(p.hire_date) : null;
      const ctx = {
        hireDate: hire,
        requiresDeescalation: !!p.requires_deescalation,
        requiresAbi: !!p.requires_abi,
      };
      const trainings: StaffTrainingStatus[] = BASELINE_STAFF_TRAININGS
        .filter((t: BaselineTraining) => isBaselineApplicable(t, ctx))
        .map((t) => {
          const courseId = courseByBaseline.get(t.key) ?? null;
          const best = courseId ? bestByPair.get(`${p.id}:${courseId}`) : undefined;
          const certified =
            !!best &&
            best.status === "completed" &&
            (!best.expires_at || best.expires_at > nowIso);
          return {
            baselineKey: t.key,
            title: t.title,
            status: certified ? "certified" : "missing",
            completedAt: certified ? best!.completed_at : null,
            expiresAt: certified ? best!.expires_at : null,
            courseId,
          } satisfies StaffTrainingStatus;
        });
      return { userId: p.id, trainings } satisfies StaffTrainingRow;
    });
  });
