import { useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useCurrentOrg } from "./use-org";

// Free-form so it accepts both built-in (Training/Admin/Travel/Meeting/Other)
// and any custom categories an admin adds in Time & Pay settings.
export type GeneralCategory = string;

export type GeneralShift = {
  id: string;
  category: GeneralCategory;
  note: string;
  start_iso: string;
};

export type CompletedGeneralShift = {
  category: GeneralCategory;
  note: string;
  start_iso: string;
  end_iso: string;
  hours: number;
};

// general_shifts is intentionally not in the generated Supabase types yet; this
// repo accesses such tables via an untyped client (same pattern as other
// recently-added tables). Runtime/PostgREST is unaffected.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type GeneralShiftRow = {
  id: string;
  category: string | null;
  note: string | null;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
};

function hoursBetween(startIso: string, endIso: string): number {
  return Math.max(
    0,
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000,
  );
}

/**
 * Tracks the staff member's active non-client (general) work shift. Persisted
 * SERVER-SIDE in `public.general_shifts` (org-scoped, RLS-protected) so it
 * survives a refresh and is visible across devices — the same durable home
 * client/EVV shifts have in `evv_timesheets` via `useActiveShift`.
 *
 * The active shift is the caller's most recent row with no clock_out yet.
 */
export function useGeneralShift() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userId = user?.id;

  const { data: shift } = useQuery<GeneralShift | null>({
    enabled: !!userId,
    queryKey: ["general-shift", userId],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<GeneralShift | null> => {
      const { data, error } = await db
        .from("general_shifts")
        .select("id, category, note, clock_in_timestamp")
        .eq("user_id", userId)
        .is("clock_out_timestamp", null)
        .order("clock_in_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as GeneralShiftRow;
      return {
        id: row.id,
        category: row.category ?? "general",
        note: row.note ?? "",
        start_iso: row.clock_in_timestamp,
      };
    },
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["general-shift", userId] });
    qc.invalidateQueries({ queryKey: ["general-shift-log", userId] });
  }, [qc, userId]);

  // Set organization_id + user_id here; RLS (WITH CHECK user_id = auth.uid()
  // AND is_org_member) enforces them server-side so they can't be spoofed —
  // exactly how the EVV punch writes evv_timesheets.
  const start = useCallback(
    (s: Omit<GeneralShift, "id" | "start_iso">) => {
      if (!userId || !org?.organization_id) return;
      (async () => {
        const { error } = await db.from("general_shifts").insert({
          organization_id: org.organization_id,
          user_id: userId,
          category: s.category,
          note: s.note?.trim() ? s.note.trim() : null,
        });
        if (error) console.error("[general-shift] start failed", error);
        invalidate();
      })().catch((e) => console.error("[general-shift] start failed", e));
    },
    [userId, org?.organization_id, invalidate],
  );

  const stop = useCallback(
    (shiftId: string, opts?: { note?: string }) => {
      if (!userId) return;
      (async () => {
        const patch: Record<string, unknown> = {
          clock_out_timestamp: new Date().toISOString(),
        };
        if (typeof opts?.note === "string") patch.note = opts.note.trim();
        const { error } = await db
          .from("general_shifts")
          .update(patch)
          .eq("id", shiftId)
          .eq("user_id", userId);
        if (error) console.error("[general-shift] stop failed", error);
        invalidate();
      })().catch((e) => console.error("[general-shift] stop failed", e));
    },
    [userId, invalidate],
  );

  // Debounced so typing in the note box doesn't hit the server per keystroke;
  // the final note is also persisted on stop().
  const updateNote = useCallback(
    (shiftId: string, note: string) => {
      if (!userId) return;
      // Optimistic local update so the UI reflects the note immediately.
      qc.setQueryData<GeneralShift | null>(["general-shift", userId], (prev) =>
        prev ? { ...prev, note } : prev,
      );
      if (noteTimer.current) clearTimeout(noteTimer.current);
      noteTimer.current = setTimeout(() => {
        Promise.resolve(
          db
            .from("general_shifts")
            .update({ note: note.trim() })
            .eq("id", shiftId)
            .eq("user_id", userId),
        ).catch((e) => console.error("[general-shift] note update failed", e));
      }, 700);
    },
    [qc, userId],
  );

  return { shift: shift ?? null, start, stop, updateNote };
}

/**
 * Read-only access to the staff member's completed general shifts (last 365
 * days) from the server, so the NECTAR pay-period summary can include
 * Training/Admin/Travel/Meeting time alongside client services.
 */
export function useGeneralShiftLog(): CompletedGeneralShift[] {
  const { user } = useAuth();
  const userId = user?.id;

  const { data } = useQuery<CompletedGeneralShift[]>({
    enabled: !!userId,
    queryKey: ["general-shift-log", userId],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<CompletedGeneralShift[]> => {
      const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await db
        .from("general_shifts")
        .select("category, note, clock_in_timestamp, clock_out_timestamp")
        .eq("user_id", userId)
        .not("clock_out_timestamp", "is", null)
        .gte("clock_out_timestamp", cutoff)
        .order("clock_out_timestamp", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as GeneralShiftRow[]).map((r) => ({
        category: r.category ?? "general",
        note: r.note ?? "",
        start_iso: r.clock_in_timestamp,
        end_iso: r.clock_out_timestamp as string,
        hours: hoursBetween(r.clock_in_timestamp, r.clock_out_timestamp as string),
      }));
    },
  });

  return data ?? [];
}
