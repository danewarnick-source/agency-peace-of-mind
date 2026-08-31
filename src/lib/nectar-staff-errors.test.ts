import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  questionWantsClientContext,
  questionWantsMedications,
  slimPcspGoals,
  staffNectarFailureMessage,
} from "./nectar-staff-errors.ts";

describe("staffNectarFailureMessage", () => {
  it("never returns AI error (400)", () => {
    const msg = staffNectarFailureMessage(400, "ValidationException: Input is too long for the model");
    assert.doesNotMatch(msg, /AI error \(\d+\)/);
    assert.match(msg, /caseload context|one person/i);
  });

  it("names a 400 with the body when it is not a length error", () => {
    const msg = staffNectarFailureMessage(400, "Malformed request: missing messages");
    assert.doesNotMatch(msg, /AI error \(\d+\)/);
    assert.match(msg, /Malformed request/);
  });

  it("maps throttle and credentials without status codes as the headline", () => {
    assert.match(staffNectarFailureMessage(429, "ThrottlingException"), /busy/i);
    assert.match(staffNectarFailureMessage(401, "AccessDenied"), /not configured/i);
  });

  it("does not echo AWS ARNs or model ids", () => {
    const msg = staffNectarFailureMessage(
      400,
      "Malformed request arn:aws:bedrock:us-west-2:123:inference-profile/abc for model us.anthropic.claude-x",
    );
    assert.doesNotMatch(msg, /arn:aws/);
    assert.doesNotMatch(msg, /us\.anthropic/);
    assert.match(msg, /Malformed request/);
  });
});

describe("PCSP question slimming", () => {
  it("treats the starter PCSP question as client context, not meds", () => {
    const q = "What are my client's PCSP goals today?";
    assert.equal(questionWantsClientContext(q), true);
    assert.equal(questionWantsMedications(q), false);
  });

  it("caps goal text so a caseload dump cannot bloat the prompt", () => {
    const slim = slimPcspGoals(["x".repeat(400), "short"]);
    assert.equal(slim[0]?.length, 240);
    assert.equal(slim[1], "short");
  });
});
