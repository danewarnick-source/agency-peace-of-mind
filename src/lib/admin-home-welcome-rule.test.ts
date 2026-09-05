import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldShowWelcome, welcomeSetupProgress } from "./admin-home-welcome-rule.ts";

const NOW = new Date("2026-09-05T12:00:00.000Z");

function base(over: Partial<Parameters<typeof shouldShowWelcome>[0]> = {}) {
  return {
    orgCreatedAt: "2026-09-04T12:00:00.000Z",
    now: NOW,
    welcomeDismissedAt: null as string | null,
    memberCount: 2,
    clientCount: 1,
    documentedShiftCount: 1,
    welcomeFlag: false,
    ...over,
  };
}

describe("shouldShowWelcome", () => {
  it("day 1 → true", () => {
    assert.equal(shouldShowWelcome(base()), true);
  });

  it("day 10 all three done → false", () => {
    assert.equal(
      shouldShowWelcome(
        base({
          orgCreatedAt: "2026-08-26T12:00:00.000Z",
        }),
      ),
      false,
    );
  });

  it("day 10 zero clients → true", () => {
    assert.equal(
      shouldShowWelcome(
        base({
          orgCreatedAt: "2026-08-26T12:00:00.000Z",
          clientCount: 0,
        }),
      ),
      true,
    );
  });

  it("dismissed → false regardless", () => {
    assert.equal(
      shouldShowWelcome(
        base({
          welcomeDismissedAt: "2026-09-05T00:00:00.000Z",
          memberCount: 0,
          clientCount: 0,
          documentedShiftCount: 0,
          welcomeFlag: true,
        }),
      ),
      false,
    );
  });

  it("welcomeFlag forces the banner when setup is complete and the org is old", () => {
    assert.equal(
      shouldShowWelcome(
        base({
          orgCreatedAt: "2026-08-26T12:00:00.000Z",
          welcomeFlag: true,
        }),
      ),
      true,
    );
  });
});

describe("welcomeSetupProgress", () => {
  it("treats invite as done at two members, client at one, shift at one", () => {
    assert.deepEqual(welcomeSetupProgress({ memberCount: 1, clientCount: 0, documentedShiftCount: 0 }), {
      inviteStaff: false,
      addClient: false,
      documentShift: false,
      allDone: false,
    });
    assert.deepEqual(welcomeSetupProgress({ memberCount: 2, clientCount: 1, documentedShiftCount: 1 }), {
      inviteStaff: true,
      addClient: true,
      documentShift: true,
      allDone: true,
    });
  });
});
