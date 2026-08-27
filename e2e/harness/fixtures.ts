/** Sep 1 tester-shaped fixtures. Synthetic UUIDs — never live True North IDs. */

export const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const STAFF_ID = "55555555-5555-4555-8555-555555555555";
export const SHIFT_ID = "66666666-6666-4666-8666-666666666666";

export const TOMMY_ID = "11111111-1111-4111-8111-111111111111";
export const BLAKE_ID = "22222222-2222-4222-8222-222222222222";
export const STEPHEN_ID = "33333333-3333-4333-8333-333333333333";
export const MARCUS_ID = "44444444-4444-4444-8444-444444444444";
export const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000099";

export const TOMMY_GOALS = [
  "Increase independent cooking skills",
  "Community access and public transportation",
];

export const TOMMY_BEHAVIORS = ["Elopement"];

export const NECTAR_DRAFT = [
  "Tommy independently selected ingredients and followed the cooking prompt with two verbal cues.",
  "Staff stayed nearby for safety oversight and praised each completed step.",
  "Community access was practiced by packing leftovers for later in the afternoon.",
  "No injury or medication concern was observed during this SEI shift.",
  "Baseline monitoring continued throughout the remainder of the session with calm redirection.",
].join(" ");

export const CASELOAD = [
  {
    id: TOMMY_ID,
    first_name: "Tommy",
    last_name: "Jones",
    authorized_dspd_codes: ["SEI", "DSI", "HHS", "SLH"],
    job_code: ["SEI", "DSI", "HHS", "SLH"],
    medicaid_id: "1000000001",
    physical_address: "1 Test St",
    home_latitude: 40.76,
    home_longitude: -111.89,
    geofence_radius_feet: 1000,
    pcsp_goals: TOMMY_GOALS,
  },
  {
    id: BLAKE_ID,
    first_name: "Blake",
    last_name: "Stevens",
    authorized_dspd_codes: ["DSI", "HHS"],
    job_code: ["DSI", "HHS"],
    medicaid_id: "1000000002",
    physical_address: null,
    home_latitude: null,
    home_longitude: null,
    geofence_radius_feet: null,
    pcsp_goals: [],
  },
  {
    id: STEPHEN_ID,
    first_name: "Stephen",
    last_name: "Prince",
    authorized_dspd_codes: ["SLH"],
    job_code: ["SLH"],
    medicaid_id: "1000000003",
    physical_address: null,
    home_latitude: null,
    home_longitude: null,
    geofence_radius_feet: null,
    pcsp_goals: [],
  },
  {
    id: MARCUS_ID,
    first_name: "Marcus",
    last_name: "Rivera",
    authorized_dspd_codes: [] as string[],
    job_code: [] as string[],
    medicaid_id: "1000000004",
    physical_address: null,
    home_latitude: null,
    home_longitude: null,
    geofence_radius_feet: null,
    pcsp_goals: [],
  },
];

export const STAFF_USER = {
  id: STAFF_ID,
  email: "jake.probert@example.test",
};

export const ORG = {
  organization_id: ORG_ID,
  organization_name: "True North Supports",
  role: "employee" as const,
};

export const TOMMY_ACTIVE_SHIFT = {
  id: SHIFT_ID,
  client_id: TOMMY_ID,
  client_name: "Tommy Jones",
  service_type_code: "SEI",
  clock_in_timestamp: "2026-08-27T14:00:00.000Z",
  evv_live: true,
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCaseloadUuid(id: string): boolean {
  return UUID_RE.test(id) && CASELOAD.some((c) => c.id === id);
}
