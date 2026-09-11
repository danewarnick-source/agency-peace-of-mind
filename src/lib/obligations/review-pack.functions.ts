import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { getThisWeek } from "./this-week.functions.ts";
import {
  assembleReviewPack,
  loadPackChangelog,
  loadReviewDayMeta,
  type PackChangeRow,
  type ReviewDayMeta,
  type ReviewPack,
} from "./review-pack.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export const listPackWhatChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ appliedPackVersion: string | null; changes: PackChangeRow[] }> => {
      const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
      if (!supabase || !userId) return { appliedPackVersion: null, changes: [] };
      await requireOrgMembership(supabase, userId, data.organizationId, "employee");
      return loadPackChangelog(supabase, data.organizationId);
    },
  );

export const getReviewDayMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ReviewDayMeta> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) {
      return { period: null, sites: null, samplePeople: null, sampleStaff: null };
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    return loadReviewDayMeta(supabase, data.organizationId);
  });

export const generateMyReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<ReviewPack | null> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return null;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    const [week, pack] = await Promise.all([
      getThisWeek(supabase, data.organizationId, userId),
      loadPackChangelog(supabase, data.organizationId),
    ]);
    return assembleReviewPack(week.items, pack.changes, pack.appliedPackVersion);
  });
