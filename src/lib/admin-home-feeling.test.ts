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

describe("feeling-hero B (parked for Step 3)", () => {
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

  it("keeps feeling-hero copy locked and the schedule tablet unused by Home", () => {
    const welcome = read("../components/admin-home/admin-home-welcome.tsx");
    const dash = read("../components/admin-home/admin-home-dashboard.tsx");
    const tablet = read("../components/admin-home/admin-home-schedule-tablet.tsx");
    assert.match(welcome, /ADMIN_HOME_HEADLINE/);
    assert.match(welcome, /export function AdminHomeWelcome/);
    assert.match(tablet, /AdminHomeScheduleTablet/);
    assert.doesNotMatch(welcome, /AdminHomeScheduleTablet/);
    assert.doesNotMatch(dash, /ADMIN_HOME_HEADLINE|AdminHomeScheduleTablet/);
    assert.doesNotMatch(welcome, /#F3E5AB|ADMIN_HOME_PALE_GOLD/);
    assert.match(welcome, /PI_THEME\.cream/);
    assert.match(welcome, /PI_THEME\.buttons\.primaryBg/);
  });

  it("lets the shell main scroll — page must not clip at 100% height", () => {
    const dash = read("../components/admin-home/admin-home-dashboard.tsx");
    const index = read("../routes/dashboard.index.tsx");
    const sectionOpen = dash.slice(
      dash.indexOf('data-testid="admin-home-dashboard"'),
      dash.indexOf("<PageGlow"),
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
      shell.indexOf("aria-label=\"Provider Interface\""),
      shell.indexOf("{(isAdminCapable || isExecutive) &&"),
    );
    assert.match(markSlot, /HiveMark/);
    assert.doesNotMatch(markSlot, /HiveWordmark|NECTAR|PiWordmark/);
  });
});

describe("Admin Home Step 2 — demote command-center and compliance-desk", () => {
  it("keeps ADMIN_HOME_BOARD_TO on the scheduler", () => {
    assert.equal(ADMIN_HOME_BOARD_TO, "/dashboard/scheduler");
  });

  it("omits command-center and compliance-desk from ADMIN_NAV", () => {
    const shell = read("../routes/dashboard.tsx");
    const start = shell.indexOf("const ADMIN_NAV: NavItem[] = [");
    const end = shell.indexOf("];", start);
    assert.ok(start >= 0 && end > start, "ADMIN_NAV block");
    const block = shell.slice(start, end);
    assert.doesNotMatch(block, /command-center/);
    assert.doesNotMatch(block, /compliance-desk/);
    assert.match(block, /\/dashboard\/scheduler/);
  });

  it("keeps both desk routes mounted with matching hash anchors", () => {
    const cc = read("../routes/dashboard.command-center.tsx");
    const desk = read("../routes/dashboard.compliance-desk.tsx");
    assert.match(cc, /createFileRoute\("\/dashboard\/command-center"\)/);
    assert.match(desk, /createFileRoute\("\/dashboard\/compliance-desk"\)/);
    assert.match(cc, /id="obligations"/);
    assert.match(cc, /id="due"/);
    assert.match(cc, /id="recommendations"/);
    assert.match(desk, /id="compliance-desk"/);
  });

  it("points Home View all and greeting power links at the demoted desks", () => {
    const dash = read("../components/admin-home/admin-home-dashboard.tsx");
    assert.match(dash, /to="\/dashboard\/command-center"/);
    assert.match(dash, /hash="obligations"/);
    assert.match(dash, /hash="due"/);
    assert.match(dash, /hash="recommendations"/);
    assert.match(dash, /to="\/dashboard\/hub\/employees"/);
    assert.match(dash, /to="\/dashboard\/hub\/clients"/);
    assert.match(dash, /to="\/dashboard\/compliance-desk"/);
    assert.match(dash, /Command center/);
    assert.match(dash, /Compliance desk/);
    assert.match(dash, /fontSize: 12/);
    assert.match(dash, /PI_THEME\.c50/);
    assert.match(dash, /PI_THEME\.gold/);
    assert.match(dash, /AdminHomeWelcome/);
  });
});

describe("Admin Home Step 3 — welcome banner", () => {
  it("mounts AdminHomeWelcome above the greeting and passes welcomeFlag", () => {
    const dash = read("../components/admin-home/admin-home-dashboard.tsx");
    const index = read("../routes/dashboard.index.tsx");
    const welcome = read("../components/admin-home/admin-home-welcome.tsx");
    assert.match(index, /welcomeFlag=\{!!search\.welcome\}/);
    assert.match(dash, /<AdminHomeWelcome welcomeFlag=\{welcomeFlag\} \/>/);
    assert.match(dash, /<Suspense fallback=\{null\}>/);
    const greetingIdx = dash.indexOf("Good {greetingWord");
    const bannerIdx = dash.indexOf("<AdminHomeWelcome");
    assert.ok(bannerIdx >= 0 && greetingIdx > bannerIdx, "banner above greeting");
    assert.match(welcome, /lg:max-h-\[280px\]/);
    assert.match(welcome, /Skip — take me to my dashboard/);
    assert.match(welcome, /Go to my dashboard/);
    assert.match(welcome, /You&apos;re set up\. This banner will close itself\./);
    assert.match(welcome, /Invite staff/);
    assert.match(welcome, /Add a client/);
    assert.match(welcome, /Document a shift/);
    assert.match(welcome, /dismissAdminWelcome/);
    assert.doesNotMatch(welcome, /[\u{1F300}-\u{1FAFF}]/u);
  });

  it("counts attested EVV narratives plus daily logs for documentedShiftCount", () => {
    const hook = read("../components/admin-home/use-admin-home-welcome.ts");
    assert.match(hook, /evv_timesheets/);
    assert.match(hook, /attested_accurate\.eq\.true,attested_at\.not\.is\.null/);
    assert.match(hook, /daily_logs/);
    assert.match(hook, /documentedShiftCount: \(timesheetsRes\.count \?\? 0\) \+ \(logsRes\.count \?\? 0\)/);
  });

  it("drops localStorage welcome dismissal so nectar and Home share welcome_dismissed_at", () => {
    const panel = read("../components/onboarding/nectar-onboarding-panel.tsx");
    const hook = read("../hooks/use-onboarding-progress.tsx");
    const fn = read("./admin-home-welcome.functions.ts");
    assert.doesNotMatch(panel, /hive_onboarding_\$\{orgId\}_dismissed|lsKey\(orgId, "dismissed"\)/);
    assert.match(panel, /dismissAdminWelcome/);
    assert.match(hook, /welcome_dismissed_at/);
    assert.match(fn, /requireSupabaseAuth/);
    assert.match(fn, /requireOrgMembership/);
    assert.match(fn, /welcome_dismissed_at/);
    assert.match(fn, /"admin"/);
  });
});
