import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Per-user, localStorage-free dismissal of one-time UI hints (e.g. the HHS
// host-home explainer banner). Mirrors the existing per-user pref pattern
// (user_celebration_mute): a tiny table keyed off auth.users.id, user-owned
// RLS. Reads/writes degrade gracefully when the table has not been created
// yet (the SQL is a human handoff), so no surface crashes pre-migration.

/** pref_keys this user has dismissed. Empty list if the table is absent. */
export const getUiDismissals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => Promise<{ data: Array<{ pref_key: string }> | null; error: unknown }>;
        };
      };
    };
    const userId = context.userId as string;
    try {
      const { data, error } = await sb
        .from("user_ui_dismissals")
        .select("pref_key")
        .eq("user_id", userId);
      if (error) return [];
      return (data ?? []).map((r) => r.pref_key);
    } catch {
      return [];
    }
  });

/** Record that this user dismissed `prefKey`. No-op if the table is absent. */
export const dismissUiPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ prefKey: z.string().min(1).max(64) }).parse(i))
  .handler(async ({ data, context }): Promise<{ ok: boolean; persisted: boolean }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const userId = context.userId as string;
    try {
      const { error } = await sb
        .from("user_ui_dismissals")
        .upsert(
          { user_id: userId, pref_key: data.prefKey, dismissed_at: new Date().toISOString() },
          { onConflict: "user_id,pref_key" },
        );
      // Missing table → not persisted, but never throw (caller hides in-session).
      return { ok: true, persisted: !error };
    } catch {
      return { ok: true, persisted: false };
    }
  });
