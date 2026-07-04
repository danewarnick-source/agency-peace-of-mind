import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  if (!data) throw new Error("Executive access required.");
}

export type AgreementStatus = "not_started" | "sent" | "signed" | "expired";

export interface AgreementRequirement {
  id: string;
  name: string;
  description: string | null;
  required: boolean;
  renewal_period_months: number | null;
  sort_order: number;
}

export interface OrgAgreement {
  id: string | null;
  organization_id: string;
  requirement_id: string;
  status: AgreementStatus;
  file_path: string | null;
  signed_date: string | null;
  expiration_date: string | null;
  renewal_due_date: string | null;
  notes: string | null;
  updated_at: string | null;
}

export const listAgreementRequirements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgreementRequirement[]> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { data, error } = await supabase
      .from("agreement_requirements")
      .select("id, name, description, required, renewal_period_months, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as AgreementRequirement[];
  });

const reqSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  required: z.boolean().default(true),
  renewal_period_months: z.number().int().positive().nullable().optional(),
  sort_order: z.number().int().default(0),
});

export const upsertAgreementRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reqSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const payload = {
      name: data.name,
      description: data.description ?? null,
      required: data.required,
      renewal_period_months: data.renewal_period_months ?? null,
      sort_order: data.sort_order,
    };
    if (data.id) {
      const { error } = await supabase
        .from("agreement_requirements")
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase
      .from("agreement_requirements")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: (row as { id: string }).id };
  });

export const deleteAgreementRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { error } = await supabase
      .from("agreement_requirements")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export interface OrgAgreementChecklistItem extends AgreementRequirement {
  agreement: OrgAgreement | null;
  attention: null | "overdue" | "expiring_soon";
}

function attentionFor(a: OrgAgreement | null): OrgAgreementChecklistItem["attention"] {
  if (!a) return null;
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86_400_000);
  if (a.status === "expired") return "overdue";
  const dates = [a.renewal_due_date, a.expiration_date].filter(Boolean) as string[];
  for (const d of dates) {
    const dt = new Date(d);
    if (dt < now) return "overdue";
    if (dt <= in30) return "expiring_soon";
  }
  return null;
}

export const getOrgAgreements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ organizationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<OrgAgreementChecklistItem[]> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const [reqs, insts] = await Promise.all([
      supabase
        .from("agreement_requirements")
        .select("id, name, description, required, renewal_period_months, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("organization_agreements")
        .select("*")
        .eq("organization_id", data.organizationId),
    ]);
    if (reqs.error) throw reqs.error;
    if (insts.error) throw insts.error;
    const byReq = new Map<string, OrgAgreement>();
    for (const row of (insts.data ?? []) as OrgAgreement[]) {
      byReq.set(row.requirement_id, row);
    }
    return ((reqs.data ?? []) as AgreementRequirement[]).map((r) => {
      const a = byReq.get(r.id) ?? null;
      return { ...r, agreement: a, attention: attentionFor(a) };
    });
  });

const upsertOrgSchema = z.object({
  organization_id: z.string().uuid(),
  requirement_id: z.string().uuid(),
  status: z.enum(["not_started", "sent", "signed", "expired"]),
  file_path: z.string().max(1000).nullable().optional(),
  signed_date: z.string().nullable().optional(),
  expiration_date: z.string().nullable().optional(),
  renewal_due_date: z.string().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const upsertOrgAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => upsertOrgSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { error } = await supabase
      .from("organization_agreements")
      .upsert(
        {
          organization_id: data.organization_id,
          requirement_id: data.requirement_id,
          status: data.status,
          file_path: data.file_path ?? null,
          signed_date: data.signed_date ?? null,
          expiration_date: data.expiration_date ?? null,
          renewal_due_date: data.renewal_due_date ?? null,
          notes: data.notes ?? null,
          uploaded_by: userId,
        },
        { onConflict: "organization_id,requirement_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export interface MatrixCell {
  organization_id: string;
  requirement_id: string;
  status: AgreementStatus | "missing";
  attention: OrgAgreementChecklistItem["attention"];
  renewal_due_date: string | null;
  expiration_date: string | null;
}

export interface MatrixData {
  organizations: Array<{ id: string; name: string }>;
  requirements: AgreementRequirement[];
  cells: MatrixCell[];
}

export const listAgreementsMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MatrixData> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const [orgs, reqs, insts] = await Promise.all([
      supabase.from("organizations").select("id, name").order("name"),
      supabase
        .from("agreement_requirements")
        .select("id, name, description, required, renewal_period_months, sort_order")
        .order("sort_order"),
      supabase.from("organization_agreements").select("*"),
    ]);
    if (orgs.error) throw orgs.error;
    if (reqs.error) throw reqs.error;
    if (insts.error) throw insts.error;

    const instMap = new Map<string, OrgAgreement>();
    for (const row of (insts.data ?? []) as OrgAgreement[]) {
      instMap.set(`${row.organization_id}::${row.requirement_id}`, row);
    }
    const orgList = (orgs.data ?? []) as Array<{ id: string; name: string }>;
    const reqList = (reqs.data ?? []) as AgreementRequirement[];
    const cells: MatrixCell[] = [];
    for (const o of orgList) {
      for (const r of reqList) {
        const a = instMap.get(`${o.id}::${r.id}`) ?? null;
        cells.push({
          organization_id: o.id,
          requirement_id: r.id,
          status: a?.status ?? "missing",
          attention: attentionFor(a),
          renewal_due_date: a?.renewal_due_date ?? null,
          expiration_date: a?.expiration_date ?? null,
        });
      }
    }
    return { organizations: orgList, requirements: reqList, cells };
  });
