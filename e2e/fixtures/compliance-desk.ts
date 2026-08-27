/**
 * Fixture data for the compliance-desk Playwright harness.
 * Synthetic UUIDs only — never True North production timesheet ids.
 */

export const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
export const STAFF_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
export const STAFF_ID_2 = "cccccccc-cccc-cccc-cccc-ccccccccccc2";
export const CLIENT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
export const CLIENT_ID_2 = "dddddddd-dddd-dddd-dddd-ddddddddddd2";
export const TEAM_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
export const LOC_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
export const MEMBERSHIP_ID = "99999999-9999-4999-8999-999999999999";

const GPS_HOME = { latitude: 40.7608, longitude: -111.891, accuracy_meters: 12 };
const GPS_AWAY = { latitude: 40.768, longitude: -111.845, accuracy_meters: 18 };

export const FAKE_USER = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "e2e-admin@hive.test",
  user_metadata: { full_name: "E2E Admin" },
  app_metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

export const FAKE_SESSION = {
  access_token: "e2e-access-token",
  refresh_token: "e2e-refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: FAKE_USER,
};

const CLIENT_ALEX = {
  first_name: "Alex",
  last_name: "Rivera",
  physical_address: "123 Main St, Salt Lake City, UT 84101",
  medicaid_id: "0000123456",
  team_id: TEAM_ID,
};

const CLIENT_JORDAN = {
  first_name: "Jordan",
  last_name: "Lee",
  physical_address: "88 Pine Ave, Ogden, UT 84401",
  medicaid_id: "0000654321",
  team_id: TEAM_ID,
};

const STAFF_MAYA = { full_name: "Maya Chen", email: "maya@hive.test" };
const STAFF_SAM = { full_name: "Sam Ortiz", email: "sam@hive.test" };

function baseRow(over: Record<string, unknown>) {
  return {
    utah_medicaid_provider_id: "UT-E2E-PROVIDER",
    utah_medicaid_member_id: "0000123456",
    shift_entry_type: "Client_Profile_Pass",
    rounded_clock_in: null,
    rounded_clock_out: null,
    gps_in_coordinates: GPS_HOME,
    gps_out_coordinates: GPS_HOME,
    outside_geofence_reason: null,
    gps_in_bypassed: false,
    gps_in_bypass_reason: null,
    gps_out_bypassed: false,
    gps_out_bypass_reason: null,
    shift_note_text: "Supported grocery shopping and practiced money skills.",
    goals_completed: ["Practice counting change", "Stay with staff in community"],
    is_edited_by_admin: false,
    edited_by_admin_name: null,
    edit_audit_history_log: [],
    ai_compliance_status: "Verified",
    ai_coaching_iterations: 1,
    ai_compliance_feedback: "Note names the activity and the PCSP goal.",
    matched_approved_location_id: LOC_ID,
    matched_approved_location_label: "Home — 123 Main St",
    reconciliation_status: null,
    reconciliation_attestation: null,
    reconciliation_review_notes: null,
    reconciliation_reviewed_by: null,
    reconciliation_reviewed_at: null,
    review_status: null,
    attested_accurate: true,
    attested_at: "2026-08-20T16:05:00.000Z",
    corrected_clock_in: null,
    corrected_clock_out: null,
    edit_reason: null,
    edited_by: null,
    edited_at: null,
    incident_flag: false,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    staff_id: STAFF_ID,
    client_id: CLIENT_ID,
    clients: CLIENT_ALEX,
    staff: STAFF_MAYA,
    organization_id: ORG_ID,
    ...over,
  };
}

/** Pending EVV — MATCH (inside approved location). */
export const PENDING_EVV_MATCH = baseRow({
  id: "00000000-0000-4000-8000-000000000001",
  service_type_code: "SLH",
  status: "Pending",
  clock_in_timestamp: "2026-08-20T14:00:00.000Z",
  clock_out_timestamp: "2026-08-20T16:00:00.000Z",
});

/** Pending EVV — NEEDS RECONCILIATION. */
export const PENDING_EVV_NEEDS_RECON = baseRow({
  id: "00000000-0000-4000-8000-000000000002",
  service_type_code: "COM",
  status: "Pending",
  clock_in_timestamp: "2026-08-20T17:00:00.000Z",
  clock_out_timestamp: "2026-08-20T19:00:00.000Z",
  gps_in_coordinates: GPS_AWAY,
  gps_out_coordinates: GPS_AWAY,
  outside_geofence_reason: "Community outing at the library — no approved location for that site.",
  matched_approved_location_id: null,
  matched_approved_location_label: null,
  reconciliation_status: "pending",
  ai_compliance_status: "Exception",
  ai_compliance_feedback: "Geofence variance needs supervisor review.",
  shift_note_text: "Went to the library to work on literacy goals.",
});

/** Pending EVV — GPS bypassed (address used). */
export const PENDING_EVV_BYPASS = baseRow({
  id: "00000000-0000-4000-8000-000000000003",
  service_type_code: "PAC",
  status: "Pending",
  clock_in_timestamp: "2026-08-21T13:00:00.000Z",
  clock_out_timestamp: "2026-08-21T15:00:00.000Z",
  gps_in_bypassed: true,
  gps_in_bypass_reason: "Location permission denied on device",
  gps_out_bypassed: false,
});

/** Pending non-EVV (payroll/evidence only). */
export const PENDING_NON_EVV = baseRow({
  id: "00000000-0000-4000-8000-000000000004",
  staff_id: STAFF_ID_2,
  staff: STAFF_SAM,
  client_id: CLIENT_ID_2,
  clients: CLIENT_JORDAN,
  utah_medicaid_member_id: "0000654321",
  service_type_code: "SEI",
  status: "Pending",
  clock_in_timestamp: "2026-08-21T14:00:00.000Z",
  clock_out_timestamp: "2026-08-21T17:00:00.000Z",
  shift_note_text: "Job coaching at the warehouse.",
  goals_completed: ["Follow supervisor instructions"],
});

/** Needs review — caregiver time correction. */
export const NEEDS_REVIEW_CORRECTION = baseRow({
  id: "00000000-0000-4000-8000-000000000010",
  service_type_code: "SLN",
  status: "Pending",
  review_status: "needs_review",
  clock_in_timestamp: "2026-08-19T14:00:00.000Z",
  clock_out_timestamp: "2026-08-19T15:00:00.000Z",
  corrected_clock_in: "2026-08-19T14:00:00.000Z",
  corrected_clock_out: "2026-08-19T18:00:00.000Z",
  edit_reason: "Forgot to clock out until I got home.",
});

/** Needs review — incident flag. */
export const NEEDS_REVIEW_INCIDENT = baseRow({
  id: "00000000-0000-4000-8000-000000000011",
  staff_id: STAFF_ID_2,
  staff: STAFF_SAM,
  service_type_code: "COM",
  status: "Pending",
  review_status: "needs_review",
  incident_flag: true,
  clock_in_timestamp: "2026-08-19T18:00:00.000Z",
  clock_out_timestamp: "2026-08-19T20:00:00.000Z",
  edit_reason: "Incident during community walk; supervisor notified.",
  shift_note_text: "Person became distressed at the park. Staff followed BSP and called on-call.",
});

/** Needs review — ≥16h raw duration. */
export const NEEDS_REVIEW_LONG = baseRow({
  id: "00000000-0000-4000-8000-000000000012",
  service_type_code: "SLH",
  status: "Pending",
  review_status: "needs_review",
  clock_in_timestamp: "2026-08-18T06:00:00.000Z",
  clock_out_timestamp: "2026-08-19T00:30:00.000Z",
  edit_reason: "Overnight coverage — did not split the punch.",
});

/** Reconcile queue — pending (same as PENDING_EVV_NEEDS_RECON). */
export const RECON_PENDING = PENDING_EVV_NEEDS_RECON;

export const RECON_ACCEPTED = baseRow({
  id: "00000000-0000-4000-8000-000000000020",
  service_type_code: "SLH",
  status: "Approved",
  clock_in_timestamp: "2026-08-10T14:00:00.000Z",
  clock_out_timestamp: "2026-08-10T16:00:00.000Z",
  gps_in_coordinates: GPS_AWAY,
  outside_geofence_reason: "Medical appointment downtown.",
  reconciliation_status: "accepted",
  reconciliation_attestation: JSON.stringify({
    signed_name: "E2E Admin",
    signed_title: "Program Director",
    attestation_text:
      "I have reviewed this EVV location exception and the staff explanation, and I attest that the service was validly delivered and is approved for billing.",
    signed_at: "2026-08-11T12:00:00.000Z",
  }),
  reconciliation_reviewed_by: "E2E Admin",
  reconciliation_reviewed_at: "2026-08-11T12:00:00.000Z",
});

export const RECON_CORRECTED = baseRow({
  id: "00000000-0000-4000-8000-000000000021",
  service_type_code: "PAC",
  status: "Approved",
  clock_in_timestamp: "2026-08-11T14:00:00.000Z",
  clock_out_timestamp: "2026-08-11T16:00:00.000Z",
  gps_in_coordinates: { latitude: 0.1, longitude: 0.1, accuracy_meters: 5000 },
  outside_geofence_reason: "GPS jumped to the ocean.",
  reconciliation_status: "corrected",
  reconciliation_review_notes: "Device GPS glitch confirmed; address on file used.",
  reconciliation_reviewed_by: "E2E Admin",
  reconciliation_reviewed_at: "2026-08-12T12:00:00.000Z",
});

export const RECON_FLAGGED = baseRow({
  id: "00000000-0000-4000-8000-000000000022",
  service_type_code: "COM",
  status: "Approved",
  clock_in_timestamp: "2026-08-12T14:00:00.000Z",
  clock_out_timestamp: "2026-08-12T16:00:00.000Z",
  gps_in_coordinates: GPS_AWAY,
  outside_geofence_reason: "No explanation captured.",
  reconciliation_status: "flagged",
  reconciliation_review_notes: "Hold billing pending follow-up with caregiver.",
  reconciliation_reviewed_by: "E2E Admin",
  reconciliation_reviewed_at: "2026-08-13T12:00:00.000Z",
});

/** Approved EVV — billed (appears in export records). */
export const APPROVED_EVV_BILLED = baseRow({
  id: "00000000-0000-4000-8000-000000000030",
  service_type_code: "SLH",
  status: "Approved",
  clock_in_timestamp: "2026-08-05T14:00:00.000Z",
  clock_out_timestamp: "2026-08-05T16:00:00.000Z",
});

/** Approved EVV — unbilled (eligible, not exported). */
export const APPROVED_EVV_UNBILLED = baseRow({
  id: "00000000-0000-4000-8000-000000000031",
  service_type_code: "COM",
  status: "Approved",
  clock_in_timestamp: "2026-08-06T14:00:00.000Z",
  clock_out_timestamp: "2026-08-06T16:00:00.000Z",
});

/** Approved EVV — held (unresolved geofence). */
export const APPROVED_EVV_HELD = RECON_FLAGGED;

/** Approved non-EVV for Internal archive. */
export const APPROVED_NON_EVV = baseRow({
  id: "00000000-0000-4000-8000-000000000040",
  staff_id: STAFF_ID_2,
  staff: STAFF_SAM,
  client_id: CLIENT_ID_2,
  clients: CLIENT_JORDAN,
  utah_medicaid_member_id: "0000654321",
  service_type_code: "DSI",
  status: "Approved",
  clock_in_timestamp: "2026-08-07T14:00:00.000Z",
  clock_out_timestamp: "2026-08-07T18:00:00.000Z",
  shift_note_text: "Day supports at the workshop.",
});

export const ALL_TIMESHEETS = [
  PENDING_EVV_MATCH,
  PENDING_EVV_NEEDS_RECON,
  PENDING_EVV_BYPASS,
  PENDING_NON_EVV,
  NEEDS_REVIEW_CORRECTION,
  NEEDS_REVIEW_INCIDENT,
  NEEDS_REVIEW_LONG,
  RECON_ACCEPTED,
  RECON_CORRECTED,
  RECON_FLAGGED,
  APPROVED_EVV_BILLED,
  APPROVED_EVV_UNBILLED,
  APPROVED_NON_EVV,
];

export const TEAMS = [{ id: TEAM_ID, team_name: "Maple Home", organization_id: ORG_ID }];

export const DIRECTORY = [
  { id: STAFF_ID, full_name: STAFF_MAYA.full_name, email: STAFF_MAYA.email },
  { id: STAFF_ID_2, full_name: STAFF_SAM.full_name, email: STAFF_SAM.email },
  { id: USER_ID, full_name: "E2E Admin", email: FAKE_USER.email },
];

export const ORGANIZATION = {
  id: ORG_ID,
  name: "E2E True North Fixture",
  is_demo: false,
  legal_name: "E2E True North Fixture LLC",
  dba_name: "E2E TNS",
  display_acronym: "E2E",
  dhhs_provider_id: "E2E-DHHS-001",
  evv_vendor_name: "Hive",
  go_live_date: "2026-07-01",
  created_at: "2026-01-15T00:00:00.000Z",
};

export const MEMBERSHIP = {
  id: MEMBERSHIP_ID,
  user_id: USER_ID,
  role: "admin",
  job_title: "Program Director",
  organization_id: ORG_ID,
  active: true,
  organizations: ORGANIZATION,
};

export const APPROVED_LOCATIONS = [
  {
    id: LOC_ID,
    client_id: CLIENT_ID,
    label: "Home — 123 Main St",
    address: "123 Main St, Salt Lake City, UT 84101",
    latitude: GPS_HOME.latitude,
    longitude: GPS_HOME.longitude,
    geofence_radius_feet: 500,
  },
];

export const BILLING_CODES = [
  {
    client_id: CLIENT_ID,
    service_code: "HHS",
    monthly_max_units: 30,
    service_start_date: "2026-07-01",
    organization_id: ORG_ID,
    active: true,
  },
];

export const CLIENTS = [
  { id: CLIENT_ID, first_name: "Alex", last_name: "Rivera", organization_id: ORG_ID, hhs_monthly_support_hours: 20, team_id: TEAM_ID },
  { id: CLIENT_ID_2, first_name: "Jordan", last_name: "Lee", organization_id: ORG_ID, hhs_monthly_support_hours: null, team_id: TEAM_ID },
];

export const EXPORT_RECORDS = [
  {
    id: "00000000-0000-4000-8000-000000000050",
    timesheet_id: APPROVED_EVV_BILLED.id,
    batch_id: "00000000-0000-4000-8000-000000000051",
    record_id: 1,
    is_correction: false,
    orig_record: null,
    created_at: "2026-08-08T12:00:00.000Z",
    organization_id: ORG_ID,
  },
];

export const EXPORT_BATCHES = [
  {
    id: "00000000-0000-4000-8000-000000000051",
    batch_number: 1,
    range_start: "2026-08-04",
    range_end: "2026-08-10",
    row_count: 1,
    created_by: USER_ID,
    created_at: "2026-08-08T12:00:00.000Z",
    organization_id: ORG_ID,
  },
];

export const PROFILE = {
  id: USER_ID,
  must_change_password: false,
  staff_type_keys: [],
  bc_role: null,
  full_name: "E2E Admin",
};
