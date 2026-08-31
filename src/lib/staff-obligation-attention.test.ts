import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countStaffObligationsNeedingAttention,
  type StaffObligationAttentionInstance,
} from "./staff-obligation-attention.ts";

function inst(
  overrides: Partial<StaffObligationAttentionInstance> &
    Pick<StaffObligationAttentionInstance, "id">,
): StaffObligationAttentionInstance {
  return {
    status: "pending",
    client_id: null,
    obligation: { title: "CPR", evidence_type: "attestation", linked_form_id: null },
    ...overrides,
    obligation: {
      title: "CPR",
      evidence_type: "attestation",
      linked_form_id: null,
      ...overrides.obligation,
    },
  };
}

describe("countStaffObligationsNeedingAttention", () => {
  it("matches My Obligations All (N): pending + overdue + failed review", () => {
    const n = countStaffObligationsNeedingAttention(
      [
        inst({ id: "a", status: "pending" }),
        inst({ id: "b", status: "overdue" }),
        inst({ id: "c", status: "pending" }),
        inst({ id: "d", status: "completed" }),
        inst({ id: "e", status: "waived" }),
      ],
      [
        { instance_id: "c", nectar_validation_status: "failed" },
        { instance_id: "d", nectar_validation_status: "passed" },
      ],
      null,
    );
    assert.equal(n, 3);
  });

  it("excludes unlinked form duties staff cannot act on", () => {
    const n = countStaffObligationsNeedingAttention(
      [
        inst({
          id: "form",
          obligation: { title: "Incident Report", evidence_type: "form", linked_form_id: null },
        }),
      ],
      [],
      null,
    );
    assert.equal(n, 0);
  });

  it("counts published per-client trainings not covered by an instance", () => {
    const n = countStaffObligationsNeedingAttention([], [], {
      items: [
        {
          clientId: "c1",
          trainings: [
            { type: "person_specific", setupStatus: "published", completionStatus: "due" },
            { type: "support_strategies", setupStatus: "published", completionStatus: "completed" },
            { type: "person_centered", setupStatus: "draft", completionStatus: "due" },
          ],
        },
      ],
    });
    assert.equal(n, 1);
  });

  it("does not double-count a training already covered by an instance", () => {
    const n = countStaffObligationsNeedingAttention(
      [
        inst({
          id: "cst",
          client_id: "c1",
          obligation: {
            title: "Client-Specific Training — Ada",
            evidence_type: "form",
            linked_form_id: "11111111-1111-4111-8111-111111111111",
          },
        }),
      ],
      [],
      {
        items: [
          {
            clientId: "c1",
            trainings: [
              { type: "person_specific", setupStatus: "published", completionStatus: "due" },
            ],
          },
        ],
      },
    );
    assert.equal(n, 1);
  });

  it("treats a completed client training as done even if the instance is still open", () => {
    const n = countStaffObligationsNeedingAttention(
      [
        inst({
          id: "cst",
          status: "pending",
          client_id: "c1",
          obligation: {
            title: "Client-Specific Training — Ada",
            evidence_type: "form",
            linked_form_id: "11111111-1111-4111-8111-111111111111",
          },
        }),
      ],
      [],
      {
        items: [
          {
            clientId: "c1",
            trainings: [
              { type: "person_specific", setupStatus: "published", completionStatus: "completed" },
            ],
          },
        ],
      },
    );
    assert.equal(n, 0);
  });
});
