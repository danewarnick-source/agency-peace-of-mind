import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

export interface NectarSearchEntity {
  id: string;
  name: string;
  subtitle?: string | null;
}

export interface NectarSearchResult {
  clients: NectarSearchEntity[];
  staff: NectarSearchEntity[];
}

interface Input { organizationId: string; query: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function validate(input: unknown): Input {
  const i = (input ?? {}) as Record<string, unknown>;
  const organizationId = typeof i.organizationId === "string" ? i.organizationId : "";
  const queryRaw = typeof i.query === "string" ? i.query.trim() : "";
  if (!UUID_RE.test(organizationId)) throw new Error("Invalid organizationId.");
  if (queryRaw.length < 2 || queryRaw.length > 80) {
    throw new Error("Query must be 2–80 characters.");
  }
  // Escape PostgREST special chars for ilike
  const query = queryRaw.replace(/[%,()*]/g, " ");
  return { organizationId, query };
}

export const searchOrgEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<NectarSearchResult> => {
    const { supabase, userId } = context as {
      supabase: { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      userId: string;
    };

    // Admin-capable only: manager/admin/super_admin.
    await requireOrgMembership(supabase as any, userId, data.organizationId, "manager"); // eslint-disable-line @typescript-eslint/no-explicit-any

    const like = `%${data.query}%`;

    const [clientsRes, membersRes] = await Promise.all([
      (supabase as any)
        .from("clients")
        .select("id, first_name, last_name, account_status")
        .eq("organization_id", data.organizationId)
        .or(`first_name.ilike.${like},last_name.ilike.${like}`)
        .limit(8),
      (supabase as any)
        .from("organization_members")
        .select("user_id, role, active, profiles:profiles!inner(id, full_name, email, first_name, last_name)")
        .eq("organization_id", data.organizationId)
        .eq("active", true)
        .or(
          `full_name.ilike.${like},email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`,
          { foreignTable: "profiles" },
        )
        .limit(8),
    ]);

    const clients: NectarSearchEntity[] = ((clientsRes?.data ?? []) as Array<{
      id: string; first_name: string | null; last_name: string | null; account_status: string | null;
    }>)
      .filter((c) => (c.account_status ?? "active") !== "archived")
      .map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "(unnamed client)",
      }))
      .slice(0, 5);

    type MemberRow = {
      user_id: string;
      role: string | null;
      profiles: { id: string; full_name: string | null; email: string | null; first_name: string | null; last_name: string | null } | null;
    };
    const staff: NectarSearchEntity[] = ((membersRes?.data ?? []) as MemberRow[])
      .filter((m) => m.profiles)
      .map((m) => {
        const p = m.profiles!;
        const name =
          p.full_name?.trim() ||
          [p.first_name, p.last_name].filter(Boolean).join(" ") ||
          p.email ||
          "(unnamed staff)";
        return { id: p.id, name, subtitle: m.role ?? null };
      })
      .slice(0, 5);

    return { clients, staff };
  });
