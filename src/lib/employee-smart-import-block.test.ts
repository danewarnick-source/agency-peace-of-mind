import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  employeeSmartImportRedirect,
  shouldBlockEmployeeSmartImport,
} from "./employee-smart-import-block.ts";

describe("employee Smart Import hard block", () => {
  it("sends employee mode to Employees upload, not Nectar review", () => {
    assert.equal(shouldBlockEmployeeSmartImport("employee"), true);
    assert.equal(shouldBlockEmployeeSmartImport("client"), false);
    assert.equal(shouldBlockEmployeeSmartImport("timesheets"), false);
    assert.equal(shouldBlockEmployeeSmartImport(undefined), false);
    const dest = employeeSmartImportRedirect();
    assert.equal(dest.to, "/dashboard/employees");
    assert.equal(dest.search.upload, true);
    assert.equal(dest.replace, true);
  });

  it("guards the Smart Import landing and review/done deep links", () => {
    const landing = readFileSync(new URL("../routes/dashboard.smart-import.index.tsx", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../routes/dashboard.smart-import.tsx", import.meta.url), "utf8");
    const review = readFileSync(new URL("../routes/dashboard.smart-import.$jobId.review.tsx", import.meta.url), "utf8");
    const done = readFileSync(new URL("../routes/dashboard.smart-import.$jobId.done.tsx", import.meta.url), "utf8");
    const employees = readFileSync(new URL("../routes/dashboard.employees.index.tsx", import.meta.url), "utf8");

    assert.match(landing, /beforeLoad/);
    assert.match(landing, /shouldBlockEmployeeSmartImport/);
    assert.match(landing, /employeeSmartImportRedirect/);
    assert.match(layout, /shouldBlockEmployeeSmartImport/);
    assert.doesNotMatch(landing, /m === "employee" \? "Employee"/);

    assert.match(review, /employeeSmartImportRedirect/);
    assert.match(review, /job\.data\.job\.mode === "employee"/);
    assert.match(done, /employeeSmartImportRedirect/);
    assert.match(done, /q\.data\.job\.mode === "employee"/);

    assert.match(employees, /upload/);
    assert.match(employees, /EmployeeRosterUploadWizard/);
    assert.doesNotMatch(employees, /Smart Import/);
  });
});
