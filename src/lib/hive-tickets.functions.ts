import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";


// ============================================================
// HIVE Executive NECTAR — platform ticket queue.
// Tickets are real DB rows, not seeded sample data. They come from
// two sources:
//   1. auto — NECTAR detects a platform-level event (parsing failure,
//      no-extraction-found, AI error, etc.) and files a ticket.
//   2. manual — a HIVE executive files one for issues NECTAR cannot
//      yet detect on its own (permission inconsistencies, UX gaps).
// ============================================================

const CATEGORY = [
  "structural_gap",
  "parsing_failure",
  "expansion_need",
  "mapping_gap",
  "permission_inconsistency",
  "other",
] as const;
const SEVERITY = ["low", "medium", "high", "critical"] as const;
const STATUS = ["new", "in_progress", "resolved"] as const;

// ---------------------------------------------------------------
// Auto-report a platform event. Called from inside the company-side
// flow (e.g. generateRequirementsFromSource) — the caller is a
// company admin, not a HIVE exec, so this MUST use supabaseAdmin to
// bypass RLS for insert. Dedupes on (event_kind, dedupe_key) while
// any prior ticket for the same key is still open.
// ---------------------------------------------------------------
export async function reportPlatformEvent(input: {
  eventKind:
    | "parsing_no_text"
    | "ai_error"
    | "no_requirements_found"
    | "ingest_failure";
  organizationId: string | null;
  organizationName: string | null;
  title: string;
  detail: string;
  category: (typeof CATEGORY)[number];
  severity: (typeof SEVERITY)[number];
  dedupeKey: string; // stable, unique to this recurring class for this org/doc
  eventRef: Record<string, unknown>;
  nectarProposal?: {
    type: "operational" | "architectural";
    summary: string;
    changeKind: string;
    blastRadius: string;
    risk: "low" | "medium" | "high";
  };
}): Promise<void> {
  try {
    // If an open (not resolved) ticket with the same dedupe key exists,
    // append an audit entry instead of creating a duplicate.
    const { data: existing } = await supabaseAdmin
      .from("hive_platform_tickets")
      .select("id, audit, affected_orgs, triggering_org_id")
      .eq("dedupe_key", input.dedupeKey)
      .neq("status", "resolved")
      .maybeSingle();

    if (existing) {
      const prevAudit = Array.isArray(existing.audit)
        ? (existing.audit as unknown[])
        : [];
      const entry = {
        ts: new Date().toISOString(),
        actor: "NECTAR",
        action: "Re-observed event",
        note: `event=${input.eventKind}`,
      };
      const distinctOrgBumped =
        input.organizationId &&
        existing.triggering_org_id &&
        input.organizationId !== existing.triggering_org_id;
      await supabaseAdmin
        .from("hive_platform_tickets")
        .update({
          audit: [...prevAudit, entry],
          affected_orgs: distinctOrgBumped
            ? (existing.affected_orgs as number) + 1
            : existing.affected_orgs,
        })
        .eq("id", existing.id);
      return;
    }

    const audit = [
      {
        ts: new Date().toISOString(),
        actor: "NECTAR",
        action: "Auto-filed from live event",
        note: `event=${input.eventKind}`,
      },
    ];
    const resolution = input.nectarProposal
      ? { ...input.nectarProposal, affectedCompanies: 1, state: "drafted" }
      : {};
    await supabaseAdmin.from("hive_platform_tickets").insert({
      triggering_org_id: input.organizationId,
      triggering_org_name:
        input.organizationName ?? "Platform-wide pattern",
      title: input.title.slice(0, 240),
      detail: input.detail.slice(0, 4000),
      category: input.category,
      severity: input.severity,
      status: "new",
      source: "auto",
      event_kind: input.eventKind,
      event_ref: input.eventRef,
      dedupe_key: input.dedupeKey,
      affected_orgs: 1,
      resolution,
      audit,
    });
  } catch {
    // NEVER block the company-side flow on a HIVE-queue write failure.
    // Auto-tickets are an observability nicety; the user's action must
    // still succeed (or fail) on its own merits.
  }
}

// ---------------------------------------------------------------
// HIVE-exec-scoped reads/writes. RLS already restricts these to
// is_hive_executive — the user-scoped supabase client is fine.
// ---------------------------------------------------------------

export const listPlatformTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("hive_platform_tickets")
      .select(
        "id, triggering_org_id, triggering_org_name, title, detail, category, severity, status, source, event_kind, event_ref, affected_orgs, resolution, audit, detected_at, created_at, updated_at",
      )
      .order("detected_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { tickets: data ?? [] };
  });

export const createPlatformTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        triggeringOrgId: z.string().uuid().nullable().optional(),
        triggeringOrgName: z.string().min(1).max(240),
        title: z.string().min(3).max(240),
        detail: z.string().max(4000).default(""),
        category: z.enum(CATEGORY).default("other"),
        severity: z.enum(SEVERITY).default("medium"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const audit = [
      {
        ts: new Date().toISOString(),
        actor: "HIVE Exec",
        action: "Ticket filed manually",
      },
    ];
    const { data: row, error } = await supabase
      .from("hive_platform_tickets")
      .insert({
        triggering_org_id: data.triggeringOrgId ?? null,
        triggering_org_name: data.triggeringOrgName,
        title: data.title,
        detail: data.detail,
        category: data.category,
        severity: data.severity,
        status: "new",
        source: "manual",
        affected_orgs: 1,
        audit,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });

export const updatePlatformTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z
          .object({
            title: z.string().min(3).max(240).optional(),
            detail: z.string().max(4000).optional(),
            category: z.enum(CATEGORY).optional(),
            severity: z.enum(SEVERITY).optional(),
            status: z.enum(STATUS).optional(),
            resolution: z.record(z.string(), z.unknown()).optional(),
            appendAudit: z
              .object({
                actor: z.string().min(1).max(80),
                action: z.string().min(1).max(240),
                note: z.string().max(500).optional(),
              })
              .optional(),
          })
          .refine((p) => Object.keys(p).length > 0, "empty patch"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Pull current audit so we can append immutably.
    const { data: cur, error: cErr } = await supabase
      .from("hive_platform_tickets")
      .select("audit")
      .eq("id", data.id)
      .single();
    if (cErr) throw new Error(cErr.message);

    const patch: Record<string, unknown> = {};
    if (data.patch.title !== undefined) patch.title = data.patch.title;
    if (data.patch.detail !== undefined) patch.detail = data.patch.detail;
    if (data.patch.category !== undefined) patch.category = data.patch.category;
    if (data.patch.severity !== undefined) patch.severity = data.patch.severity;
    if (data.patch.status !== undefined) patch.status = data.patch.status;
    if (data.patch.resolution !== undefined)
      patch.resolution = data.patch.resolution;
    if (data.patch.appendAudit) {
      const prev = Array.isArray(cur?.audit) ? (cur!.audit as unknown[]) : [];
      patch.audit = [
        ...prev,
        { ts: new Date().toISOString(), ...data.patch.appendAudit },
      ];
    }

    const { error } = await supabase
      .from("hive_platform_tickets")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
