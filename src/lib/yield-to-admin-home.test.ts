import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminHomeQueriesStarted,
  isAdminHomePath,
  layoutQueriesMayRun,
} from "./yield-to-admin-home.ts";

describe("isAdminHomePath", () => {
  it("matches the dashboard index only", () => {
    assert.equal(isAdminHomePath("/dashboard"), true);
    assert.equal(isAdminHomePath("/dashboard/"), true);
    assert.equal(isAdminHomePath("/dashboard/company-obligations"), false);
    assert.equal(isAdminHomePath("/dashboard/hub/clients"), false);
  });
});

describe("layoutQueriesMayRun", () => {
  it("runs immediately off Admin Home", () => {
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: false,
        setupStatus: undefined,
        gaveUp: false,
      }),
      true,
    );
  });

  it("waits on Admin Home until the setup query settles", () => {
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        setupStatus: undefined,
        gaveUp: false,
      }),
      false,
    );
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        setupStatus: "pending",
        gaveUp: false,
      }),
      false,
    );
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        setupStatus: "success",
        gaveUp: false,
      }),
      true,
    );
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        setupStatus: "error",
        gaveUp: false,
      }),
      true,
    );
  });

  it("gives up if Admin Home never starts its queries", () => {
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        setupStatus: undefined,
        gaveUp: true,
      }),
      true,
    );
  });
});

describe("adminHomeQueriesStarted", () => {
  it("is true once the setup query exists in cache", () => {
    assert.equal(adminHomeQueriesStarted(undefined), false);
    assert.equal(adminHomeQueriesStarted("pending"), true);
    assert.equal(adminHomeQueriesStarted("success"), true);
  });
});
