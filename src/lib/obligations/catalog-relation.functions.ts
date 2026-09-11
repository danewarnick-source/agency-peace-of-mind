/**
 * Intake → catalog persist (Compliance revamp Step 7).
 * Soft columns on nectar_requirements. No-ops cleanly until Core applies SQL.
 */

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  catalogRelationWritePatch,
  isCatalogRelationKind,
  isCatalogRelationStatus,
  missingCatalogRelationColumn,
  proposeCatalogRelation,
  type CatalogOverlay,
  type CatalogRelationKind,
  type CatalogRelationProposal,
  type CatalogRelationStatus,
} from "./catalog-relation.ts";

const RELATION_SELECT =
  "id, title, description, source_citation, requirement_key, review_status, catalog_key, catalog_relation, catalog_relation_status, catalog_relation_rationale, catalog_overlay";

const RELATION_SELECT_FALLBACK =
  "id, title, description, source_citation, requirement_key, review_status";

export type AgencySourceRow = {
  id: string;
  title: string;
  description: string | null;
  source_citation: string | null;
  requirement_key: string;
  review_status: string;
  catalog_key: string | null;
  catalog_relation: CatalogRelationKind | null;
  catalog_relation_status: CatalogRelationStatus | null;
  catalog_relation_rationale: string | null;
  catalog_overlay: CatalogOverlay | null;
  live_proposal: CatalogRelationProposal;
  persisted: boolean;
};

type StoredReq = {
  id: string;
  title: string;
  description: string | null;
  source_citation: string | null;
  requirement_key: string;
  review_status: string;
  catalog_key?: string | null;
  catalog_relation?: string | null;
  catalog_relation_status?: string | null;
  catalog_relation_rationale?: string | null;
  catalog_overlay?: CatalogOverlay | Json | null;
};

function overlayFromJson(value: CatalogOverlay | Json | null | undefined): CatalogOverlay | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.agency_title !== "string" || typeof rec.catalog_title !== "string") {
    return null;
  }
  return {
    agency_title: rec.agency_title,
    catalog_title: rec.catalog_title,
    citation_delta: rec.citation_delta === true,
  };
}

function toAgencyRow(row: StoredReq, persisted: boolean): AgencySourceRow {
  const live = proposeCatalogRelation({
    title: row.title,
    description: row.description,
    source_citation: row.source_citation,
    requirement_key: row.requirement_key,
  });
  const storedKind = isCatalogRelationKind(row.catalog_relation)
    ? row.catalog_relation
    : null;
  const storedStatus = isCatalogRelationStatus(row.catalog_relation_status)
    ? row.catalog_relation_status
    : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    source_citation: row.source_citation,
    requirement_key: row.requirement_key,
    review_status: row.review_status,
    catalog_key: persisted ? (row.catalog_key ?? null) : live.catalog_key,
    catalog_relation: persisted ? storedKind : live.kind,
    catalog_relation_status: persisted ? storedStatus : null,
    catalog_relation_rationale: persisted
      ? (row.catalog_relation_rationale ?? null)
      : live.rationale,
    catalog_overlay: persisted ? overlayFromJson(row.catalog_overlay) : live.overlay,
    live_proposal: live,
    persisted,
  };
}

async function loadAgencySourceRows(
  supabase: SupabaseClient<Database> | SupabaseClient,
  organizationId: string,
): Promise<{ rows: AgencySourceRow[]; softReady: boolean }> {
  const first = await supabase
    .from("nectar_requirements")
    .select(RELATION_SELECT)
    .eq("organization_id", organizationId)
    .neq("review_status", "removed")
    .order("title", { ascending: true });

  if (!first.error) {
    return {
      softReady: true,
      rows: (first.data ?? []).map((row) =>
        toAgencyRow(row, isCatalogRelationKind(row.catalog_relation)),
      ),
    };
  }
  if (!missingCatalogRelationColumn(first.error.message)) {
    throw new Error(first.error.message);
  }

  const fallback = await supabase
    .from("nectar_requirements")
    .select(RELATION_SELECT_FALLBACK)
    .eq("organization_id", organizationId)
    .neq("review_status", "removed")
    .order("title", { ascending: true });
  if (fallback.error) throw new Error(fallback.error.message);
  return {
    softReady: false,
    rows: (fallback.data ?? []).map((row) => toAgencyRow(row, false)),
  };
}

export const listCatalogRelations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) {
      return { rows: [] as AgencySourceRow[], softReady: false };
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    return loadAgencySourceRows(supabase, data.organizationId);
  });

export const proposeCatalogRelations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        requirementIds: z.array(z.string().uuid()).max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) {
      return { proposed: 0, skipped: 0, persisted: false, softReady: false };
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const loaded = await loadAgencySourceRows(supabase, data.organizationId);
    const wanted = data.requirementIds
      ? new Set(data.requirementIds)
      : null;
    let proposed = 0;
    let skipped = 0;
    if (!loaded.softReady) {
      return {
        proposed: 0,
        skipped: loaded.rows.length,
        persisted: false,
        softReady: false,
      };
    }
    for (const row of loaded.rows) {
      if (wanted && !wanted.has(row.id)) continue;
      if (row.catalog_relation_status === "confirmed") {
        skipped += 1;
        continue;
      }
      const patch = catalogRelationWritePatch(row.live_proposal);
      const { error } = await supabase
        .from("nectar_requirements")
        .update({
          catalog_key: patch.catalog_key,
          catalog_relation: patch.catalog_relation,
          catalog_relation_status: patch.catalog_relation_status,
          catalog_relation_rationale: patch.catalog_relation_rationale,
          catalog_overlay: patch.catalog_overlay as Json | null,
        })
        .eq("id", row.id)
        .eq("organization_id", data.organizationId);
      if (error) {
        if (missingCatalogRelationColumn(error.message)) {
          return { proposed, skipped, persisted: false, softReady: false };
        }
        throw new Error(error.message);
      }
      proposed += 1;
    }
    return { proposed, skipped, persisted: true, softReady: true };
  });

export const setCatalogRelationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        requirementId: z.string().uuid(),
        status: z.enum(["confirmed", "dismissed", "proposed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false, softReady: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const { error } = await supabase
      .from("nectar_requirements")
      .update({ catalog_relation_status: data.status })
      .eq("id", data.requirementId)
      .eq("organization_id", data.organizationId);
    if (error) {
      if (missingCatalogRelationColumn(error.message)) {
        return { ok: false, softReady: false };
      }
      throw new Error(error.message);
    }
    return { ok: true, softReady: true };
  });
