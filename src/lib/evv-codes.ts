// Utah DHHS / Medicaid master service code registry (35 codes).
// `evvLock: true`  → MANDATES EVV LOCATION LOCK (geofence enforced)
// `evvLock: false` → BYPASSES EVV LOCATION LOCK (passive GPS capture only)
//
// HHS (Host Home Supports) is included as a SYSTEM BYPASS EXEMPTION
// (evvLock:false) so it can be assigned in the admin DSPD multi-select.
export interface ServiceCodeDef {
  code: string;
  label: string;
  evvLock: boolean;
}

export const EVV_SERVICE_CODES: ReadonlyArray<ServiceCodeDef> = [
  // EVV-MANDATED CODES
  { code: "ACA", label: "ACA — Provider Based Attendant Care", evvLock: true },
  { code: "CHA", label: "CHA — Chore Services – Provider", evvLock: true },
  { code: "COM", label: "COM — Companion Services – Provider", evvLock: true },
  { code: "HSQ", label: "HSQ — Homemaker Services Provider", evvLock: true },
  { code: "LPS", label: "LPS — Peer Support Services, Individual", evvLock: true },
  { code: "PAC", label: "PAC — Personal Assistance – Provider", evvLock: true },
  { code: "RL6", label: "RL6 — Routine Respite w/Room & Board", evvLock: true },
  { code: "RP2", label: "RP2 — Provider Basic Hourly Respite Care", evvLock: true },
  { code: "RP3", label: "RP3 — Provider Intensive Daily Respite Care", evvLock: true },
  { code: "SLH", label: "SLH — Supported Living Hourly – Provider", evvLock: true },
  { code: "SLN", label: "SLN — Supported Living, Natural Supports", evvLock: true },
  { code: "RHS", label: "RHS — Residential Habilitation Supports", evvLock: true },
  { code: "SEI", label: "SEI — Supported Employment for an Individual", evvLock: true },

  // NON-EVV CODES (bypass geofence)
  { code: "BC1", label: "BC1 — Behavior Consultation I", evvLock: false },
  { code: "BC2", label: "BC2 — Behavior Consultation II", evvLock: false },
  { code: "BC3", label: "BC3 — Behavior Consultant III", evvLock: false },
  { code: "DSG", label: "DSG — Day Supports Group (Daily)", evvLock: false },
  { code: "DSP", label: "DSP — Day Supports Group (Hourly)", evvLock: false },
  { code: "DSI", label: "DSI — Day Supports Individual", evvLock: false },
  { code: "EPR", label: "EPR — Employment Preparation Services", evvLock: false },
  { code: "MTP", label: "MTP — Motor Transportation Payment", evvLock: false },
  { code: "TFB", label: "TFB — Family & Individual Training", evvLock: false },
  { code: "HHS", label: "HHS — Host Home Supports", evvLock: false },
  { code: "PBA", label: "PBA — Personal Budget Assistant", evvLock: false },
  { code: "PM1", label: "PM1 — Professional Medication Monitoring LPN", evvLock: false },
  { code: "PM2", label: "PM2 — Professional Medication Monitoring RN", evvLock: false },
  { code: "PN1", label: "PN1 — Professional Nursing Service I", evvLock: false },
  { code: "PN2", label: "PN2 — Professional Nursing Service II", evvLock: false },
  { code: "PPS", label: "PPS — Professional Parent Supports", evvLock: false },
  { code: "RP4", label: "RP4 — Routine Respite with Room and Board", evvLock: false },
  { code: "RP5", label: "RP5 — Exceptional Care Respite with Room/Board", evvLock: false },
  { code: "RPS", label: "RPS — Respite Session (Camp)", evvLock: false },
  { code: "SEC", label: "SEC — Supported Employment with Co-worker", evvLock: false },
  { code: "SED", label: "SED — Supported Employment in a Group", evvLock: false },
  { code: "SEE", label: "SEE — Supported Employment Enterprise", evvLock: false },
];

export type EvvServiceCode = string;

export function evvServiceLabel(code: string | null | undefined): string {
  return EVV_SERVICE_CODES.find((c) => c.code === code)?.label ?? code ?? "—";
}

/** Returns true if the code mandates geofence enforcement. */
export function isEvvLockedCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return !!EVV_SERVICE_CODES.find((c) => c.code === code)?.evvLock;
}

/** Pad a Utah Medicaid Member ID to 10 chars (preserve leading zeros). */
export function padMemberId(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  return v.length >= 10 ? v : v.padStart(10, "0");
}
