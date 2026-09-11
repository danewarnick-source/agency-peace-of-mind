import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  hasValidObligationEvidence,
  isAwaitingEvidenceReview,
  dueLabel,
  liveObligationTitle,
  missingPersonnelCsv,
  obligationFileStatus,
  obligationFileStatusLabel,
  staffFileCycleKind,
  statusForObligationInstance,
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

  it("does not treat a pending upload as accepted", () => {
    assert.equal(
      hasValidObligationEvidence({
        instanceStatus: "pending",
        hasCompletion: true,
        nectarValidationStatus: "passed",
      }),
      false,
    );
    assert.equal(
      hasValidObligationEvidence({
        instanceStatus: "pending",
        hasCompletion: true,
        nectarValidationStatus: "needs_review",
      }),
      false,
    );
    assert.equal(
      hasValidObligationEvidence({
        instanceStatus: "completed",
        hasCompletion: false,
        nectarValidationStatus: null,
      }),
      true,
    );
    assert.equal(
      isAwaitingEvidenceReview({
        instanceStatus: "pending",
        nectarValidationStatus: "needs_review",
      }),
      true,
    );
  });

  it("keeps a completed cycle as previous when a renewal instance is open", () => {
    const peers = [
      {
        instanceId: "old",
        instanceStatus: "completed" as const,
        dueAt: "2026-01-01T00:00:00.000Z",
      },
      { instanceId: "next", instanceStatus: "pending" as const, dueAt: "2027-01-01T00:00:00.000Z" },
    ];
    assert.equal(
      staffFileCycleKind({
        instanceId: "old",
        instanceStatus: "completed",
        dueAt: "2026-01-01T00:00:00.000Z",
        peers,
      }),
      "previous",
    );
    assert.equal(
      staffFileCycleKind({
        instanceId: "next",
        instanceStatus: "pending",
        dueAt: "2027-01-01T00:00:00.000Z",
        peers,
      }),
      "current",
    );
  });
});

describe("liveObligationTitle", () => {
  it("uses the live obligation name and substitutes client name", () => {
    assert.equal(
      liveObligationTitle("CPR certification", "staff", "JANE DOE"),
      "CPR certification",
    );
    assert.equal(
      liveObligationTitle(
        "Client-Specific Training — [Client Name]",
        "staff_per_client",
        "JANE DOE",
      ),
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
  it("keeps Profile / Staff file / Activity and drops junk surfaces", () => {
    const src = readFileSync(
      new URL("../routes/dashboard.employees.$staffId.tsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /Staff file/);
    assert.match(src, /s\.tab === "staff"/);
    assert.doesNotMatch(src, /Personnel file/);
    assert.match(src, /value="profile"/);
    assert.match(src, /value="personnel"/);
    assert.match(src, /value="activity"/);
    assert.match(src, /StaffProfilePanel/);
    assert.doesNotMatch(src, /<TabsTrigger value="permissions">/);
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

  it("keeps Department off the edit Profile person block", () => {
    const identity = readFileSync(
      new URL("../components/employees/staff-profile-identity.tsx", import.meta.url),
      "utf8",
    );
    const panel = readFileSync(
      new URL("../components/employees/staff-profile-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(identity, /Employee ID/);
    assert.match(identity, /Job title/);
    assert.match(identity, /Base role/);
    assert.doesNotMatch(identity, /Department/);
    assert.match(panel, /Admin scope/);
    assert.match(panel, /Edit profile/);
    assert.match(panel, /Save profile/);
  });
});

describe("statusForObligationInstance", () => {
  it("matches the per-person On file / Due soon / Missing engine", () => {
    assert.equal(
      statusForObligationInstance({
        instanceStatus: "completed",
        dueAt: "2026-09-01T00:00:00.000Z",
        now,
      }),
      "on_file",
    );
    assert.equal(
      statusForObligationInstance({
        instanceStatus: "pending",
        dueAt: "2026-09-14T12:00:00.000Z",
        now,
      }),
      "due_soon",
    );
    assert.equal(
      statusForObligationInstance({
        instanceStatus: "pending",
        dueAt: "2026-12-01T00:00:00.000Z",
        completion: { nectar_validation_status: "failed" },
        now,
      }),
      "missing",
    );
  });
});

describe("missingPersonnelCsv", () => {
  it("exports missing items without inventing Have", () => {
    const csv = missingPersonnelCsv([
      {
        full_name: "Jordan Lee",
        role: "employee",
        job_title: "DSP",
        service_codes: ["HHS", "DSI"],
        missing: 2,
        due_soon: 1,
        on_file: 4,
        missing_items: [
          { title: "CPR certification", due_at: "2026-08-01T00:00:00.000Z" },
          { title: "Code of Conduct", due_at: "2026-09-01T00:00:00.000Z" },
        ],
      },
    ]);
    assert.match(csv, /Jordan Lee/);
    assert.match(csv, /HHS DSI/);
    assert.match(csv, /CPR certification; Code of Conduct/);
    assert.doesNotMatch(csv, /Have/);
  });
});

describe("Staff staff-file page lock", () => {
  it("renames the staff surface and keeps 30-day course or upload on one card", () => {
    const src = readFileSync(
      new URL("../routes/dashboard.my-obligations.tsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /title: "Staff file/);
    assert.match(src, /My tasks/);
    assert.match(src, /Or upload a certificate/);
    assert.match(src, /A certificate upload clears this same 30-day card/);
    assert.match(src, /A certificate upload clears this same hire-level PCT card/);
    assert.doesNotMatch(src, /hasCompletion && !failedValidation/);
    assert.match(src, /Uploaded is not accepted/);
    assert.doesNotMatch(src, /title="My Obligations"/);
    assert.doesNotMatch(src, /My Compliance/);
  });

  it("does not assign an all-staff driving_record baseline", () => {
    const src = readFileSync(new URL("./staff-training-requirements.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /key: "driving_record"/);
  });
});

describe("Org-wide Staff file lock", () => {
  it("folds Staff file under Admin Compliance and keeps the legacy URL", () => {
    const nav = readFileSync(new URL("../routes/dashboard.tsx", import.meta.url), "utf8");
    assert.match(nav, /to: "\/dashboard\/compliance", label: "Compliance"/);
    assert.doesNotMatch(nav, /label: "State Audit"/);
    assert.doesNotMatch(nav, /to: "\/dashboard\/personnel-file", label: "/);
    assert.doesNotMatch(nav, /label: "Personnel file"/);
    const route = readFileSync(
      new URL("../routes/dashboard.personnel-file.tsx", import.meta.url),
      "utf8",
    );
    assert.match(route, /createFileRoute\("\/dashboard\/personnel-file"\)/);
    assert.match(route, /\/dashboard\/compliance/);
    assert.match(route, /tab: "staff"/);
    assert.match(route, /redirect/);
    const panel = readFileSync(
      new URL("../components/compliance/staff-file-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(panel, /Staff file/);
    assert.match(panel, /OrgPersonnelFileMatrix/);
    assert.doesNotMatch(panel, /EVV/);
    assert.doesNotMatch(panel, /HRC/);
  });

  it("deletes the leftover open-every-profile HR matrix", () => {
    const hrAdmin = readFileSync(
      new URL("../routes/dashboard.hr-admin.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(hrAdmin, /HrComplianceMatrix/);
    assert.doesNotMatch(hrAdmin, /getHrAdminRollup/);
    assert.match(hrAdmin, /to="\/dashboard\/compliance"/);
    const matrixFns = readFileSync(new URL("./hr-staff.functions.ts", import.meta.url), "utf8");
    assert.doesNotMatch(matrixFns, /getHrComplianceMatrix/);
    assert.doesNotMatch(matrixFns, /getHrAdminRollup/);
    assert.doesNotMatch(matrixFns, /getStaffChecklist/);
  });
});
