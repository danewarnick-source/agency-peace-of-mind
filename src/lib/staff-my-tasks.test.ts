import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  STAFF_TASK_ACTION_LABEL,
  STAFF_TASKS_FOOTER,
  buildStaffTask,
  staffTaskAction,
  staffTaskWhyRequired,
} from "./staff-my-tasks.ts";

const NOW = new Date("2026-09-11T18:00:00.000Z");

describe("staff My tasks engine", () => {
  it("maps course / sign / upload / form / fix to one locked action label", () => {
    assert.equal(
      staffTaskAction({
        instanceId: "i1",
        title: "30-Day New Hire Orientation Training",
        evidenceType: "attestation",
        dueAt: "2026-09-20T00:00:00.000Z",
        instanceStatus: "pending",
        courseProgress: { completed: 0, total: 8 },
      }),
      "take_training",
    );
    assert.equal(
      staffTaskAction({
        instanceId: "i1",
        title: "30-Day New Hire Orientation Training",
        evidenceType: "attestation",
        dueAt: "2026-09-20T00:00:00.000Z",
        instanceStatus: "pending",
        courseProgress: { completed: 6, total: 8 },
      }),
      "continue_training",
    );
    assert.equal(
      staffTaskAction({
        instanceId: "i2",
        title: "Transportation Policy",
        evidenceType: "attestation",
        dueAt: "2026-09-20T00:00:00.000Z",
        instanceStatus: "pending",
      }),
      "read_and_sign",
    );
    assert.equal(
      staffTaskAction({
        instanceId: "i3",
        title: "CPR/First Aid Certification — Renewal",
        evidenceType: "upload",
        dueAt: "2026-10-02T00:00:00.000Z",
        instanceStatus: "pending",
      }),
      "upload_certificate",
    );
    assert.equal(
      staffTaskAction({
        instanceId: "i4",
        title: "Conflict of Interest Declaration",
        evidenceType: "form",
        dueAt: "2026-09-20T00:00:00.000Z",
        instanceStatus: "pending",
      }),
      "complete_form",
    );
    assert.equal(
      staffTaskAction({
        instanceId: "i5",
        title: "CPR/First Aid Certification — Renewal",
        evidenceType: "upload",
        dueAt: "2026-09-20T00:00:00.000Z",
        instanceStatus: "pending",
        nectarValidationStatus: "failed",
      }),
      "fix_submission",
    );
    assert.equal(STAFF_TASK_ACTION_LABEL.take_training, "Take training");
    assert.equal(STAFF_TASK_ACTION_LABEL.continue_training, "Continue training");
    assert.equal(STAFF_TASK_ACTION_LABEL.read_and_sign, "Read and sign");
    assert.equal(STAFF_TASK_ACTION_LABEL.upload_certificate, "Upload certificate");
    assert.equal(STAFF_TASK_ACTION_LABEL.complete_form, "Complete form");
    assert.equal(STAFF_TASK_ACTION_LABEL.fix_submission, "Fix submission");
  });

  it("shows native course progress and pending review without inventing Why copy", () => {
    const task = buildStaffTask({
      instanceId: "i1",
      title: "30-Day New Hire Orientation Training",
      source: "sow",
      evidenceType: "attestation",
      dueAt: "2026-09-20T00:00:00.000Z",
      instanceStatus: "pending",
      courseProgress: { completed: 6, total: 8 },
      now: NOW,
    });
    assert.equal(task.progressLabel, "6 of 8 topics passed");
    assert.equal(task.whyRequired, "Required on your staff file by the state contract.");
    assert.equal(task.pendingReview, false);
    assert.match(task.dueText, /Due in/);

    const pending = buildStaffTask({
      instanceId: "i2",
      title: "CPR/First Aid Certification — Renewal",
      evidenceType: "upload",
      dueAt: "2026-09-20T00:00:00.000Z",
      instanceStatus: "pending",
      nectarValidationStatus: "failed",
      now: NOW,
    });
    assert.equal(pending.pendingReview, true);
    assert.equal(pending.action, "fix_submission");

    const awaiting = buildStaffTask({
      instanceId: "i3",
      title: "CPR/First Aid Certification — Renewal",
      evidenceType: "upload",
      dueAt: "2026-09-20T00:00:00.000Z",
      instanceStatus: "pending",
      nectarValidationStatus: "needs_review",
      now: NOW,
    });
    assert.equal(awaiting.pendingReview, true);
    assert.equal(awaiting.action, "upload_certificate");

    const overridden = buildStaffTask({
      instanceId: "i4",
      title: "CPR/First Aid Certification — Renewal",
      evidenceType: "upload",
      dueAt: "2026-09-20T00:00:00.000Z",
      instanceStatus: "overdue",
      overridden: true,
      overrideUntil: "Sep 18, 2026",
      now: NOW,
    });
    assert.equal(overridden.overridden, true);
    assert.equal(overridden.overrideUntil, "Sep 18, 2026");
    assert.equal(overridden.action, "upload_certificate");
  });

  it("prefers policy section then description for non-SOW why", () => {
    assert.equal(
      staffTaskWhyRequired({ source: "provider", sourcePolicySection: "Agency handbook §4" }),
      "Agency handbook §4",
    );
    assert.equal(
      staffTaskWhyRequired({ source: "provider", description: "Host home visit attestation." }),
      "Host home visit attestation.",
    );
  });
});

describe("Staff My tasks surface lock", () => {
  it("keeps one queue on staff home and Staff file, not a second table family", () => {
    const page = readFileSync(
      new URL("../routes/dashboard.my-obligations.tsx", import.meta.url),
      "utf8",
    );
    const home = readFileSync(new URL("../routes/dashboard.index.tsx", import.meta.url), "utf8");
    const homeTasks = readFileSync(
      new URL("../components/staff-tasks/staff-home-my-tasks.tsx", import.meta.url),
      "utf8",
    );
    const nav = readFileSync(new URL("../routes/dashboard.tsx", import.meta.url), "utf8");
    assert.match(page, /MyTasksQueue/);
    assert.match(page, /My tasks/);
    assert.match(page, /STAFF_TASKS_FOOTER/);
    assert.match(page, /title: "Staff file/);
    assert.match(home, /StaffHomeMyTasks/);
    assert.match(page, /overridden/);
    assert.match(homeTasks, /overridden/);
    assert.match(nav, /to: "\/dashboard\/my-obligations", label: "Staff file"/);
    assert.doesNotMatch(page, /from\("staff_tasks"\)/);
    assert.doesNotMatch(page, /from\("my_tasks"\)/);
  });
});
