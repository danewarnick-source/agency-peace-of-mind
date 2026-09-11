/**
 * Intake → catalog (Compliance revamp Step 7).
 *
 * NECTAR-drafted nectar_requirements stay as agency-source evidence.
 * This module proposes a relation to the keyed SOW catalog:
 *   match    — same duty (title / alias / key)
 *   overlay  — agency wording of a known catalog duty
 *   conflict — competing keys, citation mismatch, or no counterpart
 *
 * Pure. Persist lives in catalog-relation.functions.ts.
 */

import {
  allSowCatalogEntries,
  sowCatalogEntry,
  sowCatalogEntryByKey,
  type SowCatalogEntry,
} from "../sow-obligation-catalog.ts";

export const CATALOG_RELATION_KINDS = ["match", "overlay", "conflict"] as const;
export type CatalogRelationKind = (typeof CATALOG_RELATION_KINDS)[number];

export const CATALOG_RELATION_STATUSES = [
  "proposed",
  "confirmed",
  "dismissed",
] as const;
export type CatalogRelationStatus = (typeof CATALOG_RELATION_STATUSES)[number];

export type CatalogRelationInput = {
  title: string;
  description?: string | null;
  source_citation?: string | null;
  requirement_key?: string | null;
};

export type CatalogRelationProposal = {
  kind: CatalogRelationKind;
  catalog_key: string | null;
  catalog_title: string | null;
  rationale: string;
  overlay: CatalogOverlay | null;
  confidence: "exact" | "alias" | "citation" | "token" | "none";
};

export type CatalogOverlay = {
  agency_title: string;
  catalog_title: string;
  citation_delta: boolean;
};

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "shall",
  "must",
  "have",
  "has",
  "are",
  "was",
  "not",
  "any",
  "all",
  "per",
  "its",
  "his",
  "her",
  "their",
  "each",
  "into",
  "onto",
  "over",
  "under",
  "when",
  "than",
  "then",
  "also",
  "only",
  "sow",
  "dhhs",
  "dspd",
]);

export function normalizeCatalogText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function citationSection(citation: string | null | undefined): string | null {
  if (!citation) return null;
  const section = citation.match(/§\s*([0-9]+(?:\.[0-9]+)*(?:\([^)]+\))*)/i);
  if (section?.[1]) return normalizeCatalogText(section[1]);
  const article = citation.match(/\b(?:article|art\.?)\s*([0-9]+(?:\.[0-9]+)*)/i);
  if (article?.[1]) return normalizeCatalogText(article[1]);
  return null;
}

export function catalogTextTokens(value: string): Set<string> {
  const tokens = normalizeCatalogText(value)
    .split(" ")
    .filter((t) => t.length > 2 && !STOP.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

type Scored = {
  entry: SowCatalogEntry;
  score: number;
  via: "citation" | "token";
};

function scoreCatalogCandidates(input: CatalogRelationInput): Scored[] {
  const titleTokens = catalogTextTokens(
    `${input.title} ${input.description ?? ""}`,
  );
  const section = citationSection(input.source_citation);
  const scored: Scored[] = [];
  for (const entry of allSowCatalogEntries()) {
    const titleScore = jaccard(titleTokens, catalogTextTokens(entry.title));
    const citeScore =
      section && citationSection(entry.citation) === section ? 0.35 : 0;
    const score = titleScore + citeScore;
    if (score < 0.28) continue;
    scored.push({
      entry,
      score,
      via: citeScore > 0 ? "citation" : "token",
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function overlayFor(
  input: CatalogRelationInput,
  entry: SowCatalogEntry,
): CatalogOverlay {
  const agencySection = citationSection(input.source_citation);
  const catalogSection = citationSection(entry.citation);
  return {
    agency_title: input.title,
    catalog_title: entry.title,
    citation_delta:
      !!agencySection && !!catalogSection && agencySection !== catalogSection,
  };
}

/**
 * Propose how an intake / agency-source requirement relates to the catalog.
 * Deterministic. Does not write.
 */
export function proposeCatalogRelation(
  input: CatalogRelationInput,
): CatalogRelationProposal {
  const title = input.title.trim();
  if (!title) {
    return {
      kind: "conflict",
      catalog_key: null,
      catalog_title: null,
      rationale: "Requirement has no title — cannot relate to the catalog.",
      overlay: null,
      confidence: "none",
    };
  }

  const byKey = input.requirement_key
    ? sowCatalogEntryByKey(input.requirement_key)
    : null;
  const byTitle = sowCatalogEntry(title);
  const exact = byKey ?? byTitle;
  if (exact) {
    const viaKey = byKey != null && byKey.key === exact.key;
    return {
      kind: "match",
      catalog_key: exact.key,
      catalog_title: exact.title,
      rationale: viaKey
        ? `Requirement key maps to catalog key ${exact.key}.`
        : `Title aliases to catalog key ${exact.key} (${exact.title}).`,
      overlay: null,
      confidence: viaKey ? "exact" : "alias",
    };
  }

  const ranked = scoreCatalogCandidates(input);
  const top = ranked[0];
  const second = ranked[1];
  if (!top) {
    return {
      kind: "conflict",
      catalog_key: null,
      catalog_title: null,
      rationale: "No catalog counterpart — agency source does not resolve to a keyed duty.",
      overlay: null,
      confidence: "none",
    };
  }

  if (second && top.score - second.score < 0.08 && second.score >= 0.4) {
    return {
      kind: "conflict",
      catalog_key: null,
      catalog_title: null,
      rationale: `Ambiguous: ${top.entry.key} and ${second.entry.key} both score as counterparts.`,
      overlay: null,
      confidence: "token",
    };
  }

  const agencySection = citationSection(input.source_citation);
  const catalogSection = citationSection(top.entry.citation);
  if (
    agencySection &&
    catalogSection &&
    agencySection !== catalogSection &&
    top.score >= 0.4
  ) {
    return {
      kind: "conflict",
      catalog_key: top.entry.key,
      catalog_title: top.entry.title,
      rationale: `Title is close to ${top.entry.key} but citation §${agencySection} disagrees with catalog §${catalogSection}.`,
      overlay: overlayFor(input, top.entry),
      confidence: "token",
    };
  }

  if (top.via === "citation" || top.score >= 0.4) {
    return {
      kind: "overlay",
      catalog_key: top.entry.key,
      catalog_title: top.entry.title,
      rationale:
        top.via === "citation"
          ? `Agency wording of catalog key ${top.entry.key} (shared citation).`
          : `Agency wording overlaps catalog key ${top.entry.key}.`,
      overlay: overlayFor(input, top.entry),
      confidence: top.via,
    };
  }

  return {
    kind: "conflict",
    catalog_key: null,
    catalog_title: null,
    rationale: "No catalog counterpart — agency source does not resolve to a keyed duty.",
    overlay: null,
    confidence: "none",
  };
}

export function isCatalogRelationKind(
  value: string | null | undefined,
): value is CatalogRelationKind {
  return (
    value === "match" || value === "overlay" || value === "conflict"
  );
}

export function isCatalogRelationStatus(
  value: string | null | undefined,
): value is CatalogRelationStatus {
  return (
    value === "proposed" ||
    value === "confirmed" ||
    value === "dismissed"
  );
}

export function catalogRelationWritePatch(proposal: CatalogRelationProposal): {
  catalog_key: string | null;
  catalog_relation: CatalogRelationKind;
  catalog_relation_status: CatalogRelationStatus;
  catalog_relation_rationale: string;
  catalog_overlay: CatalogOverlay | null;
} {
  return {
    catalog_key: proposal.catalog_key,
    catalog_relation: proposal.kind,
    catalog_relation_status: "proposed",
    catalog_relation_rationale: proposal.rationale,
    catalog_overlay: proposal.overlay,
  };
}

/**
 * Step 7c / Step 9c promote overlay — same persist path as Agency Sources
 * Confirm (`setCatalogRelationStatus` → `confirmed`). Do not invent a
 * second promote writer.
 */
export function promoteOverlayStatus(): CatalogRelationStatus {
  return "confirmed";
}

export function missingCatalogRelationColumn(message: string): boolean {
  return (
    /catalog_key|catalog_relation|catalog_overlay/i.test(message) &&
    /does not exist|schema cache|could not find|column/i.test(message)
  );
}
