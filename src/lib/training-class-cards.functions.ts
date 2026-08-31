/**
 * Admin uploads a CPR / Mandt completion card after the class.
 * That closes the staff obligation. Staff do not upload their own card here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CPR_OBLIGATION_TITLES, MANDT_OBLIGATION_TITLES, type TrainingClassType } from "@/lib/training-class";
import {
  ensureOpenStaffObligationInternal,
  loadStaffForEnsure,
} from "@/lib/ensure-staff-obligation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const CARD_MAX_BYTES = 20 * 1024 * 1024;
const CARD_BUCKET = "obligation-evidence";

async function assertAdmin(supabase: AnySupabase, orgId: string, userId: string) {
  const { data, error } = await supabase.rpc("is_org_admin_or_manager", {
    _org: orgId,
    _user: userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only an admin can upload a class card.");
}

function titlesForClassType(type: TrainingClassType): string[] {
  if (type === "mandt") return [...MANDT_OBLIGATION_TITLES];
  if (type === "package") return [...CPR_OBLIGATION_TITLES, ...MANDT_OBLIGATION_TITLES];
  return [...CPR_OBLIGATION_TITLES];
}

async function matchStaffByEmail(
  sb: AnySupabase,
  organizationId: string,
  email: string,
): Promise<{ id: string; full_name: string | null; role: string } | null> {
  const { data: mems, error: memErr } = await sb
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (memErr) throw new Error(memErr.message);
  const ids = ((mems ?? []) as Array<{ user_id: string; role: string }>).map((m) => m.user_id);
  if (!ids.length) return null;
  const { data: profs, error: profErr } = await sb
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  if (profErr) throw new Error(profErr.message);
  const want = email.trim().toLowerCase();
  const hit = ((profs ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).find(
    (p) => (p.email ?? "").trim().toLowerCase() === want,
  );
  if (!hit) return null;
  const role =
    ((mems ?? []) as Array<{ user_id: string; role: string }>).find((m) => m.user_id === hit.id)?.role ??
    "employee";
  return { id: hit.id, full_name: hit.full_name, role };
}

async function closeObligationWithCard(
  sb: AnySupabase,
  organizationId: string,
  titles: string[],
  staff: { id: string; full_name: string | null; role: string },
  uploadPath: string,
  uploadFilename: string,
  adminId: string,
): Promise<void> {
  const opened = await ensureOpenStaffObligationInternal(sb, organizationId, titles, staff, {
    periodPrefix: "Class card",
  });
  if (!opened) return;

  const { data: already } = await sb
    .from("company_obligation_completions")
    .select("id")
    .eq("instance_id", opened.id)
    .eq("staff_id", staff.id)
    .limit(1);
  if (((already ?? []) as Array<{ id: string }>).length) {
    await sb
      .from("company_obligation_instances")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by_id: staff.id,
        completed_by_name: staff.full_name ?? "Staff",
        evidence_type_used: "upload",
        upload_path: uploadPath,
        upload_filename: uploadFilename,
      })
      .eq("id", opened.id)
      .in("status", ["pending", "overdue"]);
    return;
  }

  const nowIso = new Date().toISOString();
  const { error: cErr } = await sb.from("company_obligation_completions").insert({
    instance_id: opened.id,
    organization_id: organizationId,
    staff_id: staff.id,
    staff_name: staff.full_name ?? "Staff",
    evidence_type_used: "upload",
    upload_path: uploadPath,
    upload_filename: uploadFilename,
    is_manual_entry: true,
    manual_entry_by: adminId,
    manual_entry_by_name: "Admin class card",
    completed_at: nowIso,
  });
  if (cErr && (cErr as { code?: string }).code !== "23505") throw new Error(cErr.message);

  await sb
    .from("company_obligation_instances")
    .update({
      status: "completed",
      completed_at: nowIso,
      completed_by_id: staff.id,
      completed_by_name: staff.full_name ?? "Staff",
      evidence_type_used: "upload",
      upload_path: uploadPath,
      upload_filename: uploadFilename,
    })
    .eq("id", opened.id)
    .in("status", ["pending", "overdue"]);
}

export const createTrainingClassCardUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        classId: z.string().uuid(),
        rosterId: z.string().uuid().optional().nullable(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().max(255).optional(),
        sizeBytes: z.number().int().min(1).max(CARD_MAX_BYTES),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { objectPath: null as string | null, upload: null };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    await assertAdmin(supabase, data.organizationId, userId);

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `${data.organizationId}/class-cards/${data.classId}/${data.rosterId ?? "class"}/${crypto.randomUUID()}-${safeName}`;
    const { data: signed, error } = await supabase.storage
      .from(CARD_BUCKET)
      .createSignedUploadUrl(objectPath);
    if (error) throw new Error(error.message);
    return {
      objectPath,
      upload: {
        signed_url: signed.signedUrl as string,
        token: signed.token as string,
        path: signed.path as string,
      },
    };
  });

export const attachTrainingClassCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        classId: z.string().uuid(),
        rosterId: z.string().uuid().optional().nullable(),
        applyToWholeClass: z.boolean().optional(),
        objectPath: z.string().min(1).max(2000),
        fileName: z.string().min(1).max(255),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false, closed: 0 };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    await assertAdmin(supabase, data.organizationId, userId);

    const admin = supabaseAdmin as AnySupabase;
    const { data: cls, error: clsErr } = await admin
      .from("training_classes")
      .select("id, organization_id, training_type")
      .eq("id", data.classId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (clsErr) throw new Error(clsErr.message);
    if (!cls) throw new Error("Class not found.");

    const type = cls.training_type as TrainingClassType;
    if (type === "thirty_day") {
      throw new Error("30-day orientation is completed in Hive, not with a class card.");
    }
    const titleGroups =
      type === "package"
        ? [[...CPR_OBLIGATION_TITLES], [...MANDT_OBLIGATION_TITLES]]
        : [titlesForClassType(type)];

    const { data: roster, error: rosErr } = await admin
      .from("training_class_roster")
      .select("id, staff_user_id, staff_name, staff_email")
      .eq("class_id", data.classId)
      .eq("organization_id", data.organizationId);
    if (rosErr) throw new Error(rosErr.message);
    let rows = (roster ?? []) as Array<{
      id: string;
      staff_user_id: string | null;
      staff_name: string;
      staff_email: string;
    }>;
    if (!data.applyToWholeClass && data.rosterId) {
      rows = rows.filter((r) => r.id === data.rosterId);
    }
    if (!rows.length) throw new Error("No staff on this roster to attach a card to.");

    const nowIso = new Date().toISOString();
    let closed = 0;
    for (const row of rows) {
      let staff = row.staff_user_id
        ? await loadStaffForEnsure(admin, data.organizationId, row.staff_user_id)
        : await matchStaffByEmail(admin, data.organizationId, row.staff_email);
      if (!staff) {
        staff = {
          id: row.staff_user_id ?? "",
          full_name: row.staff_name,
          role: "employee",
        };
      }
      if (!staff.id) continue;

      await admin
        .from("training_class_roster")
        .update({
          card_path: data.objectPath,
          card_filename: data.fileName,
          card_uploaded_at: nowIso,
          card_uploaded_by: userId,
          staff_user_id: staff.id,
        })
        .eq("id", row.id);

      for (const titles of titleGroups) {
        await closeObligationWithCard(
          admin,
          data.organizationId,
          titles,
          staff,
          data.objectPath,
          data.fileName,
          userId,
        );
      }
      closed += 1;
    }

    const { data: after } = await admin
      .from("training_class_roster")
      .select("card_uploaded_at")
      .eq("class_id", data.classId);
    const allIn = ((after ?? []) as Array<{ card_uploaded_at: string | null }>).every(
      (r) => !!r.card_uploaded_at,
    );
    if (allIn) {
      await admin
        .from("training_classes")
        .update({
          class_card_path: data.objectPath,
          class_card_filename: data.fileName,
          class_card_uploaded_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", data.classId);
    } else if (data.applyToWholeClass) {
      await admin
        .from("training_classes")
        .update({
          class_card_path: data.objectPath,
          class_card_filename: data.fileName,
          class_card_uploaded_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", data.classId);
    }

    return { ok: true, closed };
  });
