/**
 * DSPD documentation vs billing eligibility — one evaluator, three lanes.
 *
 * Staff readiness, note completeness, and billing eligibility stay separate.
 * A NECTAR narrative pass never implies a claim is billable. Holds are raised
 * only from existing engine hooks (1056 auth, staff_prerequisite, EVV lock,
 * attestation, DHHS91172 service caps, billing_conflict, UPI filing).
 *
 * Pure: facts in, statuses + holds out. No I/O, no second checklist table.
 */
import { isEvvLockedCode } from "./evv-codes.ts";
import { isLikelyBadCoord } from "./geo.ts";
import type { CompletenessResult } from "./nectar-completeness.ts";
import { requiresUpiFiling } from "./progress-summaries.ts";

/** Same window as `getAuthStatus` in billing-auth-status.tsx — kept here so node tests do not import React. */
function authWindowStatus(
  start?: string | null,
  end?: string | null,
): "active" | "expired" | "upcoming" | "end-needed" {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!end) return "end-needed";
  const e = new Date(end);
  if (Number.isNaN(e.getTime())) return "end-needed";
  if (e < today) return "expired";
  if (start) {
    const s = new Date(start);
    if (!Number.isNaN(s.getTime()) && s > today) return "upcoming";
  }
  return "active";
}

export const STAFF_READINESS_STATUSES = ["ready", "blocked"] as const;
export type StaffReadinessStatus = (typeof STAFF_READINESS_STATUSES)[number];

export const NOTE_COMPLETENESS_STATUSES = ["complete", "incomplete"] as const;
export type NoteCompletenessStatus = (typeof NOTE_COMPLETENESS_STATUSES)[number];

export const BILLING_ELIGIBILITY_STATUSES = ["eligible", "held"] as const;
export type BillingEligibilityStatus = (typeof BILLING_ELIGIBILITY_STATUSES)[number];

export const BILLING_HOLD_KINDS = [
  "authorization",
  "qualification",
  "supervision",
  "client_prerequisite",
  "signature",
  "evv",
  "service_limit",
  "incompatible_codes",
  "external_reporting",
] as const;
export type BillingHoldKind = (typeof BILLING_HOLD_KINDS)[number];

export type HoldLane = "staff" | "billing";

export type HoldClearPath = {
  label: string;
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
};

export type BillingHold = {
  kind: BillingHoldKind;
  reason: string;
  gap: string;
  requirementId: string | null;
  clear: HoldClearPath;
  lane: HoldLane;
};

export type EntryReadiness = {
  staff: { status: StaffReadinessStatus; holds: BillingHold[] };
  note: { status: NoteCompletenessStatus; source: "nectar" | "narrative" | "empty" };
  billing: { status: BillingEligibilityStatus; holds: BillingHold[] };
};

/** DSI daily cap (hours). Same number the conflict engine uses. */
export const DSI_MAX_HOURS_PER_DAY = 6;
/** CMP/CMS daily cap (hours). */
export const CMP_CMS_MAX_HOURS_PER_DAY = 8;
/** CMP/CMS weekly cap (hours). */
export const CMP_CMS_MAX_HOURS_PER_WEEK = 40;

export type AuthFact = {
  serviceStartDate?: string | null;
  serviceEndDate?: string | null;
  authorizationPending?: boolean;
};

export type QualificationFact = {
  /** Confirmed staff_prerequisite rule exists for this code. */
  configured: boolean;
  missingLabels: string[];
  requirementId?: string | null;
};

export type SupervisionFact = {
  required: boolean;
  satisfied: boolean;
  requirementId?: string | null;
};

export type ClientPrerequisiteFact = {
  configured: boolean;
  missing: boolean;
  label?: string;
  requirementId?: string | null;
};

export type EvvFact = {
  gpsPresent: boolean;
  /** In-zone, matched approved location, or recorded bypass. */
  geofenceSatisfied: boolean;
};

export type SignatureFact = {
  required: boolean;
  attested: boolean;
};

export type ServiceLimitFact = {
  kind: "dsi_day" | "cmp_cms_day" | "cmp_cms_week";
  hours: number;
  maxHours: number;
};

export type IncompatibleFact = {
  configured: boolean;
  conflictingCodes: string[];
  requirementId?: string | null;
};

export type ExternalReportingFact = {
  required: boolean;
  completed: boolean;
};

/** Period-level UPI fact. Do not attach to every SEI punch — summaries are monthly. */
export function externalReportingFactFromCodes(
  serviceCodes: string[],
  upiEntered: boolean,
): ExternalReportingFact | null {
  if (!requiresUpiFiling(serviceCodes)) return null;
  return { required: true, completed: upiEntered };
}

export type OvernightFact = {
  /** SLH/SLN overnight without awake confirmation — asleep time unbillable. */
  needsAwake: boolean;
  awakeConfirmed: boolean;
};

export type EntryReadinessFacts = {
  serviceCode: string | null | undefined;
  clientId?: string | null;
  staffId?: string | null;
  timesheetId?: string | null;

  /**
   * Note lane only. `Verified` = complete. Anything else (Flagged /
   * Exception / empty / unknown) is incomplete. Never copied onto billing.
   */
  note?: {
    aiComplianceStatus?: string | null;
    completeness?: CompletenessResult | null;
    hasNarrative?: boolean;
  };

  authorization?: AuthFact | null;
  qualifications?: QualificationFact | null;
  supervision?: SupervisionFact | null;
  clientPrerequisite?: ClientPrerequisiteFact | null;
  evv?: EvvFact | null;
  signature?: SignatureFact | null;
  serviceLimit?: ServiceLimitFact | null;
  incompatible?: IncompatibleFact | null;
  externalReporting?: ExternalReportingFact | null;
  overnight?: OvernightFact | null;
};

export function isAuthorizationBillable(auth: AuthFact | null | undefined): boolean {
  if (!auth) return false;
  if (auth.authorizationPending) return false;
  const status = authWindowStatus(auth.serviceStartDate, auth.serviceEndDate);
  return status === "active" || status === "end-needed";
}

export function noteCompletenessFromFacts(
  note: EntryReadinessFacts["note"],
): { status: NoteCompletenessStatus; source: EntryReadiness["note"]["source"] } {
  if (note?.completeness) {
    return {
      status: note.completeness.status === "Verified" ? "complete" : "incomplete",
      source: "nectar",
    };
  }
  const ai = (note?.aiComplianceStatus ?? "").trim();
  if (ai === "Verified") return { status: "complete", source: "nectar" };
  if (note?.hasNarrative === false) return { status: "incomplete", source: "empty" };
  if (ai === "Flagged" || ai === "Exception") {
    return { status: "incomplete", source: "nectar" };
  }
  if (note?.hasNarrative) return { status: "incomplete", source: "narrative" };
  return { status: "incomplete", source: "empty" };
}

function hold(
  kind: BillingHoldKind,
  lane: HoldLane,
  reason: string,
  gap: string,
  clear: HoldClearPath,
  requirementId: string | null = null,
): BillingHold {
  return { kind, lane, reason, gap, clear, requirementId };
}

export function clearPathForHold(
  kind: BillingHoldKind,
  ctx: { clientId?: string | null; staffId?: string | null; timesheetId?: string | null },
): HoldClearPath {
  const clientId = ctx.clientId ?? undefined;
  const staffId = ctx.staffId ?? undefined;

  switch (kind) {
    case "authorization":
      return clientId
        ? { label: "Open authorization", to: "/dashboard/billing/$clientId", params: { clientId } }
        : { label: "Open authorizations", to: "/dashboard/billing/imports" };
    case "qualification":
      return {
        label: "Open staff file",
        to: "/dashboard/compliance",
        search: staffId ? { tab: "staff", staff: staffId } : { tab: "staff" },
      };
    case "supervision":
      return clientId
        ? { label: "Log supervision", to: "/dashboard/hhs-hub/$clientId", params: { clientId } }
        : { label: "Open staff file", to: "/dashboard/compliance", search: { tab: "staff" } };
    case "client_prerequisite":
      return clientId
        ? { label: "Open client setup", to: "/dashboard/clients/$clientId", params: { clientId } }
        : { label: "Open clients", to: "/dashboard/clients" };
    case "signature":
      return {
        label: "Open timesheet",
        to: "/dashboard/compliance-desk",
        search: ctx.timesheetId ? { focus: ctx.timesheetId } : undefined,
      };
    case "evv":
      return { label: "Open timeclock", to: "/dashboard/timeclock" };
    case "service_limit":
      return { label: "Open scheduler", to: "/dashboard/scheduler" };
    case "incompatible_codes":
      return { label: "Review held timesheets", to: "/dashboard/compliance-desk" };
    case "external_reporting":
      return { label: "Open summaries / UPI", to: "/dashboard/summaries" };
  }
}

function serviceHours(clockInIso: string | null | undefined, clockOutIso: string | null | undefined): number | null {
  if (!clockInIso || !clockOutIso) return null;
  const a = new Date(clockInIso).getTime();
  const b = new Date(clockOutIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return (b - a) / 3_600_000;
}

export function serviceLimitFromDuration(
  serviceCode: string | null | undefined,
  hours: number | null,
  weekHours?: number | null,
): ServiceLimitFact | null {
  const code = (serviceCode ?? "").toUpperCase();
  if (hours != null && code === "DSI" && hours > DSI_MAX_HOURS_PER_DAY) {
    return { kind: "dsi_day", hours, maxHours: DSI_MAX_HOURS_PER_DAY };
  }
  if (hours != null && (code === "CMP" || code === "CMS") && hours > CMP_CMS_MAX_HOURS_PER_DAY) {
    return { kind: "cmp_cms_day", hours, maxHours: CMP_CMS_MAX_HOURS_PER_DAY };
  }
  if (weekHours != null && (code === "CMP" || code === "CMS") && weekHours > CMP_CMS_MAX_HOURS_PER_WEEK) {
    return { kind: "cmp_cms_week", hours: weekHours, maxHours: CMP_CMS_MAX_HOURS_PER_WEEK };
  }
  return null;
}

export function evvFactFromPunch(args: {
  serviceCode: string | null | undefined;
  gpsIn?: { latitude?: number | null; longitude?: number | null } | null;
  gpsOut?: { latitude?: number | null; longitude?: number | null } | null;
  outsideGeofenceReason?: string | null;
  gpsBypassed?: boolean | null;
  matchedApprovedLocationId?: string | null;
}): EvvFact | null {
  if (!isEvvLockedCode(args.serviceCode)) return null;
  const inOk = !isLikelyBadCoord({
    lat: args.gpsIn?.latitude ?? null,
    lng: args.gpsIn?.longitude ?? null,
  });
  const outOk = !isLikelyBadCoord({
    lat: args.gpsOut?.latitude ?? null,
    lng: args.gpsOut?.longitude ?? null,
  });
  const gpsPresent = inOk || outOk;
  // Empty outside reason = in-zone (compliance-desk convention). A reason
  // without bypass or matched site is an unexcused geofence miss.
  const outsideUnexcused =
    !args.matchedApprovedLocationId &&
    !args.gpsBypassed &&
    !!(args.outsideGeofenceReason && args.outsideGeofenceReason.trim());
  return { gpsPresent, geofenceSatisfied: gpsPresent && !outsideUnexcused };
}

/**
 * Evaluate one shift / note / claim. Omitted facts are skipped (unknown ≠ gap).
 * Note completeness never produces a billing hold.
 */
export function evaluateEntryReadiness(facts: EntryReadinessFacts): EntryReadiness {
  const code = (facts.serviceCode ?? "").trim().toUpperCase() || null;
  const ctx = {
    clientId: facts.clientId,
    staffId: facts.staffId,
    timesheetId: facts.timesheetId,
  };

  const staffHolds: BillingHold[] = [];
  const billingHolds: BillingHold[] = [];

  if (facts.authorization && !isAuthorizationBillable(facts.authorization)) {
    billingHolds.push(
      hold(
        "authorization",
        "billing",
        "No active authorization (1056) for this service code.",
        code ? `Missing or inactive ${code} authorization` : "Missing or inactive authorization",
        clearPathForHold("authorization", ctx),
      ),
    );
  }

  if (facts.qualifications?.configured && facts.qualifications.missingLabels.length > 0) {
    const gap = facts.qualifications.missingLabels.join(", ");
    staffHolds.push(
      hold(
        "qualification",
        "staff",
        "Staff is missing a required qualification for this service code.",
        gap,
        clearPathForHold("qualification", ctx),
        facts.qualifications.requirementId ?? null,
      ),
    );
  }

  if (facts.supervision?.required && !facts.supervision.satisfied) {
    staffHolds.push(
      hold(
        "supervision",
        "staff",
        "Required supervision is not recorded for this service.",
        "Supervision contact or ACRE supervisor not on file",
        clearPathForHold("supervision", ctx),
        facts.supervision.requirementId ?? null,
      ),
    );
  }

  if (facts.clientPrerequisite?.configured && facts.clientPrerequisite.missing) {
    staffHolds.push(
      hold(
        "client_prerequisite",
        "staff",
        "Client-specific prerequisite is not complete.",
        facts.clientPrerequisite.label ?? "Client-specific training missing",
        clearPathForHold("client_prerequisite", ctx),
        facts.clientPrerequisite.requirementId ?? null,
      ),
    );
  }

  if (facts.evv && isEvvLockedCode(code)) {
    if (!facts.evv.gpsPresent || !facts.evv.geofenceSatisfied) {
      billingHolds.push(
        hold(
          "evv",
          "billing",
          "EVV-mandated code is missing a geofence-valid punch.",
          !facts.evv.gpsPresent
            ? `${code} requires GPS in/out (SOW §1.12)`
            : `${code} punch is outside the geofence without a recorded bypass`,
          clearPathForHold("evv", ctx),
        ),
      );
    }
  }

  if (facts.signature?.required && !facts.signature.attested) {
    billingHolds.push(
      hold(
        "signature",
        "billing",
        "Staff attestation (signature) is not recorded.",
        "Shift note has not been attested",
        clearPathForHold("signature", ctx),
      ),
    );
  }

  if (facts.serviceLimit && facts.serviceLimit.hours > facts.serviceLimit.maxHours) {
    const label =
      facts.serviceLimit.kind === "dsi_day"
        ? "DSI exceeds 6 hours in a day"
        : facts.serviceLimit.kind === "cmp_cms_day"
          ? "CMP/CMS exceeds 8 hours in a day"
          : "CMP/CMS exceeds 40 hours in a week";
    billingHolds.push(
      hold(
        "service_limit",
        "billing",
        `${label} — unbillable beyond the cap.`,
        `${facts.serviceLimit.hours.toFixed(1)}h recorded (max ${facts.serviceLimit.maxHours}h)`,
        clearPathForHold("service_limit", ctx),
      ),
    );
  }

  if (facts.overnight?.needsAwake && !facts.overnight.awakeConfirmed) {
    billingHolds.push(
      hold(
        "service_limit",
        "billing",
        "SLH/SLN overnight without awake confirmation — asleep time is unbillable.",
        "Awake overnight not confirmed",
        clearPathForHold("service_limit", ctx),
      ),
    );
  }

  if (facts.incompatible?.configured && facts.incompatible.conflictingCodes.length >= 2) {
    const codes = facts.incompatible.conflictingCodes.join(" + ");
    billingHolds.push(
      hold(
        "incompatible_codes",
        "billing",
        "Incompatible billing codes on the same entry.",
        codes,
        clearPathForHold("incompatible_codes", ctx),
        facts.incompatible.requirementId ?? null,
      ),
    );
  }

  if (facts.externalReporting?.required && !facts.externalReporting.completed) {
    billingHolds.push(
      hold(
        "external_reporting",
        "billing",
        "Required external filing (UPI) is not attested.",
        "UPI entry not recorded for this period",
        clearPathForHold("external_reporting", ctx),
      ),
    );
  }

  // Staff gaps also hold billing — you cannot bill a shift the staff was not
  // qualified/supervised to run. Note incompleteness does not.
  for (const h of staffHolds) {
    billingHolds.push({ ...h, lane: "billing" });
  }

  const note = noteCompletenessFromFacts(facts.note);

  return {
    staff: {
      status: staffHolds.length === 0 ? "ready" : "blocked",
      holds: staffHolds,
    },
    note,
    billing: {
      status: billingHolds.length === 0 ? "eligible" : "held",
      holds: billingHolds,
    },
  };
}

export function hoursBetweenIso(
  clockInIso: string | null | undefined,
  clockOutIso: string | null | undefined,
): number | null {
  return serviceHours(clockInIso, clockOutIso);
}

/** True when a narrative-only completeness pass would still leave billing held. */
export function narrativePassIsNotBillingReady(result: EntryReadiness): boolean {
  return result.note.status === "complete" && result.billing.status === "held";
}

export type TimesheetReadinessRow = {
  id?: string | null;
  client_id?: string | null;
  staff_id?: string | null;
  service_type_code?: string | null;
  clock_in_timestamp?: string | null;
  clock_out_timestamp?: string | null;
  gps_in_coordinates?: { latitude?: number | null; longitude?: number | null } | null;
  gps_out_coordinates?: { latitude?: number | null; longitude?: number | null } | null;
  outside_geofence_reason?: string | null;
  gps_in_bypassed?: boolean | null;
  gps_out_bypassed?: boolean | null;
  matched_approved_location_id?: string | null;
  attested_at?: string | null;
  attested_accurate?: boolean | null;
  ai_compliance_status?: string | null;
  shift_note_text?: string | null;
  is_awake_overnight?: boolean | null;
};

export type AuthRow = {
  client_id: string;
  service_code: string;
  service_start_date?: string | null;
  service_end_date?: string | null;
  authorization_pending?: boolean | null;
};

/** Assemble facts from a timesheet + optional 1056 row. Skips unknown lanes. */
export function factsFromTimesheet(
  row: TimesheetReadinessRow,
  auth: AuthRow | null | undefined,
  extras?: Partial<Pick<EntryReadinessFacts, "qualifications" | "supervision" | "clientPrerequisite" | "incompatible" | "externalReporting">>,
): EntryReadinessFacts {
  const code = row.service_type_code;
  const hours = hoursBetweenIso(row.clock_in_timestamp, row.clock_out_timestamp);
  const slOvernight = code === "SLH" || code === "SLN";
  const overnightLikely =
    slOvernight &&
    hours != null &&
    hours >= 8;
  return {
    serviceCode: code,
    clientId: row.client_id,
    staffId: row.staff_id,
    timesheetId: row.id,
    note: {
      aiComplianceStatus: row.ai_compliance_status,
      hasNarrative: !!(row.shift_note_text && row.shift_note_text.trim()),
    },
    authorization: auth
      ? {
          serviceStartDate: auth.service_start_date,
          serviceEndDate: auth.service_end_date,
          authorizationPending: auth.authorization_pending === true,
        }
      : auth === null
        ? { authorizationPending: true }
        : undefined,
    evv: evvFactFromPunch({
      serviceCode: code,
      gpsIn: row.gps_in_coordinates,
      gpsOut: row.gps_out_coordinates,
      outsideGeofenceReason: row.outside_geofence_reason,
      gpsBypassed: !!(row.gps_in_bypassed || row.gps_out_bypassed),
      matchedApprovedLocationId: row.matched_approved_location_id,
    }),
    signature: {
      required: true,
      attested: !!(row.attested_at || row.attested_accurate),
    },
    serviceLimit: serviceLimitFromDuration(code, hours),
    overnight:
      slOvernight && overnightLikely
        ? { needsAwake: true, awakeConfirmed: row.is_awake_overnight === true }
        : null,
    ...extras,
  };
}

export function matchAuthRow(
  rows: AuthRow[] | undefined,
  clientId: string | null | undefined,
  serviceCode: string | null | undefined,
): AuthRow | null | undefined {
  if (!rows) return undefined;
  if (!clientId || !serviceCode) return undefined;
  const code = serviceCode.toUpperCase();
  return (
    rows.find(
      (r) => r.client_id === clientId && (r.service_code ?? "").toUpperCase() === code,
    ) ?? null
  );
}
