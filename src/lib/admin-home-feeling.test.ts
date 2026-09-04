import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ADMIN_HOME_BOARD_CTA,
  ADMIN_HOME_BOARD_TO,
  ADMIN_HOME_CARDS,
  ADMIN_HOME_EYEBROW,
  ADMIN_HOME_FOOTER,
  ADMIN_HOME_HEADLINE,
  ADMIN_HOME_SUBHEAD,
} from "./admin-home-feeling.ts";

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("feeling-hero B Admin Home", () => {
  it("locks the hero, cards, footer, and CTA map", () => {
    assert.equal(ADMIN_HOME_EYEBROW, "WELCOME TO YOUR HOME BASE");
    assert.equal(ADMIN_HOME_HEADLINE, "The day just got smaller");
    assert.equal(
      ADMIN_HOME_SUBHEAD,
      "Run the shop in one place. Your staff, clients, and notes—together at last.",
    );
    assert.equal(ADMIN_HOME_BOARD_CTA, "See today's board →");
    assert.equal(ADMIN_HOME_BOARD_TO, "/dashboard/scheduler");
    assert.equal(ADMIN_HOME_FOOTER, "You're all set. Let's make it a great day.");
    assert.deepEqual(
      ADMIN_HOME_CARDS.map((c) => ({ title: c.title, to: c.to, cta: c.cta })),
      [
        { title: "Staff ready", to: "/dashboard/hub/employees", cta: "Add employee" },
        { title: "Clients covered", to: "/dashboard/hub/clients", cta: "Add client" },
        { title: "Notes done", to: "/dashboard/hub/documentation", cta: "Documentation" },
      ],
    );
  });

  it("wires the dashboard Home to feeling-hero B and not the obligation dump", () => {
    const dash = read("../components/admin-home/admin-home-dashboard.tsx");
    const index = read("../routes/dashboard.index.tsx");
    assert.match(dash, /ADMIN_HOME_HEADLINE/);
    assert.match(dash, /AdminHomeScheduleTablet/);
    assert.doesNotMatch(dash, /NectarRail|company_obligation_instances|Staff with overdue/);
    assert.doesNotMatch(index, /NectarOnboardingPanel/);
    assert.match(index, /AdminHomeDashboard/);
  });

  it("lets the shell main scroll — page must not clip at 100% height", () => {
    const dash = read("../components/admin-home/admin-home-dashboard.tsx");
    const index = read("../routes/dashboard.index.tsx");
    const sectionOpen = dash.slice(
      dash.indexOf('data-testid="admin-home-feeling-b"'),
      dash.indexOf("<DuskMountainBackdrop"),
    );
    assert.match(sectionOpen, /className="relative isolate min-h-full"/);
    assert.doesNotMatch(sectionOpen, /overflow-hidden/);
    assert.doesNotMatch(sectionOpen, /["\s]h-full["\s]/);
    assert.match(index, /showAdmin \? "min-h-full"/);
    assert.doesNotMatch(index, /showAdmin \? "h-full min-h-full"/);
  });

  it("puts a π-only mark in the sidebar and never a NECTAR wordmark there", () => {
    const shell = read("../routes/dashboard.tsx");
    const markSlot = shell.slice(
      shell.indexOf('<div className="flex h-16 items-center border-b'),
      shell.indexOf("{(isAdminCapable || isExecutive) &&"),
    );
    assert.match(markSlot, /HiveMark/);
    assert.doesNotMatch(markSlot, /HiveWordmark|NECTAR|PiWordmark/);
  });
});
