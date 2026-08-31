/**
 * Fulfill a paid / waived training class roster.
 * Used by Stripe webhook, checkout confirm, and the TNS $0 skip-charge path.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { THIRTY_DAY_OBLIGATION_TITLE } from "@/lib/in-hive-training";
import {
  CPR_OBLIGATION_TITLES,
  MANDT_OBLIGATION_TITLES,
  formatRosterContactLine,
  trainingClassIsExternal,
  trainingClassLabel,
  type TrainingClassType,
} from "@/lib/training-class";
import { ensureOpenStaffObligationInternal } from "@/lib/ensure-staff-obligation";
import { hireDueDaysForTitle } from "@/lib/obligation-auto-assign";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type FulfillTrainingClassInput = {
  classId: string;
  organizationId: string;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  amountCents?: number;
  waived?: boolean;
};

function titlesForType(type: TrainingClassType): string[] {
  if (type === "cpr_first_aid") return [...CPR_OBLIGATION_TITLES];
  if (type === "mandt") return [...MANDT_OBLIGATION_TITLES];
  if (type === "thirty_day") return [THIRTY_DAY_OBLIGATION_TITLE];
  return [THIRTY_DAY_OBLIGATION_TITLE, CPR_OBLIGATION_TITLES[0], MANDT_OBLIGATION_TITLES[0]];
}

async function notifyHiveExecOnce(
  sb: AnySupabase,
  organizationId: string,
  classId: string,
  title: string,
  body: string,
): Promise<void> {
  const { data: execs, error } = await sb
    .from("hive_executives")
    .select("user_id")
    .eq("active", true);
  if (error) throw new Error(error.message);
  const rows = ((execs ?? []) as Array<{ user_id: string }>).map((e) => ({
    organization_id: organizationId,
    recipient_user_id: e.user_id,
    recipient_role: "super_admin",
    type: "hive_training_class",
    urgency: "normal",
    title,
    body,
    link_to: "/dashboard/hive-exec/classes",
    related_id: classId,
    related_type: "training_class",
  }));
  if (!rows.length) return;
  const { error: insErr } = await sb.from("notifications").insert(rows);
  if (insErr) {
    // Inbox type whitelist may not include hive_training_class until Dane
    // runs the SQL. Classes tab + exec banner still work without this row.
    console.error("training class exec notification skipped:", insErr.message);
  }
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
  const role = ((mems ?? []) as Array<{ user_id: string; role: string }>).find((m) => m.user_id === hit.id)
    ?.role ?? "employee";
  return { id: hit.id, full_name: hit.full_name, role };
}

async function ensureOpenObligationForStaff(
  sb: AnySupabase,
  organizationId: string,
  titles: string[],
  staff: { id: string; full_name: string | null; role: string },
): Promise<void> {
  await ensureOpenStaffObligationInternal(sb, organizationId, titles, staff, {
    dueDays: hireDueDaysForTitle(titles[0] ?? ""),
    periodPrefix: "Class roster",
  });
}

export async function fulfillTrainingClass(input: FulfillTrainingClassInput): Promise<{ ok: true }> {
  const sb = supabaseAdmin as AnySupabase;
  const nowIso = new Date().toISOString();

  const { data: cls, error: clsErr } = await sb
    .from("training_classes")
    .select("id, organization_id, training_type, is_external, payment_status, exec_alerted_at, provider_name, seat_count")
    .eq("id", input.classId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (clsErr) throw new Error(clsErr.message);
  if (!cls) throw new Error("Training class not found.");

  const alreadyPaid = cls.payment_status === "paid" || cls.payment_status === "waived";
  if (!alreadyPaid) {
    await sb
      .from("training_classes")
      .update({
        payment_status: input.waived ? "waived" : "paid",
        amount_cents: input.waived ? 0 : (input.amountCents ?? 0),
        stripe_checkout_session_id: input.stripeSessionId ?? null,
        stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
        updated_at: nowIso,
      })
      .eq("id", input.classId);
  }

  const { data: roster, error: rosErr } = await sb
    .from("training_class_roster")
    .select("id, staff_user_id, staff_name, staff_email, staff_phone")
    .eq("class_id", input.classId)
    .order("sort_order", { ascending: true });
  if (rosErr) throw new Error(rosErr.message);
  const rows = (roster ?? []) as Array<{
    id: string;
    staff_user_id: string | null;
    staff_name: string;
    staff_email: string;
    staff_phone: string | null;
  }>;

  const type = cls.training_type as TrainingClassType;
  const titleGroups = titlesForType(type).reduce<string[][]>((acc, title) => {
    if (title === THIRTY_DAY_OBLIGATION_TITLE) acc.push([THIRTY_DAY_OBLIGATION_TITLE]);
    else if (CPR_OBLIGATION_TITLES.includes(title as (typeof CPR_OBLIGATION_TITLES)[number])) {
      if (!acc.some((g) => g[0] === CPR_OBLIGATION_TITLES[0])) acc.push([...CPR_OBLIGATION_TITLES]);
    } else if (MANDT_OBLIGATION_TITLES.includes(title as (typeof MANDT_OBLIGATION_TITLES)[number])) {
      if (!acc.some((g) => g[0] === MANDT_OBLIGATION_TITLES[0])) acc.push([...MANDT_OBLIGATION_TITLES]);
    }
    return acc;
  }, []);

  for (const row of rows) {
    let staffId = row.staff_user_id;
    let staff = staffId
      ? { id: staffId, full_name: row.staff_name, role: "employee" }
      : await matchStaffByEmail(sb, input.organizationId, row.staff_email);
    if (staff && !staffId) {
      await sb
        .from("training_class_roster")
        .update({ staff_user_id: staff.id })
        .eq("id", row.id)
        .is("staff_user_id", null);
    }
    if (!staff) continue;
    for (const titles of titleGroups) {
      await ensureOpenObligationForStaff(sb, input.organizationId, titles, staff);
    }
  }

  const shouldAlert = trainingClassIsExternal(type) && !cls.exec_alerted_at;
  if (shouldAlert) {
    const contacts = rows.map((r) => formatRosterContactLine(r)).join("; ");
    const agency = cls.provider_name || "A provider";
    await notifyHiveExecOnce(
      sb,
      input.organizationId,
      input.classId,
      `${agency} submitted a ${trainingClassLabel(type)} class`,
      `${agency} · ${rows.length} staff: ${contacts}`,
    );
    await sb
      .from("training_classes")
      .update({ exec_alerted_at: nowIso, updated_at: nowIso })
      .eq("id", input.classId);
  }

  return { ok: true };
}
