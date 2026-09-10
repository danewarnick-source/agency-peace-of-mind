import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildEmployeeRosterTemplateCsv,
  isClientOnlyRosterHeader,
  mapRawRosterRow,
  normalizeEmployeeRosterHeader,
  normalizeHireDate,
  parseEmployeeRosterCsv,
  parseEmployeeRosterRole,
  toInviteRole,
  classifyRosterRowAction,
  validateEmployeeRosterRows,
} from "./employee-roster-upload.ts";

describe("employee roster template", () => {
  it("uses the fixed Dane columns and never client-record fields", () => {
    const csv = buildEmployeeRosterTemplateCsv();
    assert.match(csv, /first_name/);
    assert.match(csv, /last_name/);
    assert.match(csv, /email/);
    assert.match(csv, /phone/);
    assert.match(csv, /role/);
    assert.match(csv, /title/);
    assert.match(csv, /hire_date/);
    assert.match(csv, /username/);
    assert.doesNotMatch(csv, /guardian/i);
    assert.doesNotMatch(csv, /pcsp/i);
    assert.doesNotMatch(csv, /medicaid/i);
    assert.doesNotMatch(csv, /medication/i);
    assert.doesNotMatch(csv, /billing/i);
    assert.doesNotMatch(csv, /staff_type/);
  });

  it("maps human headers and ignores client-only columns", () => {
    assert.equal(normalizeEmployeeRosterHeader("First Name"), "first_name");
    assert.equal(normalizeEmployeeRosterHeader("Hire date"), "hire_date");
    assert.equal(normalizeEmployeeRosterHeader("Job Title"), "title");
    assert.equal(isClientOnlyRosterHeader("guardian_name"), true);
    assert.equal(isClientOnlyRosterHeader("medicaid_id"), true);
    assert.equal(isClientOnlyRosterHeader("PCSP goals"), true);
    assert.equal(isClientOnlyRosterHeader("billing_code"), true);
    assert.equal(parseEmployeeRosterRole("Supervisor"), "manager");
    assert.equal(parseEmployeeRosterRole(""), "employee");
    assert.equal(parseEmployeeRosterRole("wizard"), null);
    assert.equal(toInviteRole("admin"), "admin");
    assert.equal(toInviteRole("program_manager"), "manager");
    assert.equal(toInviteRole("committee_member"), "employee");
    assert.equal(normalizeHireDate("7/1/2026"), "2026-07-01");
  });

  it("defaults username to email and flags missing required fields", () => {
    const { rows, ignoredColumns } = parseEmployeeRosterCsv(
      "First Name,Last Name,Email,Phone,Role,guardian_name,medicaid_id\nJane,Doe,jane@agency.org,555-0100,employee,Mom,12345\n",
    );
    assert.deepEqual(ignoredColumns.sort(), ["guardian_name", "medicaid_id"]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].username, "jane@agency.org");
    assert.equal(rows[0].username_provided, false);
    assert.equal(rows[0].role, "employee");
    const ok = validateEmployeeRosterRows(rows);
    assert.equal(ok.size, 0);

    const mapped = mapRawRosterRow(
      { "first name": "", last_name: "Doe", email: "bad", phone: "", role: "wizard" },
      ["first name", "last_name", "email", "phone", "role"],
    );
    const issues = validateEmployeeRosterRows([mapped]);
    const fields = (issues.get(mapped.id) ?? []).map((i) => i.field);
    assert.ok(fields.includes("first_name"));
    assert.ok(fields.includes("email"));
    assert.ok(fields.includes("phone"));
    assert.ok(fields.includes("role"));
  });

  it("keeps the upload wizard on the invite rail and off Smart Import", () => {
    const src = readFileSync(new URL("../components/employees/employee-roster-upload-wizard.tsx", import.meta.url), "utf8");
    assert.match(src, /createInvitation/);
    assert.match(src, /interpretInviteSendResult/);
    assert.match(src, /invite yet/);
    assert.match(src, /add_new/);
    assert.match(src, /add_and_update/);
    assert.match(src, /update_only/);
    assert.doesNotMatch(src, /inviteStaffMembers\(/);
    assert.doesNotMatch(src, /smart-import/);
    assert.doesNotMatch(src, /guardian/i);
    assert.doesNotMatch(src, /pcsp/i);
    assert.doesNotMatch(src, /Hive Platform/);
  });

  it("classifies Connecteam-style add / update / skip by email", () => {
    const existing = ["jake@agency.org"];
    assert.equal(classifyRosterRowAction("new@agency.org", existing, "add_new"), "create");
    assert.equal(classifyRosterRowAction("Jake@agency.org", existing, "add_new"), "skip");
    assert.equal(classifyRosterRowAction("Jake@agency.org", existing, "add_and_update"), "update");
    assert.equal(classifyRosterRowAction("new@agency.org", existing, "add_and_update"), "create");
    assert.equal(classifyRosterRowAction("Jake@agency.org", existing, "update_only"), "update");
    assert.equal(classifyRosterRowAction("new@agency.org", existing, "update_only"), "skip");
  });

  it("flags duplicate emails in the file", () => {
    const { rows } = parseEmployeeRosterCsv(
      "first_name,last_name,email,phone\nA,One,a@agency.org,555-1\nB,Two,A@agency.org,555-2\n",
    );
    const issues = validateEmployeeRosterRows(rows);
    assert.equal(issues.size, 2);
  });
});
