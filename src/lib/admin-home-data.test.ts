import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysYmd,
  denverYmd,
  greetingWord,
  INSTANCES_SELECT,
  isComplete,
  selectAdminHomeStaffStatus,
  type InstanceRow,
} from "./admin-home-data.ts";

function row(partial: Partial<InstanceRow> & Pick<InstanceRow, "id" | "due_at">): InstanceRow {
  return {
    obligation_id: "ob-1",
    client_id: null,
    company_obligations: { title: "CPR / First Aid", source_policy_section: "§1", scope: "staff" },
    company_obligation_instance_assignees: [
      { staff_id: "s1", staff_name: "Jordan Lee", client_id: null },
    ],
    company_obligation_completions: null,
    ...partial,
  };
}

describe("Admin Home derivation", () => {
  it("exports INSTANCES_SELECT with nested obligations / assignees / completions", () => {
    assert.match(INSTANCES_SELECT, /company_obligations!/);
    assert.match(INSTANCES_SELECT, /company_obligation_instance_assignees!/);
    assert.match(INSTANCES_SELECT, /company_obligation_completions!/);
  });

  it("isComplete is true only when a completion row exists", () => {
    assert.equal(isComplete(row({ id: "a", due_at: "2026-09-01T00:00:00.000Z" })), false);
    assert.equal(
      isComplete(
        row({
          id: "b",
          due_at: "2026-09-01T00:00:00.000Z",
          company_obligation_completions: {
            id: "c1",
            nectar_extracted_expires_date: null,
            nectar_extracted_cert_type: null,
          },
        }),
      ),
      true,
    );
  });

  it("addDaysYmd and denverYmd stay calendar-stable", () => {
    assert.equal(addDaysYmd("2026-09-01", 30), "2026-10-01");
    assert.equal(denverYmd(new Date("2026-09-01T18:00:00.000Z")), "2026-09-01");
  });

  it("greetingWord uses Denver hours", () => {
    assert.equal(greetingWord(new Date("2026-09-01T14:00:00.000Z")), "morning");
    assert.equal(greetingWord(new Date("2026-09-01T20:00:00.000Z")), "afternoon");
    assert.equal(greetingWord(new Date("2026-09-02T02:00:00.000Z")), "evening");
  });

  it("admin-home-staff-status selector counts overdue per staff", () => {
    const today = "2026-09-05";
    const staff = selectAdminHomeStaffStatus(
      [
        row({
          id: "over",
          due_at: "2026-08-20T00:00:00.000Z",
          company_obligation_instance_assignees: [
            { staff_id: "s1", staff_name: "Jordan Lee", client_id: null },
          ],
        }),
        row({
          id: "pend",
          due_at: "2026-09-10T00:00:00.000Z",
          obligation_id: "ob-2",
          company_obligation_instance_assignees: [
            { staff_id: "s1", staff_name: "Jordan Lee", client_id: null },
            { staff_id: "s2", staff_name: "Dana Admin", client_id: null },
          ],
        }),
      ],
      today,
    );
    const jordan = staff.find((s) => s.id === "s1");
    const dana = staff.find((s) => s.id === "s2");
    assert.equal(jordan?.overdue, 1);
    assert.equal(jordan?.pending, 1);
    assert.equal(dana?.overdue, 0);
    assert.equal(dana?.pending, 1);
  });
});
