/**
 * Synthetic True North roster fixtures for Sep 1 CLIENTS / 1056 e2e.
 *
 * Names match the known TNS roster the owner listed, plus one clearly fake
 * client (Avery Quinn) used only to exercise an empty Medicaid ID. IDs,
 * emails, and Medicaid values are fake — do not treat them as live PHI.
 */
export const ORG_ID = "00000000-0000-4000-a000-000000000001";
export const ORG_NAME = "True North Supports";

export const MAPLE_HOME_ID = "00000000-0000-4000-a000-000000000301";
export const OAK_SLH_ID = "00000000-0000-4000-a000-000000000302";

export const ADMIN_USER_ID = "00000000-0000-4000-a000-000000000010";
export const ADMIN_EMAIL = "roster-admin@example.test";
export const ADMIN_NAME = "Roster Admin";

export const STAFF = {
  jake: {
    id: "00000000-0000-4000-a000-000000000201",
    name: "Jake Probert",
    email: "jake.probert@example.test",
    role: "employee" as const,
    jobTitle: "DSP",
    teamId: MAPLE_HOME_ID,
  },
  harvey: {
    id: "00000000-0000-4000-a000-000000000202",
    name: "Harvey Alisa",
    email: "harvey.alisa@example.test",
    role: "manager" as const,
    jobTitle: "House Manager",
    teamId: MAPLE_HOME_ID,
  },
  tom: {
    id: "00000000-0000-4000-a000-000000000203",
    name: "Tom Jones",
    email: "tom.jones@example.test",
    role: "employee" as const,
    jobTitle: "DSP",
    teamId: OAK_SLH_ID,
  },
  dane: {
    id: "00000000-0000-4000-a000-000000000204",
    name: "Dane Warnick",
    email: "dane.warnick@example.test",
    role: "admin" as const,
    jobTitle: "Platform Admin",
    teamId: null as string | null,
    hiveExec: true,
  },
  admin: {
    id: ADMIN_USER_ID,
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    role: "admin" as const,
    jobTitle: "Company Admin",
    teamId: null as string | null,
  },
} as const;

export const DSP_USER_ID = STAFF.jake.id;

/** Daily-rate codes (worksheet / attendance) — not SLH/SLN. */
export const DAILY_CODES = new Set(["HHS", "RHS", "PPS", "DSG", "RL6", "RP4", "RP5", "SED", "MTP"]);

/** Per-client worksheet rates (HHS/DSI/SEI). SLH/SLN use table rates. */
export const WORKSHEET_CODES = new Set(["HHS", "RHS", "DSI", "SEI", "DSG", "DSP"]);

export const CLIENTS = {
  tommy: {
    id: "00000000-0000-4000-a000-000000000101",
    first_name: "Tommy",
    last_name: "Jones",
    codes: ["DSI", "HHS", "SEI", "SLH"],
    team_id: MAPLE_HOME_ID,
    medicaid_id: "MOCK-TJ-001" as string | null,
  },
  blake: {
    id: "00000000-0000-4000-a000-000000000102",
    first_name: "Blake",
    last_name: "Stevens",
    codes: ["DSI", "HHS"],
    team_id: MAPLE_HOME_ID,
    medicaid_id: "MOCK-BS-002" as string | null,
  },
  stephen: {
    id: "00000000-0000-4000-a000-000000000103",
    first_name: "Stephen",
    last_name: "Prince",
    codes: ["SLH", "SLN"],
    team_id: OAK_SLH_ID,
    medicaid_id: "MOCK-SP-003" as string | null,
  },
  marcus: {
    id: "00000000-0000-4000-a000-000000000104",
    first_name: "Marcus",
    last_name: "Rivera",
    codes: [] as string[],
    team_id: null as string | null,
    medicaid_id: "MOCK-MR-004" as string | null,
  },
  /** Fake client — empty Medicaid ID, active SLN auth. Not a live TNS person. */
  avery: {
    id: "00000000-0000-4000-a000-000000000105",
    first_name: "Avery",
    last_name: "Quinn",
    codes: ["SLN"],
    team_id: OAK_SLH_ID,
    medicaid_id: null as string | null,
  },
} as const;

export const TEAMS = [
  {
    id: MAPLE_HOME_ID,
    team_name: "Maple House",
    setting: "residential",
    manager_id: STAFF.harvey.id,
    organization_id: ORG_ID,
    active: true,
  },
  {
    id: OAK_SLH_ID,
    team_name: "Oak SLH",
    setting: "slh",
    manager_id: STAFF.tom.id,
    organization_id: ORG_ID,
    active: true,
  },
];

export const PENDING_INVITE = {
  id: "00000000-0000-4000-a000-000000000401",
  token: "mock-invite-token",
  email: "new.dsp@example.test",
  role: "employee",
  status: "pending",
  organization_id: ORG_ID,
  expires_at: "2026-09-15T00:00:00.000Z",
  created_at: "2026-08-27T00:00:00.000Z",
};

export const STAFF_LIST = [STAFF.admin, STAFF.jake, STAFF.harvey, STAFF.tom, STAFF.dane];
export const CLIENT_LIST = [
  CLIENTS.tommy,
  CLIENTS.blake,
  CLIENTS.stephen,
  CLIENTS.marcus,
  CLIENTS.avery,
];

/** DSP Jake is assigned to every fixture client (all codes on the client). */
export const STAFF_ASSIGNMENTS = CLIENT_LIST.map((c, i) => ({
  id: `sa-jake-${String(i + 1).padStart(2, "0")}`,
  organization_id: ORG_ID,
  staff_id: STAFF.jake.id,
  client_id: c.id,
  service_codes: null as string[] | null,
}));
