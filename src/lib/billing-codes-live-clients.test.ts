import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  billingCodesForLiveClients,
  uniqueBillingClientIds,
} from "./billing-codes-live-clients.ts";

/** Confirmed orphan client_ids — hide, do not delete. */
const GONE_HHS = "534ca354-gone-client";
const GONE_SLH = "217b8790-gone-client";
const LIVE = "aaaaaaaa-live-client";

describe("uniqueBillingClientIds", () => {
  it("dedupes and skips empty ids", () => {
    assert.deepEqual(
      uniqueBillingClientIds([
        { client_id: LIVE },
        { client_id: GONE_HHS },
        { client_id: LIVE },
        { client_id: "" },
        { client_id: null },
      ]),
      [LIVE, GONE_HHS],
    );
  });
});

describe("billingCodesForLiveClients — skip rows with no clients match", () => {
  it("keeps codes for live clients and drops the four orphan leftovers", () => {
    const rows = [
      { id: "live-dsi", client_id: LIVE, service_code: "DSI" },
      { id: "908a79e6", client_id: GONE_HHS, service_code: "HHS" },
      { id: "orphan-slh", client_id: GONE_SLH, service_code: "SLH" },
      { id: "orphan-hhs", client_id: GONE_SLH, service_code: "HHS" },
      { id: "orphan-dsi", client_id: GONE_SLH, service_code: "DSI" },
    ];
    const kept = billingCodesForLiveClients(rows, new Set([LIVE]));
    assert.deepEqual(kept.map((r) => r.id), ["live-dsi"]);
  });

  it("returns [] when no live clients match", () => {
    assert.deepEqual(
      billingCodesForLiveClients(
        [{ id: "908a79e6", client_id: GONE_HHS, service_code: "HHS" }],
        [],
      ),
      [],
    );
  });

  it("returns [] for an empty codes list", () => {
    assert.deepEqual(billingCodesForLiveClients([], [LIVE]), []);
  });
});
