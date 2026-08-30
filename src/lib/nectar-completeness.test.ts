import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NECTAR_DRAFT_MIN_WORDS } from "./nectar-note-gate.ts";
import {
  COMPLETENESS_PASS_FEEDBACK,
  completenessFromChecks,
  localWordCountCheck,
  mergeLocalAndNectarChecks,
  parseNectarCompletenessPayload,
} from "./nectar-completeness.ts";

const THIRTY =
  "Staff prompted Blake to wash his hands before lunch. Blake said no at first then washed them with one reminder and sat down to eat his sandwich after staff offered a choice.";

describe("nectar-completeness", () => {
  it("fails word count under 30 and passes at 30", () => {
    const short = localWordCountCheck("only nine words in this short note here");
    assert.equal(short.passed, false);
    assert.match(short.message, /at least 30/);

    const ok = localWordCountCheck(THIRTY);
    assert.equal(ok.passed, true);
    assert.ok(ok.message.includes(String(NECTAR_DRAFT_MIN_WORDS)) || /Word count met/.test(ok.message));
  });

  it("parses NECTAR payload into the three model checks only", () => {
    const checks = parseNectarCompletenessPayload({
      client_referenced: { passed: true, message: "Blake is named." },
      support_provided: { passed: false, message: "Say what staff did." },
      client_response: { passed: true, message: "He washed his hands." },
      word_count: { passed: false, message: "ignore this from the model" },
    });
    assert.equal(checks.length, 3);
    assert.deepEqual(
      checks.map((c) => c.key),
      ["client_referenced", "support_provided", "client_response"],
    );
    assert.equal(checks[1]?.passed, false);
    assert.equal(checks[1]?.message, "Say what staff did.");
  });

  it("merges local word count with NECTAR checks and names each failure", () => {
    const result = mergeLocalAndNectarChecks(THIRTY, [
      { key: "client_referenced", passed: true, message: "ok" },
      { key: "support_provided", passed: false, message: "Describe the support you provided." },
      { key: "client_response", passed: false, message: "Describe how the client responded." },
    ]);
    assert.equal(result.status, "Flagged");
    const failedKeys = result.checks.filter((c) => !c.passed).map((c) => c.key);
    assert.deepEqual(failedKeys, ["support_provided", "client_response"]);
    assert.match(result.feedback, /support you provided/);
    assert.match(result.feedback, /client responded/);
    assert.equal(failedKeys.includes("word_count"), false);
  });

  it("passes only when all four items pass", () => {
    const result = completenessFromChecks([
      { key: "word_count", passed: true, message: "ok" },
      { key: "client_referenced", passed: true, message: "ok" },
      { key: "support_provided", passed: true, message: "ok" },
      { key: "client_response", passed: true, message: "ok" },
    ]);
    assert.equal(result.status, "Verified");
    assert.equal(result.feedback, COMPLETENESS_PASS_FEEDBACK);
  });
});
