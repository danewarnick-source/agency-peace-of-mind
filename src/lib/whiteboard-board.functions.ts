/**
 * CRM Phase B3 — supporting data for the consolidated Whiteboard planning
 * board. READ-ONLY. Session-only board mutations happen in the client.
 *
 * Returns the active staff pool for the org — id, name, photo_path so
 * <PersonAvatar /> can render them. Qualifications are NOT joined here;
 * the board loads them lazily via getStaffQualifications when scoring is
 * wired in a later pass.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyPermission } from "@/lib/require-permission";

export type BoardStaff = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  photo_path: string | null;
  position: string | null;
};

const orgOnly = z.object({ organization_id: z.string().uuid() });

export const getBoardStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }): Promise<BoardStaff[]> => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);

    const memQ = await supabase
      .from("organization_members")
      .select("user_id, active")
      .eq("organization_id", data.organization_id)
      .eq("active", true);
    if (memQ.error) throw new Error(memQ.error.message);
    const ids = ((memQ.data ?? []) as Array<{ user_id: string }>).map(
      (r) => r.user_id,
    );
    if (ids.length === 0) return [];

    const profQ = await supabase
      .from("profiles")
      .select("id, first_name, last_name, photo_path, position")
      .in("id", ids);
    if (profQ.error) throw new Error(profQ.error.message);

    return ((profQ.data ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      photo_path: string | null;
      position: string | null;
    }>)
      .map((p) => {
        const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          full_name: full || "Unnamed",
          photo_path: p.photo_path,
          position: p.position,
        };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  });
