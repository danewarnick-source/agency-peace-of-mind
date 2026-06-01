import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ───── Types ─────────────────────────────────────────────────────────────────

export interface MemberRow {
  membership_id: string;
  organization_id: string;
  organization_name: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_company_executive: boolean;
  active: boolean;
}

export interface HiveExecRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  active: boolean;
  granted_at: string;
  granted_by: string | null;
  notes: string | null;
}

export interface AuditEntry {
  id: string;
  actor_user_id: string;
  actor_name: string | null;
  action: string;
  target_org_id: string | null;
  target_org_name: string | null;
  summary: string | null;
  created_at: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = ["employee", "manager", "admin", "super_admin"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

// ───── Helpers ───────────────────────────────────────────────────────────────

async function ensureExecutive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("hive_executives")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Access denied — HIVE Executive permission required.");
}

async function audit(
  actorId: string,
  action: string,
  target_org_id: string | null,
  summary: string,
): Promise<void> {
  await supabaseAdmin.from("hive_executive_audit_log").insert({
    actor_user_id: actorId,
    action,
    target_org_id,
    summary,
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

// ───── Create Company ────────────────────────────────────────────────────────

function validateCreateCompany(input: unknown): {
  name: string;
  adminEmail: string;
  adminFullName: string;
  plan: "starter" | "pro" | "enterprise" | "custom";
  status: "trial" | "active";
  notes: string | null;
} {
  const i = (input ?? {}) as Record<string, unknown>;
  const name = typeof i.name === "string" ? i.name.trim() : "";
  if (name.length < 2 || name.length > 120) throw new Error("Company name required (2–120 chars).");
  const adminEmail = typeof i.adminEmail === "string" ? i.adminEmail.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(adminEmail)) throw new Error("Valid admin email required.");
  const adminFullName = typeof i.adminFullName === "string" ? i.adminFullName.trim() : "";
  if (adminFullName.length < 2 || adminFullName.length > 120)
    throw new Error("Admin full name required (2–120 chars).");
  const plan = ["starter", "pro", "enterprise", "custom"].includes(i.plan as string)
    ? (i.plan as "starter" | "pro" | "enterprise" | "custom")
    : "starter";
  const status = i.status === "active" ? "active" : "trial";
  const notes = typeof i.notes === "string" ? i.notes.slice(0, 500) : null;
  return { name, adminEmail, adminFullName, plan, status, notes };
}

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateCreateCompany)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    // Resolve or invite the admin user
    let adminUserId: string | null = null;
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.adminEmail)
      .maybeSingle();

    if (existingProfile?.id) {
      adminUserId = existingProfile.id;
    } else {
      const { data: invited, error: inviteErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(data.adminEmail, {
          data: { full_name: data.adminFullName, agency_name: data.name },
        });
      if (inviteErr) throw new Error(`Invite failed: ${inviteErr.message}`);
      adminUserId = invited.user?.id ?? null;
      if (!adminUserId) throw new Error("Invite did not return a user id.");
    }

    // Create org (handle_new_user trigger doesn't fire for existing users, so we create explicitly)
    const baseSlug = slugify(data.name);
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .insert({ name: data.name, slug, created_by: adminUserId })
      .select("id")
      .single();
    if (orgErr) throw new Error(`Org create failed: ${orgErr.message}`);

    // Ensure profile row exists (for already-invited users it should; for fresh invites the auth trigger handles it)
    await supabaseAdmin.from("profiles").upsert(
      { id: adminUserId, email: data.adminEmail, full_name: data.adminFullName, agency_name: data.name },
      { onConflict: "id" },
    );

    // Admin membership
    const { error: memberErr } = await supabaseAdmin
      .from("organization_members")
      .upsert(
        { organization_id: org.id, user_id: adminUserId, role: "admin", active: true, is_company_executive: true },
        { onConflict: "organization_id,user_id" },
      );
    if (memberErr) throw new Error(`Member create failed: ${memberErr.message}`);

    // Subscription
    await supabaseAdmin.from("org_subscriptions").insert({
      organization_id: org.id,
      plan: data.plan,
      status: data.status,
      mrr_cents: 0,
      notes: data.notes,
    });

    await audit(
      userId,
      "create_company",
      org.id,
      `Created company "${data.name}" with admin ${data.adminEmail} (${data.plan}/${data.status})`,
    );

    return { ok: true, organization_id: org.id };
  });

// ───── Cross-company member listing ──────────────────────────────────────────

export const listAllMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberRow[]> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    await audit(userId, "list_members", null, "Loaded cross-company member roster");

    const { data: members, error } = await supabaseAdmin
      .from("organization_members")
      .select("id, organization_id, user_id, role, active, is_company_executive")
      .order("organization_id");
    if (error) throw error;

    const orgIds = [...new Set((members ?? []).map((m) => m.organization_id))];
    const userIds = [...new Set((members ?? []).map((m) => m.user_id))];

    const [{ data: orgs }, { data: profiles }] = await Promise.all([
      orgIds.length
        ? supabaseAdmin.from("organizations").select("id, name").in("id", orgIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, email, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as Array<{ id: string; email: string | null; full_name: string | null }> }),
    ]);

    const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
    const profileById = new Map(
      (profiles ?? []).map((p) => [p.id, { email: p.email, full_name: p.full_name }]),
    );

    return (members ?? []).map((m) => ({
      membership_id: m.id,
      organization_id: m.organization_id,
      organization_name: orgName.get(m.organization_id) ?? "—",
      user_id: m.user_id,
      email: profileById.get(m.user_id)?.email ?? null,
      full_name: profileById.get(m.user_id)?.full_name ?? null,
      role: m.role,
      is_company_executive: m.is_company_executive,
      active: m.active,
    }));
  });

// ───── Member role / status update ───────────────────────────────────────────

function validateMemberUpdate(input: unknown): {
  membershipId: string;
  patch: { role?: AllowedRole; active?: boolean; is_company_executive?: boolean };
} {
  const i = (input ?? {}) as Record<string, unknown>;
  const membershipId = typeof i.membershipId === "string" ? i.membershipId : "";
  if (!UUID_RE.test(membershipId)) throw new Error("Invalid membership id.");
  const patch = (i.patch ?? {}) as Record<string, unknown>;
  const out: ReturnType<typeof validateMemberUpdate>["patch"] = {};
  if (
    typeof patch.role === "string" &&
    (ALLOWED_ROLES as readonly string[]).includes(patch.role)
  ) {
    out.role = patch.role as AllowedRole;
  }
  if (typeof patch.active === "boolean") out.active = patch.active;
  if (typeof patch.is_company_executive === "boolean")
    out.is_company_executive = patch.is_company_executive;
  if (Object.keys(out).length === 0) throw new Error("No valid fields to update.");
  return { membershipId, patch: out };
}

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateMemberUpdate)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    const { data: existing, error: readErr } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, user_id, role")
      .eq("id", data.membershipId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) throw new Error("Membership not found.");

    const { error } = await supabaseAdmin
      .from("organization_members")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(data.patch as any)
      .eq("id", data.membershipId);
    if (error) throw error;

    await audit(
      userId,
      "update_member",
      existing.organization_id,
      `Updated membership ${data.membershipId}: ${Object.entries(data.patch)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
    return { ok: true };
  });

// ───── HIVE Executive role grants ────────────────────────────────────────────

export const listHiveExecutives = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HiveExecRow[]> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    const { data, error } = await supabaseAdmin
      .from("hive_executives")
      .select("user_id, active, granted_at, granted_by, notes")
      .order("granted_at", { ascending: false });
    if (error) throw error;

    const ids = (data ?? []).map((r) => r.user_id);
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", ids)
      : { data: [] as Array<{ id: string; email: string | null; full_name: string | null }> };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

    return (data ?? []).map((r) => ({
      user_id: r.user_id,
      email: byId.get(r.user_id)?.email ?? null,
      full_name: byId.get(r.user_id)?.full_name ?? null,
      active: r.active,
      granted_at: r.granted_at,
      granted_by: r.granted_by,
      notes: r.notes,
    }));
  });

function validateGrantExec(input: unknown): { email: string; grant: boolean; notes: string | null } {
  const i = (input ?? {}) as Record<string, unknown>;
  const email = typeof i.email === "string" ? i.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) throw new Error("Valid email required.");
  const grant = i.grant !== false;
  const notes = typeof i.notes === "string" ? i.notes.slice(0, 200) : null;
  return { email, grant, notes };
}

export const setHiveExecutiveByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateGrantExec)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("email", data.email)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!profile) throw new Error(`No account found for ${data.email}.`);

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("hive_executives")
        .upsert(
          { user_id: profile.id, active: true, granted_by: userId, notes: data.notes },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("hive_executives")
        .update({ active: false })
        .eq("user_id", profile.id);
      if (error) throw error;
    }

    await audit(
      userId,
      data.grant ? "grant_hive_executive" : "revoke_hive_executive",
      null,
      `${data.grant ? "Granted" : "Revoked"} HIVE Executive for ${data.email}`,
    );
    return { ok: true };
  });

// ───── Audit log read ────────────────────────────────────────────────────────

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuditEntry[]> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    const { data, error } = await supabaseAdmin
      .from("hive_executive_audit_log")
      .select("id, actor_user_id, action, target_org_id, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const actorIds = [...new Set((data ?? []).map((r) => r.actor_user_id))];
    const orgIds = [...new Set((data ?? []).map((r) => r.target_org_id).filter((x): x is string => !!x))];

    const [{ data: profiles }, { data: orgs }] = await Promise.all([
      actorIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name, email").in("id", actorIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string | null }> }),
      orgIds.length
        ? supabaseAdmin.from("organizations").select("id, name").in("id", orgIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);
    const actorById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const orgById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

    return (data ?? []).map((r) => ({
      id: r.id,
      actor_user_id: r.actor_user_id,
      actor_name: actorById.get(r.actor_user_id)?.full_name ?? actorById.get(r.actor_user_id)?.email ?? null,
      action: r.action,
      target_org_id: r.target_org_id,
      target_org_name: r.target_org_id ? (orgById.get(r.target_org_id) ?? null) : null,
      summary: r.summary,
      created_at: r.created_at,
    }));
  });
