/**
 * Agency setup persist / load — no @/ aliases so Node tests can import it.
 */
import {
  computeObligationApplicability,
  persistApplicabilityRows,
  type PersistOrgFactsInput,
} from "./obligations/applicability.ts";
import { canActivate } from "./obligations/draft-rules/publication.ts";
import { AGENCY_SETUP_QUESTIONS_VERSION } from "./obligations/agency-setup-questions.ts";
import {
  AGENCY_SETUP_INCOMPLETE_MESSAGE,
  computeAgencySetupStatus,
  EMPTY_AGENCY_SETUP_FACTS,
  parseApproxCount,
  parseNullableTrimmedString,
  reevaluateAgencyRequirements,
  setupFactsFromOrgRow,
  type AgencySetupFacts,
  type AgencySetupStatus,
} from "./agency-setup-gate.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const SETUP_ORG_COLUMNS = [
  "fact_operates_ol_site",
  "fact_uses_volunteers",
  "fact_has_governing_board",
  "fact_provides_respite_overnight",
  "fact_is_usor_vendor",
  "fact_supports_self_administered_medication",
  "fact_acts_as_representative_payee",
  "fact_provides_transportation",
  "services_offered",
  "approx_client_count",
  "service_area",
  "dhhs_provider_id",
  "sei_award_date",
  "fact_community_program_total_persons_served",
  "setup_create_gate_exempt",
].join(", ");

const AUDIT_ONLY_COLUMNS = [
  "fact_answers_updated_at",
  "fact_answers_updated_by",
  "setup_completed_at",
  "setup_completed_by",
  "setup_questionnaire_version",
].join(", ");

type OrgSetupSnapshot = {
  fact_operates_ol_site: unknown;
  fact_uses_volunteers: unknown;
  fact_has_governing_board: unknown;
  fact_provides_respite_overnight: unknown;
  fact_is_usor_vendor: unknown;
  fact_supports_self_administered_medication: unknown;
  fact_acts_as_representative_payee: unknown;
  fact_provides_transportation: unknown;
  services_offered: unknown;
  approx_client_count: unknown;
  service_area: unknown;
  dhhs_provider_id: unknown;
  sei_award_date: unknown;
  fact_community_program_total_persons_served: unknown;
  setup_create_gate_exempt?: unknown;
  fact_answers_updated_at?: unknown;
  fact_answers_updated_by?: unknown;
  setup_completed_at?: unknown;
  setup_completed_by?: unknown;
  setup_questionnaire_version?: unknown;
};

export function columnsMissing(message: string | undefined): boolean {
  return !!message && /does not exist|schema cache|column|could not find/i.test(message);
}

function createGateExemptFromRow(row: { setup_create_gate_exempt?: unknown } | null): boolean {
  return row?.setup_create_gate_exempt === true;
}

export async function loadAgencySetupFacts(
  supabase: AnySupabase,
  organizationId: string,
): Promise<AgencySetupFacts> {
  const { data, error } = await supabase
    .from("organizations")
    .select(SETUP_ORG_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    if (columnsMissing(error.message)) return { ...EMPTY_AGENCY_SETUP_FACTS };
    throw new Error(error.message);
  }
  if (!data) return { ...EMPTY_AGENCY_SETUP_FACTS };
  return setupFactsFromOrgRow(data);
}

export async function loadAgencySetupStatus(
  supabase: AnySupabase,
  organizationId: string,
): Promise<AgencySetupStatus> {
  const { data, error } = await supabase
    .from("organizations")
    .select(SETUP_ORG_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    if (columnsMissing(error.message)) {
      return computeAgencySetupStatus({ ...EMPTY_AGENCY_SETUP_FACTS });
    }
    throw new Error(error.message);
  }
  if (!data) return computeAgencySetupStatus({ ...EMPTY_AGENCY_SETUP_FACTS });
  return computeAgencySetupStatus(setupFactsFromOrgRow(data), {
    createGateExempt: createGateExemptFromRow(data),
  });
}

export async function assertAgencySetupCompleteForOrg(
  supabase: AnySupabase,
  organizationId: string,
): Promise<AgencySetupStatus> {
  const status = await loadAgencySetupStatus(supabase, organizationId);
  if (!status.createAllowed) {
    throw new Error(AGENCY_SETUP_INCOMPLETE_MESSAGE);
  }
  return status;
}

export type PersistAgencySetupInput = PersistOrgFactsInput & {
  approxClientCount?: number | null;
  serviceArea?: string | null;
  dhhsProviderId?: string | null;
  seiAwardDate?: string | null;
  providesRespiteOvernight?: boolean | null;
  isUsorVendor?: boolean | null;
  supportsSelfAdministeredMedication?: boolean | null;
  actsAsRepresentativePayee?: boolean | null;
  providesTransportation?: boolean | null;
  communityProgramTotalPersonsServed?: number | null;
};

async function readOrgSetupSnapshot(
  supabase: AnySupabase,
  organizationId: string,
): Promise<OrgSetupSnapshot | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select(`${SETUP_ORG_COLUMNS}, ${AUDIT_ONLY_COLUMNS}`)
    .eq("id", organizationId)
    .maybeSingle();
  if (error && !columnsMissing(error.message)) throw new Error(error.message);
  return data ?? null;
}

/**
 * One organizations UPDATE for every answered fact. If a later step (the
 * applicability recompute) fails, restore the pre-update snapshot so a
 * partial save never sticks — the closest thing to a transaction the
 * Supabase client here supports, and the same compensating-rollback shape
 * already covered by agency-setup-gate.integration.test.ts.
 */
export async function persistAgencySetupFactsInternal(
  supabase: AnySupabase,
  organizationId: string,
  userId: string,
  answers: PersistAgencySetupInput,
): Promise<{
  facts: AgencySetupFacts;
  status: AgencySetupStatus;
  activatedRules: boolean;
  canActivateAny: boolean;
}> {
  const existing = await readOrgSetupSnapshot(supabase, organizationId);
  const existingFacts = existing ? setupFactsFromOrgRow(existing) : { ...EMPTY_AGENCY_SETUP_FACTS };

  const nextServices =
    answers.servicesOffered !== undefined
      ? answers.servicesOffered.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : existingFacts.servicesOffered;
  const nextCount =
    answers.approxClientCount !== undefined
      ? parseApproxCount(answers.approxClientCount)
      : existingFacts.approxClientCount;
  const nextArea =
    answers.serviceArea !== undefined
      ? parseNullableTrimmedString(answers.serviceArea)
      : existingFacts.serviceArea;
  const nextProviderId =
    answers.dhhsProviderId !== undefined
      ? parseNullableTrimmedString(answers.dhhsProviderId)
      : existingFacts.dhhsProviderId;
  const nextSeiAwardDate =
    answers.seiAwardDate !== undefined
      ? parseNullableTrimmedString(answers.seiAwardDate)
      : existingFacts.seiAwardDate;
  const nextCommunityProgramTotal =
    answers.communityProgramTotalPersonsServed !== undefined
      ? parseApproxCount(answers.communityProgramTotalPersonsServed)
      : existingFacts.communityProgramTotalPersonsServed;

  const factsForApplicability: AgencySetupFacts = {
    operates_ol_site:
      answers.operates_ol_site !== undefined
        ? answers.operates_ol_site
        : existingFacts.operates_ol_site,
    uses_volunteers:
      answers.uses_volunteers !== undefined
        ? answers.uses_volunteers
        : existingFacts.uses_volunteers,
    has_governing_board:
      answers.has_governing_board !== undefined
        ? answers.has_governing_board
        : existingFacts.has_governing_board,
    servicesOffered: nextServices,
    approxClientCount: nextCount,
    serviceArea: nextArea,
    dhhsProviderId: nextProviderId,
    seiAwardDate: nextSeiAwardDate,
    providesRespiteOvernight:
      answers.providesRespiteOvernight !== undefined
        ? answers.providesRespiteOvernight
        : existingFacts.providesRespiteOvernight,
    isUsorVendor:
      answers.isUsorVendor !== undefined ? answers.isUsorVendor : existingFacts.isUsorVendor,
    supportsSelfAdministeredMedication:
      answers.supportsSelfAdministeredMedication !== undefined
        ? answers.supportsSelfAdministeredMedication
        : existingFacts.supportsSelfAdministeredMedication,
    actsAsRepresentativePayee:
      answers.actsAsRepresentativePayee !== undefined
        ? answers.actsAsRepresentativePayee
        : existingFacts.actsAsRepresentativePayee,
    providesTransportation:
      answers.providesTransportation !== undefined
        ? answers.providesTransportation
        : existingFacts.providesTransportation,
    communityProgramTotalPersonsServed: nextCommunityProgramTotal,
  };

  const willBeComplete = computeAgencySetupStatus(factsForApplicability, {
    createGateExempt: createGateExemptFromRow(existing),
  }).complete;

  const orgUpdate: Record<string, unknown> = {
    fact_operates_ol_site: factsForApplicability.operates_ol_site,
    fact_uses_volunteers: factsForApplicability.uses_volunteers,
    fact_has_governing_board: factsForApplicability.has_governing_board,
    fact_provides_respite_overnight: factsForApplicability.providesRespiteOvernight,
    fact_is_usor_vendor: factsForApplicability.isUsorVendor,
    fact_supports_self_administered_medication:
      factsForApplicability.supportsSelfAdministeredMedication,
    fact_acts_as_representative_payee: factsForApplicability.actsAsRepresentativePayee,
    fact_provides_transportation: factsForApplicability.providesTransportation,
    ...(answers.servicesOffered !== undefined ? { services_offered: nextServices } : {}),
    ...(answers.approxClientCount !== undefined ? { approx_client_count: nextCount } : {}),
    ...(answers.serviceArea !== undefined ? { service_area: nextArea } : {}),
    ...(answers.dhhsProviderId !== undefined ? { dhhs_provider_id: nextProviderId } : {}),
    ...(answers.seiAwardDate !== undefined ? { sei_award_date: nextSeiAwardDate } : {}),
    ...(answers.communityProgramTotalPersonsServed !== undefined
      ? { fact_community_program_total_persons_served: nextCommunityProgramTotal }
      : {}),
    fact_answers_updated_at: new Date().toISOString(),
    fact_answers_updated_by: userId,
  };
  if (willBeComplete) {
    orgUpdate.setup_completed_at = new Date().toISOString();
    orgUpdate.setup_completed_by = userId;
    orgUpdate.setup_questionnaire_version = AGENCY_SETUP_QUESTIONS_VERSION;
  }

  const { error: updateErr } = await supabase
    .from("organizations")
    .update(orgUpdate)
    .eq("id", organizationId);
  if (updateErr) {
    if (columnsMissing(updateErr.message)) {
      throw new Error(
        "Agency setup columns are not live yet. Soft Core must apply the setup-questionnaire SQL first.",
      );
    }
    throw new Error(updateErr.message);
  }

  try {
    const applicability = computeObligationApplicability(factsForApplicability);
    await persistApplicabilityRows(supabase, organizationId, userId, applicability);
  } catch (laterErr) {
    if (existing) {
      const { error: restoreErr } = await supabase
        .from("organizations")
        .update({
          fact_operates_ol_site: existing.fact_operates_ol_site ?? null,
          fact_uses_volunteers: existing.fact_uses_volunteers ?? null,
          fact_has_governing_board: existing.fact_has_governing_board ?? null,
          fact_provides_respite_overnight: existing.fact_provides_respite_overnight ?? null,
          fact_is_usor_vendor: existing.fact_is_usor_vendor ?? null,
          fact_supports_self_administered_medication:
            existing.fact_supports_self_administered_medication ?? null,
          fact_acts_as_representative_payee: existing.fact_acts_as_representative_payee ?? null,
          fact_provides_transportation: existing.fact_provides_transportation ?? null,
          services_offered: existing.services_offered,
          approx_client_count: existing.approx_client_count,
          service_area: existing.service_area,
          dhhs_provider_id: existing.dhhs_provider_id,
          sei_award_date: existing.sei_award_date,
          fact_community_program_total_persons_served:
            existing.fact_community_program_total_persons_served,
          fact_answers_updated_at: existing.fact_answers_updated_at ?? null,
          fact_answers_updated_by: existing.fact_answers_updated_by ?? null,
          setup_completed_at: existing.setup_completed_at ?? null,
          setup_completed_by: existing.setup_completed_by ?? null,
          setup_questionnaire_version: existing.setup_questionnaire_version ?? null,
        })
        .eq("id", organizationId);
      if (restoreErr && !columnsMissing(restoreErr.message)) {
        throw new Error(`Agency setup save failed and rollback failed: ${restoreErr.message}`);
      }
    }
    throw laterErr;
  }

  const facts = await loadAgencySetupFacts(supabase, organizationId);
  const snapshot = reevaluateAgencyRequirements({
    organizationId,
    facts,
  });
  if (snapshot.draft.activatedRules || snapshot.draft.createdLiveAssignments) {
    throw new Error("Setup re-evaluation cannot mint or activate draft catalog rules.");
  }
  void canActivate;
  return {
    facts,
    status: computeAgencySetupStatus(facts, {
      createGateExempt: createGateExemptFromRow(existing),
    }),
    activatedRules: snapshot.activatedRules,
    canActivateAny: snapshot.canActivateAny,
  };
}
