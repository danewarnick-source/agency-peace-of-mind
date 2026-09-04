import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  FIRST_LOGIN_STEP_COUNT,
  firstLoginHeadline,
  firstLoginProgress,
  firstLoginProgressLabel,
  firstLoginSteps,
} from "./first-login-setup.ts";

const HOME = readFileSync(new URL("../components/admin-home/first-login-home.tsx", import.meta.url), "utf8");
const SETUP = readFileSync(new URL("./first-login-setup.ts", import.meta.url), "utf8");
const INDEX = readFileSync(new URL("../routes/dashboard.index.tsx", import.meta.url), "utf8");
const SURFACE = `${HOME}\n${SETUP}`;

describe("firstLoginSteps", () => {
  it("starts with staff as the next action", () => {
    const progress = firstLoginProgress({
      memberCount: 1,
      clientCount: 0,
      shiftCount: 0,
    });
    assert.equal(progress.completedCount, 0);
    assert.equal(progress.allComplete, false);
    assert.equal(progress.nextKey, "staff");
    assert.equal(progress.steps[0]?.done, false);
    assert.equal(progress.steps[0]?.href, "/dashboard/hub/employees");
    assert.equal(progress.steps[1]?.href, "/dashboard/hub/clients");
    assert.equal(progress.steps[2]?.href, "/dashboard/scheduler");
  });

  it("counts a second member as first staff", () => {
    const progress = firstLoginProgress({
      memberCount: 2,
      clientCount: 0,
      shiftCount: 0,
    });
    assert.equal(progress.completedCount, 1);
    assert.equal(progress.nextKey, "client");
    assert.equal(progress.steps[0]?.done, true);
  });

  it("does not treat the founding owner as first staff", () => {
    const steps = firstLoginSteps({
      memberCount: 1,
      clientCount: 1,
      shiftCount: 1,
    });
    assert.equal(steps[0]?.done, false);
    assert.equal(steps[1]?.done, true);
    assert.equal(steps[2]?.done, true);
  });

  it("is complete only after staff, client, and a shift", () => {
    const progress = firstLoginProgress({
      memberCount: 3,
      clientCount: 2,
      shiftCount: 1,
    });
    assert.equal(progress.completedCount, FIRST_LOGIN_STEP_COUNT);
    assert.equal(progress.allComplete, true);
    assert.equal(progress.nextKey, null);
  });
});

describe("firstLogin copy", () => {
  it("uses the locked progress line", () => {
    assert.equal(firstLoginProgressLabel(0), "You're 0 of 3 set up");
    assert.equal(firstLoginProgressLabel(2), "You're 2 of 3 set up");
  });

  it("keeps the empty-office headline impressionable", () => {
    assert.equal(firstLoginHeadline(0, "Dane"), "Your office is ready.");
    assert.equal(firstLoginHeadline(1, "Dane"), "You're 1 of 3 set up.");
    assert.equal(firstLoginHeadline(3, "Dane"), "You're set up, Dane.");
  });
});

describe("Admin Home first-login surface", () => {
  it("does not ship Nectar as the home hero", () => {
    assert.match(INDEX, /FirstLoginHome/);
    assert.doesNotMatch(INDEX, /NectarOnboardingPanel/);
  });

  it("keeps the locked checklist copy and no compliance dump on the first-login card", () => {
    assert.match(SURFACE, /Add first staff/);
    assert.match(SURFACE, /Add first client/);
    assert.match(SURFACE, /Schedule a shift/);
    assert.match(SURFACE, /Built-in obligations are already covered/);
    assert.doesNotMatch(SURFACE, /authoritative sources/i);
    assert.doesNotMatch(SURFACE, /NECTAR|Nectar/);
    assert.doesNotMatch(SURFACE, /DSPD|audit readiness|Compliance by area/);
    assert.doesNotMatch(SURFACE, /[\u{1F300}-\u{1FAFF}]/u);
  });
});
