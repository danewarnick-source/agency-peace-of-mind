import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  hasValidObligationEvidence,
  dueLabel,
  liveObligationTitle,
  obligationFileStatus,
  obligationFileStatusLabel,
} from "./staff-obligation-files.ts";

const now = new Date("2026-09-10T12:00:00.000Z");

describe("obligationFileStatus", () => {
  it("labels completed and waived as On file", () => {
    assert.equal(
      obligationFileStatus({
        instanceStatus: "completed",
        dueAt: "2026-09-01T00:00:00.000Z",
        hasValidEvidence: true,
        now,
      }),
      "on_file",
    );
    assert.equal(
      obligationFileStatus({
        instanceStatus: "waived",
        dueAt: "2026-08-01T00:00:00.000Z",
        hasValidEvidence: true,
        now,
      }),
      "on_file",
    );
    assert.equal(obligationFileStatusLabel("on_file"), "On file");
  });

  it("labels an open duty due within 7 days as Due soon", () => {
    assert.equal(
      obligationFileStatus({
        instanceStatus: "pending",
        dueAt: "2026-09-14T12:00:00.000Z",
        hasValidEvidence: false,
        now,
      }),
      "due_soon",
    );
    assert.equal(obligationFileStatusLabel("due_soon"), "Due soon");
  });

  it("labels overdue and far-future open duties as Missing — never Have", () => {
    assert.equal(
      obligationFileStatus({
        instanceStatus: "overdue",
        dueAt: "2026-09-01T00:00:00.000Z",
        hasValidEvidence: false,
        now,
      }),
      "missing",
    );
    assert.equal(
      obligationFileStatus({
        instanceStatus: "pending",
        dueAt: "2026-12-01T00:00:00.000Z",
        hasValidEvidence: false,
        now,
      }),
      "missing",
    );
    assert.equal(obligationFileStatusLabel("missing"), "Missing");
    assert.notEqual(obligationFileStatusLabel("on_file"), "Have");
  });
});

describe("hasValidObligationEvidence", () => {
  it("rejects a Nectar-failed completion", () => {
    assert.equal(
      hasValidObligationEvidence({
        instanceStatus: "pending",
        hasCompletion: true,
        nectarValidationStatus: "failed",
      }),
      false,
    );
  });

  it("accepts a completion that passed or was not scanned", () => {
    assert.equal(
      hasValidObligationEvidence({
        instanceStatus: "pending",
        hasCompletion: true,
        nectarValidationStatus: "passed",
      }),
      true,
    );
    assert.equal(
      hasValidObligationEvidence({
        instanceStatus: "completed",
        hasCompletion: false,
        nectarValidationStatus: null,
      }),
      true,
    );
  });
});

describe("liveObligationTitle", () => {
  it("uses the live obligation name and substitutes client name", () => {
    assert.equal(liveObligationTitle("CPR certification", "staff", "JANE DOE"), "CPR certification");
    assert.equal(
      liveObligationTitle("Client-Specific Training — [Client Name]", "staff_per_client", "JANE DOE"),
      "Client-Specific Training — Jane Doe",
    );
  });
});

describe("dueLabel", () => {
  it("labels past dues as Missing, not Overdue", () => {
    const label = dueLabel("2026-09-01T00:00:00.000Z", now);
    assert.equal(label.overdue, true);
    assert.match(label.text, /Missing/);
    assert.doesNotMatch(label.text, /Overdue/);
  });
});

describe("Admin employee profile lock", () => {
  it("keeps only the four tabs and drops junk surfaces", () => {
    const src = readFileSync(
      new URL("../routes/dashboard.employees.$staffId.tsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /Personnel file/);
    assert.match(src, /value="profile"/);
    assert.match(src, /value="personnel"/);
    assert.match(src, /value="permissions"/);
    assert.match(src, /value="activity"/);
    assert.doesNotMatch(src, /Obligations & files/);
    assert.doesNotMatch(src, /Document Vault/);
    assert.doesNotMatch(src, /Staff record/);
    assert.doesNotMatch(src, /Suggested CE/);
    assert.doesNotMatch(src, /Custom attributes/);
    assert.doesNotMatch(src, /Training requirement settings/);
    assert.doesNotMatch(src, /Behavior-related training/);
    assert.doesNotMatch(src, /StaffDeadlinesList/);
    assert.doesNotMatch(src, /EmployeeDocumentsCard/);
    assert.doesNotMatch(src, /Have/);
    assert.doesNotMatch(src, /CustomAttributesSection/);
    assert.doesNotMatch(src, /LifecyclePanel/);
  });
});

describe("Staff personnel file page lock", () => {
  it("renames the staff surface and keeps 30-day course or upload on one card", () => {
    const src = readFileSync(
      new URL("../routes/dashboard.my-obligations.tsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /title="Personnel file"/);
    assert.match(src, /Or upload a certificate/);
    assert.match(src, /A certificate upload clears this same 30-day card/);
    assert.doesNotMatch(src, /title="My Obligations"/);
    assert.doesNotMatch(src, /My Compliance/);
  });

  it("does not assign an all-staff driving_record baseline", () => {
    const src = readFileSync(
      new URL("./staff-training-requirements.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(src, /key: "driving_record"/);
  });
});
