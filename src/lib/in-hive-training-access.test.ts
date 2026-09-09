import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  officeStaffMayTakeThirtyDay,
  orgSelectMissingBillingExempt,
  resolveThirtyDayAccess,
  rosterPaymentUnlocksThirtyDay,
  rosterTypeUnlocksThirtyDay,
  staffMatchesRosterRow,
  thirtyDayOrgIsComped,
} from "./in-hive-training-access.ts";

describe("thirty-day paywall", () => {
  it("Hive-Platform missing billing_exempt is a known schema gap, not a hard fail", () => {
    assert.equal(orgSelectMissingBillingExempt('column "billing_exempt" does not exist'), true);
    assert.equal(orgSelectMissingBillingExempt("permission denied"), false);
  });

  it("True North comps without a billing_exempt column on the org row", () => {
    assert.equal(
      thirtyDayOrgIsComped({
        id: "7fabcf5d-f826-487f-8730-8b0c3f1969bb",
        name: "True North Supports LLC",
        dba_name: "TNS",
        display_acronym: "TNS",
      }),
      true,
    );
    assert.equal(
      thirtyDayOrgIsComped({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Acme DSPD" }),
      false,
    );
  });

  it("True North / comped orgs never need a purchased seat", () => {
    assert.equal(officeStaffMayTakeThirtyDay({ billingExempt: true, hasPaidRosterSeat: false }), true);
    const r = resolveThirtyDayAccess({ billingExempt: true, hasPaidRosterSeat: false });
    assert.equal(r.allowed, true);
    assert.equal(r.reason, "tns_or_comped");
    assert.equal(r.charged, false);
  });

  it("paid orgs need a 30-day or pack roster seat", () => {
    assert.equal(officeStaffMayTakeThirtyDay({ billingExempt: false, hasPaidRosterSeat: false }), false);
    assert.equal(officeStaffMayTakeThirtyDay({ billingExempt: false, hasPaidRosterSeat: true }), true);
    assert.equal(rosterTypeUnlocksThirtyDay("thirty_day"), true);
    assert.equal(rosterTypeUnlocksThirtyDay("package"), true);
    assert.equal(rosterTypeUnlocksThirtyDay("cpr_first_aid"), false);
    assert.equal(rosterTypeUnlocksThirtyDay("mandt"), false);
    assert.equal(rosterPaymentUnlocksThirtyDay("paid"), true);
    assert.equal(rosterPaymentUnlocksThirtyDay("waived"), true);
    assert.equal(rosterPaymentUnlocksThirtyDay("pending"), false);
  });

  it("training-only paid seats unlock without a roster row", () => {
    const r = resolveThirtyDayAccess({
      billingExempt: false,
      hasPaidRosterSeat: false,
      hasTrainingOnlySeat: true,
    });
    assert.equal(r.allowed, true);
    assert.equal(r.reason, "training_only_seat");
    assert.equal(r.charged, true);
  });

  it("matches roster by user id or email", () => {
    const staff = { userId: "u1", email: "jordan@agency.example" };
    assert.equal(staffMatchesRosterRow(staff, { staffUserId: "u1", staffEmail: null }), true);
    assert.equal(
      staffMatchesRosterRow(staff, { staffUserId: null, staffEmail: "Jordan@agency.example" }),
      true,
    );
    assert.equal(staffMatchesRosterRow(staff, { staffUserId: "other", staffEmail: "nope@x.com" }), false);
  });
});
