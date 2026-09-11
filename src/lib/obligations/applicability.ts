// Org-profile facts + obligation applicability (Compliance revamp Step 5).
// Catalog `when_applicable` rows stay visible until the matching fact is
// recorded. Service-code hides stay in obligationAppliesToFootprint.

import { sowCatalogEntryByKey } from "../sow-obligation-catalog.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export const TNS_ORG_ID = "7fabcf5d-f826-487f-8730-8b0c3f1969bb";

/** Yes / no / not yet recorded. Null means unanswered. */
export type FactAnswer = boolean | null;

export type OrgFactKey = "operates_ol_site" | "uses_volunteers" | "has_governing_board";

export const ORG_FACT_COLUMN: Record<OrgFactKey, string> = {
  operates_ol_site: "fact_operates_ol_site",
  uses_volunteers: "fact_uses_volunteers",
  has_governing_board: "fact_has_governing_board",
};

export const ORG_FACT_KEYS = Object.keys(ORG_FACT_COLUMN) as OrgFactKey[];

export const CHA_HSQ_PBA = ["CHA", "HSQ", "PBA"] as const;
export const RESIDENTIAL_HOUSEMATE_CODES = ["HHS", "PPS", "RHS"] as const;

export type OrgFactDefinition = {
  key: OrgFactKey;
  column: string;
  question: string;
  help: string;
  obligationKeys: string[];
};

export const ORG_FACT_DEFINITIONS: OrgFactDefinition[] = [
  {
    key: "operates_ol_site",
    column: ORG_FACT_COLUMN.operates_ol_site,
    question: "Does this contractor operate an OL-licensed or OL-certified site?",
    help: "Zoning / Life Safety documentation applies only when an Office of Licensing site is in use. Not the same as awarded service codes.",
    obligationKeys: ["zoning_life_safety"],
  },
  {
    key: "uses_volunteers",
    column: ORG_FACT_COLUMN.uses_volunteers,
    question: "Does this contractor use regularly scheduled volunteers?",
    help: "Friends and natural supports the Person chooses are not volunteers. Answer yes only for regularly scheduled volunteer staff.",
    obligationKeys: ["volunteer_training_file"],
  },
  {
    key: "has_governing_board",
    column: ORG_FACT_COLUMN.has_governing_board,
    question: "Does this contractor have a governing or policy-making board?",
    help: "By-laws and quarterly minutes apply only when such a board exists.",
    obligationKeys: ["governing_board_records"],
  },
];

export type OrgFacts = {
  operates_ol_site: FactAnswer;
  uses_volunteers: FactAnswer;
  has_governing_board: FactAnswer;
  servicesOffered: string[];
};

export const EMPTY_ORG_FACTS: OrgFacts = {
  operates_ol_site: null,
  uses_volunteers: null,
  has_governing_board: null,
  servicesOffered: [],
};

export type ApplicabilityStatus = "applies" | "does_not_apply" | "unanswered";

export type ObligationApplicability = {
  obligationKey: string;
  title: string;
  factKey: OrgFactKey | "services_only_cha_hsq_pba" | "residential_housemates";
  status: ApplicabilityStatus;
  applies: boolean;
  unanswered: boolean;
};

function normalizeCodes(codes: string[] | null | undefined): string[] {
  return (codes ?? []).map((c) => c.trim().toUpperCase()).filter((c) => c.length > 0);
}

export function parseFactAnswer(value: unknown): FactAnswer {
  if (value === true || value === false) return value;
  return null;
}

export function listUnansweredFacts(facts: OrgFacts): OrgFactDefinition[] {
  return ORG_FACT_DEFINITIONS.filter((def) => facts[def.key] === null);
}

function statusFromAnswer(answer: FactAnswer): ApplicabilityStatus {
  if (answer === null) return "unanswered";
  return answer ? "applies" : "does_not_apply";
}

function rowForFact(
  obligationKey: string,
  factKey: ObligationApplicability["factKey"],
  status: ApplicabilityStatus,
): ObligationApplicability {
  const title = sowCatalogEntryByKey(obligationKey)?.title ?? obligationKey;
  return {
    obligationKey,
    title,
    factKey,
    status,
    applies: status !== "does_not_apply",
    unanswered: status === "unanswered",
  };
}

/** Human Rights Plan is N/A only when the contractor provides solely CHA, HSQ, or PBA. */
export function humanRightsPlanStatus(servicesOffered: string[]): ApplicabilityStatus {
  const codes = normalizeCodes(servicesOffered);
  if (codes.length === 0) return "unanswered";
  const allowed = new Set<string>(CHA_HSQ_PBA);
  const onlyExempt = codes.every((c) => allowed.has(c));
  return onlyExempt ? "does_not_apply" : "applies";
}

/** Housemate informed-choice applies when HHS, PPS, or RHS is awarded. */
export function housemateStatus(servicesOffered: string[]): ApplicabilityStatus {
  const codes = normalizeCodes(servicesOffered);
  if (codes.length === 0) return "unanswered";
  const residential = new Set<string>(RESIDENTIAL_HOUSEMATE_CODES);
  return codes.some((c) => residential.has(c)) ? "applies" : "does_not_apply";
}

export function computeObligationApplicability(facts: OrgFacts): ObligationApplicability[] {
  const rows: ObligationApplicability[] = [];

  for (const def of ORG_FACT_DEFINITIONS) {
    const status = statusFromAnswer(facts[def.key]);
    for (const obligationKey of def.obligationKeys) {
      rows.push(rowForFact(obligationKey, def.key, status));
    }
  }

  rows.push(
    rowForFact(
      "human_rights_plan",
      "services_only_cha_hsq_pba",
      humanRightsPlanStatus(facts.servicesOffered),
    ),
  );
  rows.push(
    rowForFact(
      "housemate_informed_choice",
      "residential_housemates",
      housemateStatus(facts.servicesOffered),
    ),
  );

  return rows;
}

export function obligationFactApplicability(
  obligationKey: string,
  facts: OrgFacts,
): ObligationApplicability | null {
  return (
    computeObligationApplicability(facts).find((row) => row.obligationKey === obligationKey) ?? null
  );
}

export function unansweredFactsQuietSummary(
  orgId: string,
  facts: OrgFacts,
): {
  kind: "quiet_summary";
  id: string;
  title: string;
  body: string;
  count: number;
  urgency: "high";
  dueAt: null;
  source: "org_profile_facts";
} | null {
  const unanswered = listUnansweredFacts(facts);
  if (unanswered.length === 0) return null;
  const count = unanswered.length;
  const labels = unanswered.map((d) => d.question.replace(/\?$/, "")).join("; ");
  return {
    kind: "quiet_summary",
    id: `org_profile_facts:${orgId}`,
    title: "Unanswered compliance setup facts",
    body:
      count === 1
        ? `1 org-profile fact is unanswered. ${labels}. Conditional duties stay visible until this is recorded.`
        : `${count} org-profile facts are unanswered. ${labels}. Conditional duties stay visible until these are recorded.`,
    count,
    urgency: "high",
    dueAt: null,
    source: "org_profile_facts",
  };
}

function columnsMissing(message: string | undefined): boolean {
  return !!message && /does not exist|schema cache|column|could not find/i.test(message);
}

export async function loadOrgFacts(
  supabase: AnySupabase,
  organizationId: string,
): Promise<OrgFacts | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "fact_operates_ol_site, fact_uses_volunteers, fact_has_governing_board, services_offered",
    )
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    if (columnsMissing(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return { ...EMPTY_ORG_FACTS };
  return {
    operates_ol_site: parseFactAnswer(data.fact_operates_ol_site),
    uses_volunteers: parseFactAnswer(data.fact_uses_volunteers),
    has_governing_board: parseFactAnswer(data.fact_has_governing_board),
    servicesOffered: normalizeCodes(
      Array.isArray(data.services_offered) ? data.services_offered : [],
    ),
  };
}

export type PersistOrgFactsInput = {
  operates_ol_site: FactAnswer;
  uses_volunteers: FactAnswer;
  has_governing_board: FactAnswer;
};

export async function persistOrgFacts(
  supabase: AnySupabase,
  organizationId: string,
  userId: string,
  answers: PersistOrgFactsInput,
): Promise<{ facts: OrgFacts; applicability: ObligationApplicability[] }> {
  const { data: existing, error: readErr } = await supabase
    .from("organizations")
    .select("services_offered")
    .eq("id", organizationId)
    .maybeSingle();
  if (readErr && !columnsMissing(readErr.message)) throw new Error(readErr.message);

  const { error: updateErr } = await supabase
    .from("organizations")
    .update({
      fact_operates_ol_site: answers.operates_ol_site,
      fact_uses_volunteers: answers.uses_volunteers,
      fact_has_governing_board: answers.has_governing_board,
      fact_answers_updated_at: new Date().toISOString(),
      fact_answers_updated_by: userId,
    })
    .eq("id", organizationId);
  if (updateErr) {
    if (columnsMissing(updateErr.message)) {
      throw new Error(
        "Compliance setup columns are not live yet. Soft Core must apply the Step 5 SQL first.",
      );
    }
    throw new Error(updateErr.message);
  }

  const facts: OrgFacts = {
    operates_ol_site: answers.operates_ol_site,
    uses_volunteers: answers.uses_volunteers,
    has_governing_board: answers.has_governing_board,
    servicesOffered: normalizeCodes(
      Array.isArray(existing?.services_offered) ? existing.services_offered : [],
    ),
  };
  const applicability = computeObligationApplicability(facts);
  await persistApplicabilityRows(supabase, organizationId, userId, applicability);
  return { facts, applicability };
}

export async function persistApplicabilityRows(
  supabase: AnySupabase,
  organizationId: string,
  userId: string,
  rows: ObligationApplicability[],
): Promise<void> {
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    organization_id: organizationId,
    obligation_key: row.obligationKey,
    fact_key: row.factKey,
    applies: row.applies,
    unanswered: row.unanswered,
    source: "computed",
    decided_by: userId,
    decided_at: now,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("obligation_applicability")
    .upsert(payload, { onConflict: "organization_id,obligation_key" });
  if (error && columnsMissing(error.message)) return;
  if (error) throw new Error(error.message);
}
