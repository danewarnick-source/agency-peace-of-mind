import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { computeAgencySetupStatus, EMPTY_AGENCY_SETUP_FACTS } from "@/lib/agency-setup-gate";
import {
  assertAgencySetupCompleteForOrg,
  loadAgencySetupFacts,
  loadAgencySetupStatus,
  persistAgencySetupFactsInternal,
} from "@/lib/agency-setup-persist";

export {
  assertAgencySetupCompleteForOrg,
  loadAgencySetupFacts,
  loadAgencySetupStatus,
  persistAgencySetupFactsInternal,
  type PersistAgencySetupInput,
} from "@/lib/agency-setup-persist";

const OrgId = z.object({ organizationId: z.string().uuid() });

const PersistInput = z.object({
  organizationId: z.string().uuid(),
  // Nullable AND optional: null means "answer is (still) unrecorded", missing
  // means "leave this fact untouched" — lets a partial save (e.g. the
  // service-codes-only NECTAR company profile save) update just the fields
  // it owns without clobbering the others back to null.
  operates_ol_site: z.union([z.boolean(), z.null()]).optional(),
  uses_volunteers: z.union([z.boolean(), z.null()]).optional(),
  has_governing_board: z.union([z.boolean(), z.null()]).optional(),
  servicesOffered: z.array(z.string()).optional(),
  approxClientCount: z.number().int().min(0).nullable().optional(),
  serviceArea: z.string().max(200).nullable().optional(),
  dhhsProviderId: z.string().max(200).nullable().optional(),
  seiAwardDate: z.string().max(40).nullable().optional(),
  providesRespiteOvernight: z.boolean().nullable().optional(),
  isUsorVendor: z.boolean().nullable().optional(),
  supportsSelfAdministeredMedication: z.boolean().nullable().optional(),
  actsAsRepresentativePayee: z.boolean().nullable().optional(),
  providesTransportation: z.boolean().nullable().optional(),
});

export const getAgencySetupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => OrgId.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    if (!supabase || !context.userId) {
      return {
        ...computeAgencySetupStatus(EMPTY_AGENCY_SETUP_FACTS),
        organizationId: data.organizationId,
        facts: EMPTY_AGENCY_SETUP_FACTS,
      };
    }
    await requireOrgMembership(supabase, context.userId, data.organizationId, "employee");
    const facts = await loadAgencySetupFacts(supabase, data.organizationId);
    const status = await loadAgencySetupStatus(supabase, data.organizationId);
    return { ...status, organizationId: data.organizationId, facts };
  });

export const persistAgencySetupFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PersistInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    if (!supabase || !context.userId) throw new Error("Not authenticated");
    await requireOrgMembership(supabase, context.userId, data.organizationId, "manager");
    const { organizationId, ...answers } = data;
    return persistAgencySetupFactsInternal(supabase, organizationId, context.userId, answers);
  });
