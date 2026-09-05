import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

const DismissInput = z.object({
  organizationId: z.string().uuid(),
});

/**
 * Persist welcome-banner dismissal on the caller's organization.
 * Admin/owner only (`role = admin`, labeled Owner).
 */
export const dismissAdminWelcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DismissInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    if (!supabase || !context.userId) return { ok: true as const };

    await requireOrgMembership(supabase, context.userId, data.organizationId, "admin");

    const { error } = await supabase
      .from("organizations")
      .update({ welcome_dismissed_at: new Date().toISOString() })
      .eq("id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
