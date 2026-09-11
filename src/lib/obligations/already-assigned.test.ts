import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  automationHeartbeatFrom,
  buildAlreadyAssigned,
  emptyAlreadyAssigned,
  formatAlreadyAssigned,
  formatAutomationLine,
  isRenewalClock,
} from "./already-assigned.ts";

const NOW = new Date("2026-09-11T18:00:00.000Z");

describe("Already assigned strip", () => {
  it("counts assigned renewals in the 30-day window and skips Home decisions", () => {
    const strip = buildAlreadyAssigned(
      {
        now: NOW,
        obligations: [
          { id: "ob-cpr", title: "CPR/First Aid Certification — Renewal", key: "cpr_first_aid_renewal" },
          { id: "ob-bg", title: "Background Screening — Annual", key: "background_screening_annual" },
          { id: "ob-30", title: "30-Day New Hire Orientation Training", key: "orientation_30_day" },
        ],
        instances: [
          {
            id: "inst-1",
            obligation_id: "ob-cpr",
            status: "pending",
            due_at: "2026-10-02T00:00:00.000Z",
            assignee_staff_id: "staff-1",
          },
          {
            id: "inst-2",
            obligation_id: "ob-cpr",
            status: "pending",
            due_at: "2026-10-05T00:00:00.000Z",
            assignee_staff_id: "staff-2",
          },
          {
            id: "inst-decision",
            obligation_id: "ob-cpr",
            status: "overdue",
            due_at: "2026-09-01T00:00:00.000Z",
            assignee_staff_id: "staff-3",
          },
          {
            id: "inst-30",
            obligation_id: "ob-30",
            status: "pending",
            due_at: "2026-09-20T00:00:00.000Z",
            assignee_staff_id: "staff-4",
          },
        ],
      },
      new Set(["inst-decision"]),
    );
    assert.equal(strip.renewalCount, 2);
    assert.equal(strip.staffNotified, true);
    assert.equal(strip.dueInDays, 30);
    assert.equal(formatAlreadyAssigned(strip), "2 renewals · Staff notified · Due in 30 days");
    assert.equal(formatAlreadyAssigned(emptyAlreadyAssigned()), null);
  });

  it("treats cert-expiration and hire-anniversary clocks as renewals", () => {
    assert.equal(
      isRenewalClock({ id: "1", title: "CPR/First Aid Certification — Renewal", key: "cpr_first_aid_renewal" }),
      true,
    );
    assert.equal(
      isRenewalClock({ id: "2", title: "30-Day New Hire Orientation Training", key: "orientation_30_day" }),
      false,
    );
  });
});

describe("Automation heartbeat", () => {
  it("stays honest when no cron heartbeat exists", () => {
    const unknown = automationHeartbeatFrom({});
    assert.equal(unknown.status, "unknown");
    assert.equal(formatAutomationLine(unknown), "Automation: Last successful check unknown");
    assert.doesNotMatch(formatAutomationLine(unknown), /8:00 AM/);
    const ok = automationHeartbeatFrom({ lastSuccessfulCheckAt: "2026-09-11T14:00:00.000Z" });
    assert.equal(ok.status, "ok");
    assert.match(formatAutomationLine(ok), /Last successful check/);
    const failed = automationHeartbeatFrom({ lastFailedAt: "2026-09-11T14:00:00.000Z" });
    assert.equal(failed.status, "failed");
    assert.match(formatAutomationLine(failed), /failed/);
  });

  it("does not invent a heartbeat in This Week I/O", () => {
    const src = readFileSync(new URL("./this-week.functions.ts", import.meta.url), "utf8");
    assert.match(src, /emptyAutomationHeartbeat|automationHeartbeatFrom/);
    assert.doesNotMatch(src, /today 8:00 AM/);
    const cards = readFileSync(
      new URL("../../components/compliance/this-week-plan-cards.tsx", import.meta.url),
      "utf8",
    );
    assert.match(cards, /already-assigned/);
    assert.match(cards, /automation-line/);
  });
});
