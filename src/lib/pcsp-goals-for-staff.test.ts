import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  flattenPcspGoalRows,
  mergeClientGoalSources,
  selectGoalsForStaffClockOut,
} from "./pcsp-goals-for-staff.ts";

const visible = () => true;
const hideSecond = (id: string) => id !== "g2";

describe("flattenPcspGoalRows", () => {
  it("keeps non-empty strings from clients.pcsp_goals", () => {
    assert.deepEqual(
      flattenPcspGoalRows(["  Stay safe at home  ", "", "Use communication board"]),
      [
        {
          id: "pcsp-flat-0",
          goal: "Stay safe at home",
          supports: "",
          details: "",
          job_codes: [],
        },
        {
          id: "pcsp-flat-2",
          goal: "Use communication board",
          supports: "",
          details: "",
          job_codes: [],
        },
      ],
    );
  });

  it("does not invent goals from a missing or empty list", () => {
    assert.deepEqual(flattenPcspGoalRows(null), []);
    assert.deepEqual(flattenPcspGoalRows([]), []);
  });
});

describe("mergeClientGoalSources", () => {
  it("prefers structured CST goals when they have text", () => {
    const structured = [
      { id: "g1", goal: "Community outing", supports: "Go weekly", details: "", job_codes: [] },
    ];
    assert.deepEqual(mergeClientGoalSources(structured, ["Flat leftover"]), structured);
  });

  it("falls back to the flat PCSP list when CST is empty", () => {
    const merged = mergeClientGoalSources([], ["Cook dinner independently"]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.goal, "Cook dinner independently");
  });
});

describe("selectGoalsForStaffClockOut", () => {
  const goals = [
    { id: "g1", goal: "Stay overnight safely", job_codes: [] },
    { id: "g2", goal: "Hidden goal", job_codes: ["SLH"] },
    { id: "g3", goal: "  ", job_codes: ["SLH"] },
    { id: "g4", goal: "Community access", job_codes: ["DSI"] },
  ];

  it("shows uploaded goals even when none are tagged for the punch code", () => {
    const shown = selectGoalsForStaffClockOut(goals, visible);
    assert.deepEqual(
      shown.map((g) => g.id),
      ["g1", "g2", "g4"],
    );
  });

  it("still honors per-goal visibility and drops empty text", () => {
    const shown = selectGoalsForStaffClockOut(goals, hideSecond);
    assert.deepEqual(
      shown.map((g) => g.id),
      ["g1", "g4"],
    );
  });
});
