import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CMP_CMS_MAX_HOURS_PER_DAY,
  DSI_MAX_HOURS_PER_DAY,
  evaluateEntryReadiness,
  evvFactFromPunch,
  externalReportingFactFromCodes,
  factsFromTimesheet,
  matchAuthRow,
  narrativePassIsNotBillingReady,
  serviceLimitFromDuration,
} from "./dspd-entry-readiness.ts";
import { completenessFromChecks } from "./nectar-completeness.ts";

const NARRATIVE_PASS = completenessFromChecks([
  { key: "word_count", passed: true, message: "ok" },
  { key: "client_referenced", passed: true, message: "ok" },
  { key: "support_provided", passed: true, message: "ok" },
  { key: "client_response", passed: true, message: "ok" },
]);

const AUTH_OK = {
  serviceStartDate: "2026-07-01",
  serviceEndDate: "2027-06-30",
};

describe("evaluateEntryReadiness — three lanes stay separate", () => {
  it("narrative-only pass is not billing eligible when a justified hold exists", () => {
    const result = evaluateEntryReadiness({
      serviceCode: "SLH",
      clientId: "11111111-1111-1111-1111-111111111111",
      note: { completeness: NARRATIVE_PASS, hasNarrative: true },
      authorization: AUTH_OK,
      evv: { gpsPresent: false, geofenceSatisfied: false },
      signature: { required: true, attested: true },
    });
    assert.equal(result.note.status, "complete");
    assert.equal(result.staff.status, "ready");
    assert.equal(result.billing.status, "held");
    assert.equal(narrativePassIsNotBillingReady(result), true);
    assert.equal(result.billing.holds.some((h) => h.kind === "evv"), true);
    assert.equal(result.billing.holds.some((h) => h.kind === "signature"), false);
  });

  it("does not treat a complete note as a billing hold", () => {
    const result = evaluateEntryReadiness({
      serviceCode: "DSI",
      note: { completeness: NARRATIVE_PASS, hasNarrative: true },
      authorization: AUTH_OK,
      signature: { required: true, attested: true },
    });
    assert.equal(result.note.status, "complete");
    assert.equal(result.billing.status, "eligible");
    assert.equal(result.billing.holds.length, 0);
  });

  it("leaves note incomplete without holding billing for the narrative", () => {
    const result = evaluateEntryReadiness({
      serviceCode: "DSI",
      note: { aiComplianceStatus: "Flagged", hasNarrative: true },
      authorization: AUTH_OK,
      signature: { required: true, attested: true },
    });
    assert.equal(result.note.status, "incomplete");
    assert.equal(result.billing.status, "eligible");
    assert.equal(result.billing.holds.length, 0);
  });
});

describe("evaluateEntryReadiness — configured gaps can block", () => {
  it("missing qualification blocks staff and billing when configured", () => {
    const result = evaluateEntryReadiness({
      serviceCode: "SEI",
      staffId: "22222222-2222-2222-2222-222222222222",
      note: { completeness: NARRATIVE_PASS, hasNarrative: true },
      authorization: AUTH_OK,
      qualifications: {
        configured: true,
        missingLabels: ["external_cert:acre (unexpired)"],
        requirementId: "req-acre",
      },
      signature: { required: true, attested: true },
    });
    assert.equal(result.staff.status, "blocked");
    assert.equal(result.note.status, "complete");
    assert.equal(result.billing.status, "held");
    const staffHold = result.staff.holds.find((h) => h.kind === "qualification");
    assert.ok(staffHold);
    assert.equal(staffHold?.requirementId, "req-acre");
    assert.equal(staffHold?.clear.to, "/dashboard/compliance");
    assert.equal(result.billing.holds.some((h) => h.kind === "qualification"), true);
  });

  it("does not invent a qualification hold when no rule is configured", () => {
    const result = evaluateEntryReadiness({
      serviceCode: "DSI",
      qualifications: { configured: false, missingLabels: ["external_cert:cpr"] },
      authorization: AUTH_OK,
      signature: { required: true, attested: true },
    });
    assert.equal(result.staff.status, "ready");
    assert.equal(result.billing.status, "eligible");
  });

  it("missing EVV GPS blocks billing on an EVV-locked code", () => {
    const evv = evvFactFromPunch({
      serviceCode: "SLH",
      gpsIn: { latitude: null, longitude: null },
      gpsOut: { latitude: null, longitude: null },
    });
    assert.ok(evv);
    assert.equal(evv.gpsPresent, false);
    const result = evaluateEntryReadiness({
      serviceCode: "SLH",
      evv,
      authorization: AUTH_OK,
      signature: { required: true, attested: true },
    });
    assert.equal(result.billing.status, "held");
    const hold = result.billing.holds.find((h) => h.kind === "evv");
    assert.ok(hold);
    assert.equal(hold?.clear.to, "/dashboard/timeclock");
  });

  it("does not raise an EVV hold on a non-mandated code even without GPS", () => {
    const evv = evvFactFromPunch({
      serviceCode: "DSI",
      gpsIn: { latitude: null, longitude: null },
    });
    assert.equal(evv, null);
    const result = evaluateEntryReadiness({
      serviceCode: "DSI",
      evv: { gpsPresent: false, geofenceSatisfied: false },
      authorization: AUTH_OK,
      signature: { required: true, attested: true },
    });
    assert.equal(result.billing.holds.some((h) => h.kind === "evv"), false);
    assert.equal(result.billing.status, "eligible");
  });

  it("missing signature blocks billing when attestation is required", () => {
    const result = evaluateEntryReadiness({
      serviceCode: "DSI",
      authorization: AUTH_OK,
      signature: { required: true, attested: false },
      note: { completeness: NARRATIVE_PASS, hasNarrative: true },
    });
    assert.equal(result.note.status, "complete");
    assert.equal(result.billing.status, "held");
    const hold = result.billing.holds.find((h) => h.kind === "signature");
    assert.ok(hold);
    assert.match(hold!.gap, /attested/i);
    assert.equal(hold?.clear.to, "/dashboard/compliance-desk");
  });

  it("does not raise a signature hold when attestation is not required", () => {
    const result = evaluateEntryReadiness({
      serviceCode: "DSI",
      authorization: AUTH_OK,
      signature: { required: false, attested: false },
    });
    assert.equal(result.billing.holds.some((h) => h.kind === "signature"), false);
  });
});

describe("evaluateEntryReadiness — hold clears when the gap clears", () => {
  it("drops the EVV hold once GPS and geofence are satisfied", () => {
    const blocked = evaluateEntryReadiness({
      serviceCode: "COM",
      authorization: AUTH_OK,
      evv: { gpsPresent: false, geofenceSatisfied: false },
      signature: { required: true, attested: true },
    });
    assert.equal(blocked.billing.status, "held");

    const cleared = evaluateEntryReadiness({
      serviceCode: "COM",
      authorization: AUTH_OK,
      evv: evvFactFromPunch({
        serviceCode: "COM",
        gpsIn: { latitude: 40.76, longitude: -111.89 },
        outsideGeofenceReason: null,
      }),
      signature: { required: true, attested: true },
    });
    assert.equal(cleared.billing.status, "eligible");
    assert.equal(cleared.billing.holds.length, 0);
  });

  it("drops the qualification hold once the missing label is gone", () => {
    const blocked = evaluateEntryReadiness({
      serviceCode: "SEI",
      qualifications: { configured: true, missingLabels: ["hive_course:acre"] },
      authorization: AUTH_OK,
      signature: { required: true, attested: true },
    });
    assert.equal(blocked.staff.status, "blocked");

    const cleared = evaluateEntryReadiness({
      serviceCode: "SEI",
      qualifications: { configured: true, missingLabels: [] },
      authorization: AUTH_OK,
      signature: { required: true, attested: true },
    });
    assert.equal(cleared.staff.status, "ready");
    assert.equal(cleared.billing.status, "eligible");
  });

  it("drops the signature hold once attested", () => {
    const facts = {
      serviceCode: "DSI",
      authorization: AUTH_OK,
      note: { completeness: NARRATIVE_PASS, hasNarrative: true },
    };
    const blocked = evaluateEntryReadiness({
      ...facts,
      signature: { required: true, attested: false },
    });
    const cleared = evaluateEntryReadiness({
      ...facts,
      signature: { required: true, attested: true },
    });
    assert.equal(blocked.billing.status, "held");
    assert.equal(cleared.billing.status, "eligible");
  });
});

describe("evaluateEntryReadiness — other existing hooks", () => {
  it("holds billing without an active 1056", () => {
    const result = evaluateEntryReadiness({
      serviceCode: "HHS",
      clientId: "11111111-1111-1111-1111-111111111111",
      authorization: { serviceStartDate: "2025-01-01", serviceEndDate: "2025-12-31" },
    });
    assert.equal(result.billing.status, "held");
    const hold = result.billing.holds.find((h) => h.kind === "authorization");
    assert.ok(hold);
    assert.equal(hold?.clear.to, "/dashboard/billing/$clientId");
  });

  it("holds DSI over the 6h day cap", () => {
    const limit = serviceLimitFromDuration("DSI", 7);
    assert.ok(limit);
    assert.equal(limit.maxHours, DSI_MAX_HOURS_PER_DAY);
    const result = evaluateEntryReadiness({
      serviceCode: "DSI",
      authorization: AUTH_OK,
      serviceLimit: limit,
      signature: { required: true, attested: true },
    });
    assert.equal(result.billing.status, "held");
    assert.equal(result.billing.holds.some((h) => h.kind === "service_limit"), true);
  });

  it("holds CMP over the 8h day cap", () => {
    const limit = serviceLimitFromDuration("CMP", 9);
    assert.ok(limit);
    assert.equal(limit.maxHours, CMP_CMS_MAX_HOURS_PER_DAY);
    const result = evaluateEntryReadiness({
      serviceCode: "CMP",
      authorization: AUTH_OK,
      serviceLimit: limit,
      signature: { required: true, attested: true },
    });
    assert.equal(result.billing.holds[0]?.kind, "service_limit");
  });

  it("holds configured incompatible codes and UPI when the period fact is required", () => {
    const combo = evaluateEntryReadiness({
      serviceCode: "SLH",
      authorization: AUTH_OK,
      incompatible: { configured: true, conflictingCodes: ["SLH", "HHS"], requirementId: "req-conflict" },
      signature: { required: true, attested: true },
    });
    assert.equal(combo.billing.holds.some((h) => h.kind === "incompatible_codes"), true);
    assert.equal(combo.billing.holds[0]?.requirementId, "req-conflict");

    const upi = externalReportingFactFromCodes(["SEI"], false);
    assert.ok(upi);
    const period = evaluateEntryReadiness({
      serviceCode: "SEI",
      authorization: AUTH_OK,
      externalReporting: upi,
      signature: { required: true, attested: true },
    });
    assert.equal(period.billing.holds.some((h) => h.kind === "external_reporting"), true);
    const upiClear = evaluateEntryReadiness({
      serviceCode: "SEI",
      authorization: AUTH_OK,
      externalReporting: { required: true, completed: true },
      signature: { required: true, attested: true },
    });
    assert.equal(upiClear.billing.status, "eligible");
  });
});

describe("factsFromTimesheet — unknown auth is not a hold", () => {
  const row = {
    id: "ts-1",
    client_id: "11111111-1111-1111-1111-111111111111",
    service_type_code: "DSI",
    clock_in_timestamp: "2026-09-01T15:00:00.000Z",
    clock_out_timestamp: "2026-09-01T18:00:00.000Z",
    attested_at: "2026-09-01T18:01:00.000Z",
    attested_accurate: true,
    ai_compliance_status: "Verified",
    shift_note_text: "Staff supported Blake with dinner prep. Blake chose pasta and plated it himself after one prompt.",
  };

  it("does not hold authorization when auth rows have not loaded", () => {
    const result = evaluateEntryReadiness(factsFromTimesheet(row, undefined));
    assert.equal(result.billing.holds.some((h) => h.kind === "authorization"), false);
  });

  it("holds authorization when the 1056 row is known-missing, then clears when it appears", () => {
    const missing = evaluateEntryReadiness(factsFromTimesheet(row, null));
    assert.equal(missing.billing.status, "held");
    assert.equal(missing.billing.holds.some((h) => h.kind === "authorization"), true);

    const rows = [
      {
        client_id: row.client_id,
        service_code: "DSI",
        service_start_date: "2026-07-01",
        service_end_date: "2027-06-30",
      },
    ];
    const found = matchAuthRow(rows, row.client_id, "DSI");
    const cleared = evaluateEntryReadiness(factsFromTimesheet(row, found));
    assert.equal(cleared.billing.status, "eligible");
  });
});
