import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  advisoryMoveToClientThread,
  ASK_NOTIFICATION_TYPE,
  missingThreadsTable,
  phiSafeAskNotify,
  sanitizeThreadBody,
  shiftAskSubject,
  TEAM_DAY_SUPPORT_SUBJECT,
  teamThreadSubject,
} from "./threads.ts";

describe("Ask staff / team thread copy", () => {
  it("uses a PHI-free shift subject", () => {
    assert.equal(shiftAskSubject(), "Question on a shift");
    assert.doesNotMatch(shiftAskSubject(), /Harvey|client|medicaid/i);
  });

  it("defaults team threads to Day support", () => {
    assert.equal(teamThreadSubject(""), TEAM_DAY_SUPPORT_SUBJECT);
    assert.equal(teamThreadSubject("  "), TEAM_DAY_SUPPORT_SUBJECT);
    assert.equal(teamThreadSubject("Coverage tonight"), "Coverage tonight");
  });

  it("keeps notification / email / SMS free of PHI and reuses timesheet_exception", () => {
    const n = phiSafeAskNotify({ channel: "notification" });
    const e = phiSafeAskNotify({ channel: "email" });
    const s = phiSafeAskNotify({ channel: "sms" });
    for (const msg of [n, e, s]) {
      assert.doesNotMatch(msg.body, /Harvey|Alisa|medicaid|diagnosis/i);
      assert.doesNotMatch(msg.title, /Harvey|Alisa/i);
    }
    assert.equal(ASK_NOTIFICATION_TYPE, "timesheet_exception");
    assert.match(s.body, /No client details/);
  });

  it("Move-to-client-thread is advisory only", () => {
    const got = advisoryMoveToClientThread({ kind: "shift", hasClientId: true });
    assert.equal(got.advisory, true);
    assert.equal(got.canMove, false);
    assert.match(got.message, /does not move/);
  });

  it("detects missing Soft tables", () => {
    assert.equal(
      missingThreadsTable('relation "threads" does not exist'),
      true,
    );
    assert.equal(
      missingThreadsTable("Could not find the thread_messages table in the schema cache"),
      true,
    );
    assert.equal(missingThreadsTable("permission denied"), false);
  });

  it("trims message bodies", () => {
    assert.equal(sanitizeThreadBody("  hello  "), "hello");
    assert.equal(sanitizeThreadBody("x".repeat(5000)).length, 4000);
  });
});

describe("Threads lock", () => {
  it("does not introduce UI emoji", () => {
    const src = readFileSync(new URL("./threads.ts", import.meta.url), "utf8");
    assert.equal(/\p{Extended_Pictographic}/u.test(src), false);
  });
});
