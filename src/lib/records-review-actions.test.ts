import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ACCEPT_ATTESTATION_TEXT,
  ACTIONS_BY_EXCEPTION,
  actionsForExceptions,
  acceptGeofencePatch,
  approveTimesheetPatch,
  flagTimesheetPatch,
  REVIEW_ACTION_LABEL,
  trimClockOutPatch,
} from "./records-review-actions.ts";

describe("Records review buttons per exception", () => {
  it("maps Ask / Accept / Flag for out of geofence", () => {
    assert.deepEqual(ACTIONS_BY_EXCEPTION.out_of_geofence, ["ask", "accept", "flag"]);
  });

  it("maps Ask / Approve / Flag for missing note", () => {
    assert.deepEqual(ACTIONS_BY_EXCEPTION.missing_note, ["ask", "approve", "flag"]);
  });

  it("maps Ask / Trim / Flag for stale open punch", () => {
    assert.deepEqual(ACTIONS_BY_EXCEPTION.no_clockout_stale, ["ask", "trim", "flag"]);
  });

  it("maps Ask / Trim / Approve for late clock-out", () => {
    assert.deepEqual(ACTIONS_BY_EXCEPTION.late_clock_out, ["ask", "trim", "approve"]);
  });

  it("unions buttons in Ask / Approve / Trim / Accept / Flag order", () => {
    assert.deepEqual(
      actionsForExceptions(["late_clock_out", "out_of_geofence"]),
      ["ask", "approve", "trim", "accept", "flag"],
    );
  });

  it("labels stay the exact five words", () => {
    assert.deepEqual(Object.values(REVIEW_ACTION_LABEL), [
      "Ask",
      "Approve",
      "Trim",
      "Accept",
      "Flag",
    ]);
  });
});

describe("Records review DB patches (existing desk columns)", () => {
  const now = new Date("2026-09-11T18:00:00.000Z");

  it("Approve writes status + review_status like reviewApprove", () => {
    const patch = approveTimesheetPatch({
      reviewerId: "user-1",
      note: "Looks good",
      now,
    });
    assert.equal(patch.status, "Approved");
    assert.equal(patch.review_status, "approved");
    assert.equal(patch.reviewed_by, "user-1");
    assert.equal(patch.reviewed_at, now.toISOString());
    assert.equal(patch.review_note, "Looks good");
  });

  it("Trim writes corrected/rounded clock-out and never a raw timestamp key", () => {
    const patch = trimClockOutPatch({
      clockInIso: "2026-09-11T08:00:00.000Z",
      trimToIso: "2026-09-11T16:07:00.000Z",
    });
    assert.equal(patch.corrected_clock_out, "2026-09-11T16:07:00.000Z");
    assert.equal(patch.rounded_clock_out, "2026-09-11T16:00:00.000Z");
    assert.equal("clock_out_timestamp" in patch, false);
  });

  it("Trim defaults an 8-hour window from clock-in", () => {
    const patch = trimClockOutPatch({ clockInIso: "2026-09-11T08:00:00.000Z" });
    assert.equal(patch.corrected_clock_out, "2026-09-11T16:00:00.000Z");
  });

  it("Accept writes reconciliation_status accepted + attestation JSON", () => {
    const patch = acceptGeofencePatch({
      reviewerName: "Dane",
      signedName: "Dane Warnick",
      signedTitle: "Program Director",
      notes: "Community outing",
      now,
    });
    assert.equal(patch.reconciliation_status, "accepted");
    const att = JSON.parse(patch.reconciliation_attestation) as {
      attestation_text: string;
      signed_name: string;
    };
    assert.equal(att.attestation_text, ACCEPT_ATTESTATION_TEXT);
    assert.equal(att.signed_name, "Dane Warnick");
    assert.equal(patch.reconciliation_reviewed_by, "Dane");
  });

  it("Accept requires a signed name and title", () => {
    assert.throws(
      () =>
        acceptGeofencePatch({
          reviewerName: "Dane",
          signedName: "D",
          signedTitle: "PD",
        }),
      /Signed name and title/,
    );
  });

  it("Flag writes incident_flag and reconciliation_status flagged", () => {
    const patch = flagTimesheetPatch({ reviewerName: "Dane", notes: "Hold", now });
    assert.equal(patch.incident_flag, true);
    assert.equal(patch.reconciliation_status, "flagged");
    assert.equal(patch.reconciliation_review_notes, "Hold");
  });
});

describe("late clock-out Ask / Trim / Approve path", () => {
  it("shows Ask, Trim, and Approve for a late clock-out", () => {
    assert.deepEqual(actionsForExceptions(["late_clock_out"]), [
      "ask",
      "approve",
      "trim",
    ]);
  });
});

describe("Records review lock", () => {
  it("does not introduce UI emoji in the action module", () => {
    const src = readFileSync(new URL("./records-review-actions.ts", import.meta.url), "utf8");
    assert.equal(/\p{Extended_Pictographic}/u.test(src), false);
  });
});
