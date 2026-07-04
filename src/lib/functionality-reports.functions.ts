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

export type FunctionalityReportStatus = "open" | "triaged" | "resolved" | "dismissed";

export interface FunctionalityReport {
  id: string;
  organization_id: string | null;
  organization_name: string | null;
  reported_by: string | null;
  source: "self_report" | "auto_detect";
  screen: string | null;
  description: string;
  technical_context: unknown;
  status: FunctionalityReportStatus;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

export const listFunctionalityReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FunctionalityReport[]> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const { data, error } = await supabase
      .from("functionality_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = (data ?? []) as FunctionalityReport[];
    const orgIds = Array.from(new Set(rows.map((r) => r.organization_id).filter(Boolean))) as string[];
    if (orgIds.length === 0) return rows.map((r) => ({ ...r, organization_name: null }));
    const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", orgIds);
    const nameById = new Map<string, string>(
      ((orgs ?? []) as Array<{ id: string; name: string }>).map((o) => [o.id, o.name]),
    );
    return rows.map((r) => ({
      ...r,
      organization_name: r.organization_id ? nameById.get(r.organization_id) ?? null : null,
    }));
  });

/**
 * PHI stripper — any key that mentions client-side identifiers is removed
 * before storage. Callers should still avoid populating them; this is a
 * defense-in-depth net.
 */
const PHI_KEY_PATTERN = /(client|patient|phi|dob|ssn|mrn|diagnosis)/i;
function stripPhi(input: unknown): unknown {
  if (input == null) return input;
  if (Array.isArray(input)) return input.map(stripPhi);
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (PHI_KEY_PATTERN.test(k)) continue;
      out[k] = stripPhi(v);
    }
    return out;
  }
  return input;
}

const createSchema = z.object({
  organization_id: z.string().uuid().nullable().optional(),
  screen: z.string().max(200).nullable().optional(),
  description: z.string().min(3).max(4000),
  technical_context: z.unknown().optional(),
  source: z.enum(["self_report", "auto_detect"]).default("self_report"),
});

export const createFunctionalityReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("functionality_reports").insert({
      organization_id: data.organization_id ?? null,
      reported_by: userId,
      source: data.source,
      screen: data.screen ?? null,
      description: data.description,
      technical_context: stripPhi(data.technical_context ?? {}) as object,
    });
    if (error) throw error;
    return { ok: true };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "triaged", "resolved", "dismissed"]),
  resolution_notes: z.string().max(4000).nullable().optional(),
});

export const updateFunctionalityReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    const patch: Record<string, unknown> = {
      status: data.status,
      resolution_notes: data.resolution_notes ?? null,
    };
    if (data.status === "resolved" || data.status === "dismissed") {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = userId;
    }
    const { error } = await supabase.from("functionality_reports").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
