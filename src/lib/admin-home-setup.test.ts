import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ADMIN_HOME_OBLIGATIONS_QUIET,
  ADMIN_HOME_SETUP_TOTAL,
  adminHomeHeadline,
  adminHomeProgressLine,
  adminHomeSetupProgress,
  adminHomeSupport,
  buildAdminHomeSetupSteps,
  greetingWord,
  hasAddedFirstClient,
  hasAddedFirstStaff,
  hasScheduledFirstShift,
  sessionFirstName,
} from "./admin-home-setup.ts";

describe("admin home setup progress", () => {
  it("treats the founding owner as not yet having added staff", () => {
    assert.equal(
      hasAddedFirstStaff({
        memberCount: 1,
        pendingInviteCount: 0,
        clientCount: 0,
        shiftCount: 0,
      }),
      false,
    );
  });

  it("counts a second member or a pending invite as first staff", () => {
    assert.equal(
      hasAddedFirstStaff({
        memberCount: 2,
        pendingInviteCount: 0,
        clientCount: 0,
        shiftCount: 0,
      }),
      true,
    );
    assert.equal(
      hasAddedFirstStaff({
        memberCount: 1,
        pendingInviteCount: 1,
        clientCount: 0,
        shiftCount: 0,
      }),
      true,
    );
  });

  it("marks client and shift from counts", () => {
    assert.equal(
      hasAddedFirstClient({
        memberCount: 1,
        pendingInviteCount: 0,
        clientCount: 0,
        shiftCount: 0,
      }),
      false,
    );
    assert.equal(
      hasAddedFirstClient({
        memberCount: 1,
        pendingInviteCount: 0,
        clientCount: 1,
        shiftCount: 0,
      }),
      true,
    );
    assert.equal(
      hasScheduledFirstShift({
        memberCount: 1,
        pendingInviteCount: 0,
        clientCount: 1,
        shiftCount: 0,
      }),
      false,
    );
    assert.equal(
      hasScheduledFirstShift({
        memberCount: 1,
        pendingInviteCount: 0,
        clientCount: 1,
        shiftCount: 1,
      }),
      true,
    );
  });

  it("builds three steps and names the next incomplete one", () => {
    const steps = buildAdminHomeSetupSteps({
      memberCount: 2,
      pendingInviteCount: 0,
      clientCount: 0,
      shiftCount: 0,
    });
    assert.equal(steps.length, ADMIN_HOME_SETUP_TOTAL);
    const progress = adminHomeSetupProgress(steps);
    assert.equal(progress.done, 1);
    assert.equal(progress.total, 3);
    assert.equal(progress.nextId, "client");
    assert.equal(progress.allComplete, false);
    assert.equal(adminHomeProgressLine(progress.done, progress.total), "You're 1 of 3 set up.");
    assert.equal(steps[0]?.href, "/dashboard/hub/employees");
    assert.equal(steps[1]?.href, "/dashboard/hub/clients");
    assert.equal(steps[2]?.href, "/dashboard/scheduler");
  });

  it("is complete when staff, client, and a shift exist", () => {
    const steps = buildAdminHomeSetupSteps({
      memberCount: 2,
      pendingInviteCount: 0,
      clientCount: 1,
      shiftCount: 1,
    });
    const progress = adminHomeSetupProgress(steps);
    assert.equal(progress.done, 3);
    assert.equal(progress.nextId, null);
    assert.equal(progress.allComplete, true);
    assert.equal(adminHomeHeadline(true), "The office is standing.");
    assert.match(adminHomeSupport(true), /go home/i);
    assert.equal(adminHomeHeadline(false), "The office is open.");
  });

  it("does not make uploading sources a setup step", () => {
    const steps = buildAdminHomeSetupSteps({
      memberCount: 0,
      pendingInviteCount: 0,
      clientCount: 0,
      shiftCount: 0,
    });
    assert.equal(
      steps.some((step) => /authoritative|upload|source/i.test(`${step.title} ${step.body} ${step.cta}`)),
      false,
    );
    assert.match(ADMIN_HOME_OBLIGATIONS_QUIET, /already in the office/i);
    assert.doesNotMatch(ADMIN_HOME_OBLIGATIONS_QUIET, /authoritative sources/i);
  });
});

describe("admin home greeting", () => {
  it("reads a first name from session metadata", () => {
    assert.equal(sessionFirstName({ user_metadata: { first_name: "Dana" } }), "Dana");
    assert.equal(sessionFirstName({ user_metadata: { full_name: "Dana Admin" } }), "Dana");
    assert.equal(sessionFirstName({ email: "owner@agency.example" }), "owner");
    assert.equal(sessionFirstName(null), "there");
  });

  it("greets by Denver hour", () => {
    assert.equal(greetingWord(new Date("2026-09-04T15:00:00.000Z")), "morning");
    assert.equal(greetingWord(new Date("2026-09-04T20:00:00.000Z")), "afternoon");
    assert.equal(greetingWord(new Date("2026-09-05T03:00:00.000Z")), "evening");
  });
});

describe("admin home surfaces (source)", () => {
  it("Home is a guided checklist — not Nectar and not a compliance dump", () => {
    const home = readFileSync(
      fileURLToPath(new URL("../components/admin-home/admin-home-dashboard.tsx", import.meta.url)),
      "utf8",
    );
    const index = readFileSync(
      fileURLToPath(new URL("../routes/dashboard.index.tsx", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(index, /NectarOnboardingPanel/);
    assert.doesNotMatch(home, /NectarRail/);
    assert.doesNotMatch(home, /authoritative sources/i);
    assert.doesNotMatch(home, /Compliance by area/);
    assert.doesNotMatch(home, /Staff with overdue/);
    assert.match(home, /adminHomeProgressLine/);
    assert.match(home, /buildAdminHomeSetupSteps/);
    assert.match(home, /ADMIN_HOME_OBLIGATIONS_QUIET/);
    const setup = readFileSync(
      fileURLToPath(new URL("./admin-home-setup.ts", import.meta.url)),
      "utf8",
    );
    assert.match(setup, /Add your first staff/);
    assert.match(setup, /Add your first client/);
    assert.match(setup, /Schedule a shift/);
    assert.match(setup, /You're \$\{done\} of \$\{total\} set up/);
  });
});
