import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  NONWAIVABLE_REJECT,
  OVERRIDE_STATE_LABEL,
  OVERRIDE_STILL_REQUIRED,
  activeOverrideForTarget,
  assertWaivableObligationKey,
  auditOverrideHistory,
  buildOverrideInsert,
  isWaivableObligationKey,
  overrideIsActive,
  overrideLeavesRequirementOpen,
  parseOverrideScope,
  requireFutureExpiresAt,
  selectActiveOverride,
  type OverrideRow,
} from "./overrides.ts";
import { BLOCKS_SOLO_WHEN_LAPSED_KEYS } from "./solo-lapse.ts";
import { sowCatalogEntryByKey } from "../sow-obligation-catalog.ts";

const NOW = new Date("2026-09-11T12:00:00.000Z");
const STAFF = "11111111-1111-1111-1111-111111111111";
const ADMIN = "44444444-4444-4444-4444-444444444444";

function row(partial: Partial<OverrideRow> & Pick<OverrideRow, "id">): OverrideRow {
  return {
    organization_id: "org",
    staff_id: STAFF,
    obligation_id: "ob-cpr",
    instance_id: "inst-cpr",
    obligation_key: "cpr_first_aid_renewal",
    gap_key: "cpr_first_aid_renewal",
    gap_type: "instance",
    kind: "solo_lapse",
    reason: "Coverage until the recert class.",
    expires_at: "2026-09-18T00:00:00.000Z",
    created_by: ADMIN,
    created_at: "2026-09-11T10:00:00.000Z",
    shift_id: null,
    ...partial,
  };
}

describe("waivable allowlist", () => {
  it("allows only the solo-lapse catalog keys and rejects everything else", () => {
    for (const key of BLOCKS_SOLO_WHEN_LAPSED_KEYS) {
      assert.equal(isWaivableObligationKey(key), true);
      assert.ok(sowCatalogEntryByKey(key), `missing catalog entry for ${key}`);
      assert.equal(assertWaivableObligationKey(key), key);
    }
    assert.equal(isWaivableObligationKey("ce_12h_annual"), false);
    assert.equal(isWaivableObligationKey("medicaid_enrollment"), false);
    assert.equal(isWaivableObligationKey("hhs_home_cert_annual"), false);
    assert.equal(isWaivableObligationKey(null), false);
    assert.throws(
      () => assertWaivableObligationKey("ce_12h_annual"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, NONWAIVABLE_REJECT);
        return true;
      },
    );
  });
});

describe("override expiration", () => {
  it("stops applying when expires_at is in the past", () => {
    assert.equal(overrideIsActive("2026-09-10T00:00:00.000Z", NOW), false);
    assert.equal(overrideIsActive("2026-09-12T00:00:00.000Z", NOW), true);
    assert.equal(
      selectActiveOverride([row({ id: "old", expires_at: "2026-09-10T00:00:00.000Z" })], NOW),
      null,
    );
  });

  it("requires a future expires_at on new writes", () => {
    assert.throws(() => requireFutureExpiresAt("2026-09-10T00:00:00.000Z", NOW), /future/);
    assert.throws(() => requireFutureExpiresAt("not-a-date", NOW), /required/);
    assert.equal(
      requireFutureExpiresAt("2026-09-18T00:00:00.000Z", NOW),
      "2026-09-18T00:00:00.000Z",
    );
  });
});

describe("override insert and audit", () => {
  it("writes authority, reason, scope, and expires_at onto existing columns", () => {
    const insert = buildOverrideInsert({
      organizationId: "org",
      staffId: STAFF,
      obligationKey: "cpr_first_aid_renewal",
      obligationId: "ob-cpr",
      instanceId: "inst-cpr",
      scope: "instance",
      reason: "Coverage until the recert class.",
      expiresAt: "2026-09-18T00:00:00.000Z",
      createdBy: ADMIN,
      now: NOW,
    });
    assert.equal(insert.created_by, ADMIN);
    assert.equal(insert.reason, "Coverage until the recert class.");
    assert.equal(insert.gap_type, "instance");
    assert.equal(insert.expires_at, "2026-09-18T00:00:00.000Z");
    assert.equal(insert.obligation_key, "cpr_first_aid_renewal");
    assert.equal(insert.instance_id, "inst-cpr");
  });

  it("rejects nonwaivable keys and keeps prior rows when a later override is recorded", () => {
    assert.throws(
      () =>
        buildOverrideInsert({
          organizationId: "org",
          staffId: STAFF,
          obligationKey: "ce_12h_annual",
          scope: "instance",
          reason: "Coverage until the recert class.",
          expiresAt: "2026-09-18T00:00:00.000Z",
          createdBy: ADMIN,
          now: NOW,
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, NONWAIVABLE_REJECT);
        return true;
      },
    );

    const first = row({ id: "o1", created_at: "2026-09-10T10:00:00.000Z" });
    const second = row({
      id: "o2",
      created_at: "2026-09-11T11:00:00.000Z",
      reason: "Extended through Friday.",
      expires_at: "2026-09-20T00:00:00.000Z",
    });
    const history = auditOverrideHistory([second, first]);
    assert.deepEqual(
      history.map((r) => r.id),
      ["o1", "o2"],
    );
    assert.equal(history[0]?.reason, "Coverage until the recert class.");
    const active = selectActiveOverride([first, second], NOW);
    assert.equal(active?.id, "o2");
    assert.equal(active?.reason, "Extended through Friday.");
  });

  it("does not treat an override as completing the requirement", () => {
    assert.equal(overrideLeavesRequirementOpen("overdue"), true);
    assert.equal(overrideLeavesRequirementOpen("pending"), true);
    assert.equal(overrideLeavesRequirementOpen("completed"), false);
    assert.equal(OVERRIDE_STATE_LABEL, "Overridden");
    assert.match(OVERRIDE_STILL_REQUIRED, /not complete/);
  });
});

describe("override targeting", () => {
  it("matches instance or staff clock and ignores expired rows", () => {
    const active = row({ id: "live" });
    const expired = row({
      id: "dead",
      expires_at: "2026-09-01T00:00:00.000Z",
      created_at: "2026-09-11T11:00:00.000Z",
    });
    assert.equal(
      activeOverrideForTarget(
        [expired, active],
        { instanceId: "inst-cpr", obligationKey: "cpr_first_aid_renewal", staffId: STAFF },
        NOW,
      )?.id,
      "live",
    );
    assert.equal(parseOverrideScope("solo_lapse"), "staff_clock");
    assert.equal(parseOverrideScope("instance"), "instance");
  });
});

describe("remediation and override writers stay on one engine", () => {
  it("does not mark instances complete and never updates override rows", () => {
    const fns = readFileSync(new URL("./remediation.functions.ts", import.meta.url), "utf8");
    const nightly = readFileSync(new URL("./remediation.ts", import.meta.url), "utf8");
    const model = readFileSync(new URL("./overrides.ts", import.meta.url), "utf8");
    assert.match(fns, /export const recordObligationOverride/);
    assert.match(fns, /export const listOverridesForStaff/);
    assert.match(fns, /buildOverrideInsert/);
    assert.doesNotMatch(fns, /from\("compliance_overrides"\)[\s\S]{0,400}\.update\(/);
    assert.doesNotMatch(
      fns,
      /from\("company_obligation_instances"\)[\s\S]{0,800}status:\s*"completed"/,
    );
    assert.doesNotMatch(nightly, /from\("company_obligation_instances"\)[\s\S]{0,400}\.update\(/);
    assert.match(model, /Insert-only/);
  });
});
