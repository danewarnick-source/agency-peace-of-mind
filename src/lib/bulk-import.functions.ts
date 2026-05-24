import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]).optional());

const Input = z.object({
  kind: z.enum(["employee", "client"]),
  organizationId: z.string().uuid(),
  rows: z.array(RowSchema).min(1).max(500),
});

async function resolveTeamId(
  orgId: string,
  rawName: string | null | undefined,
  cache: Map<string, string>,
): Promise<string | null> {
  const name = (rawName ?? "").toString().trim();
  if (!name) return null;
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  // case-insensitive lookup
  const { data: existing } = await supabaseAdmin
    .from("teams")
    .select("id, team_name")
    .eq("organization_id", orgId)
    .ilike("team_name", name)
    .maybeSingle();
  if (existing?.id) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const { data: created, error } = await supabaseAdmin
    .from("teams")
    .insert({ organization_id: orgId, team_name: name })
    .select("id")
    .single();
  if (error || !created) return null;
  cache.set(key, created.id);
  return created.id;
}

export const bulkImportRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    // permission check
    const { data: mem } = await supabaseAdmin
      .from("organization_members")
      .select("role,active")
      .eq("user_id", context.userId)
      .eq("organization_id", data.organizationId)
      .eq("active", true)
      .maybeSingle();
    if (!mem || !["admin", "manager", "super_admin"].includes(mem.role)) {
      throw new Error("Forbidden");
    }

    const teamCache = new Map<string, string>();
    let created = 0;
    let teamsCreated = 0;
    const teamsBefore = teamCache.size;
    const errors: string[] = [];

    for (const raw of data.rows) {
      const r = raw as Record<string, string | number | null | undefined>;
      const get = (k: string) => {
        const v = r[k];
        return v === null || v === undefined ? "" : String(v).trim();
      };
      try {
        const teamName = get("team_name");
        const before = teamCache.size;
        const teamId = await resolveTeamId(data.organizationId, teamName, teamCache);
        if (teamCache.size > before) teamsCreated++;

        if (data.kind === "employee") {
          const fullName = get("full_name") || `${get("first_name")} ${get("last_name")}`.trim();
          if (!fullName) { errors.push("Skipped row: missing full_name"); continue; }
          let email = get("email").toLowerCase();
          if (!email) {
            const slug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
            email = `${slug}.${Math.random().toString(36).slice(2, 6)}@import.local`;
          }
          // create or find auth user
          let userId: string | undefined;
          const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: `Tmp${Math.random().toString(36).slice(2, 10)}!A`,
            email_confirm: true,
            user_metadata: { full_name: fullName, created_via: "bulk_import" },
          });
          if (authErr) {
            const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
            userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
          } else {
            userId = authData.user?.id;
          }
          if (!userId) { errors.push(`Could not create auth user for ${email}`); continue; }

          await supabaseAdmin.from("profiles").upsert({
            id: userId,
            full_name: fullName,
            email,
            position: get("position") || null,
            hire_date: get("hire_date") || null,
            team_id: teamId,
            system_role: "staff",
            is_active: true,
          }, { onConflict: "id" });

          const { data: existingMem } = await supabaseAdmin
            .from("organization_members")
            .select("id")
            .eq("user_id", userId)
            .eq("organization_id", data.organizationId)
            .maybeSingle();
          if (!existingMem) {
            // deactivate any auto-created personal-org memberships first
            await supabaseAdmin.from("organization_members")
              .update({ active: false })
              .eq("user_id", userId)
              .neq("organization_id", data.organizationId);
            await supabaseAdmin.from("organization_members").insert({
              user_id: userId,
              organization_id: data.organizationId,
              role: "employee",
              active: true,
              job_title: get("position") || null,
            });
          }
          created++;
        } else {
          // client
          let first = get("first_name");
          let last = get("last_name");
          if (!first && !last) {
            const full = get("full_name");
            const parts = full.split(/\s+/);
            first = parts[0] ?? "";
            last = parts.slice(1).join(" ");
          }
          if (!first && !last) { errors.push("Skipped client row: missing name"); continue; }
          const jobCodeRaw = get("job_code");
          const jobCodes = jobCodeRaw
            ? jobCodeRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
            : [];
          const { error } = await supabaseAdmin.from("clients").insert({
            organization_id: data.organizationId,
            first_name: first || "—",
            last_name: last || "—",
            phone_number: get("phone") || null,
            physical_address: get("address") || null,
            medicaid_id: get("medicaid_id") || null,
            job_code: jobCodes,
            team_id: teamId,
          });
          if (error) { errors.push(`Client ${first} ${last}: ${error.message}`); continue; }
          created++;
        }
      } catch (e) {
        errors.push((e as Error).message);
      }
    }

    return { created, teamsCreated, errors, teamsBefore };
  });
