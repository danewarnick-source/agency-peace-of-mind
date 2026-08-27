import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractNoteNarrative,
  hasClockOutCue,
  reconcileVoiceAgentResponse,
} from "./cedar-voice-intent.ts";

const COMBINED = "We went to the store, he was in a good mood. Clock me out.";

describe("clock-out cues", () => {
  it("detects clock me out and punch out", () => {
    assert.equal(hasClockOutCue("Clock me out"), true);
    assert.equal(hasClockOutCue("please punch me out"), true);
    assert.equal(hasClockOutCue("end my shift"), true);
    assert.equal(hasClockOutCue("clock me in with Justin"), false);
  });

  it("keeps the note when clock-out is also present", () => {
    assert.equal(extractNoteNarrative(COMBINED), "We went to the store, he was in a good mood");
  });

  it("does not invent a note from a bare clock-out", () => {
    assert.equal(extractNoteNarrative("Clock me out"), null);
    assert.equal(extractNoteNarrative("please clock me out"), null);
  });
});

describe("reconcileVoiceAgentResponse", () => {
  it("upgrades exclusive clock_out to combined when the transcript has a note", () => {
    const res = reconcileVoiceAgentResponse({ intent: "clock_out" }, COMBINED);
    assert.deepEqual(res, {
      intent: "expand_note_and_clock_out",
      narrative: "We went to the store, he was in a good mood",
    });
  });

  it("upgrades exclusive expand_note to combined when the transcript asks to clock out", () => {
    const res = reconcileVoiceAgentResponse(
      { intent: "expand_note", narrative: COMBINED },
      COMBINED,
    );
    assert.equal(res.intent, "expand_note_and_clock_out");
    if (res.intent === "expand_note_and_clock_out") {
      assert.equal(res.narrative.includes("store"), true);
      assert.equal(/clock me out/i.test(res.narrative), false);
    }
  });

  it("leaves a bare clock me out as clock_out with no narrative", () => {
    const res = reconcileVoiceAgentResponse({ intent: "clock_out" }, "Clock me out");
    assert.deepEqual(res, { intent: "clock_out" });
  });

  it("does not invent a note when Bedrock stuffed the clock-out phrase into expand_note", () => {
    const res = reconcileVoiceAgentResponse(
      { intent: "expand_note", narrative: "Clock me out" },
      "Clock me out",
    );
    assert.deepEqual(res, { intent: "clock_out" });
  });

  it("leaves a note-only utterance as expand_note", () => {
    const res = reconcileVoiceAgentResponse(
      { intent: "expand_note", narrative: "We went to the store, he was in a good mood" },
      "We went to the store, he was in a good mood",
    );
    assert.deepEqual(res, {
      intent: "expand_note",
      narrative: "We went to the store, he was in a good mood",
    });
  });

  it("salvages combined speech from unknown", () => {
    const res = reconcileVoiceAgentResponse({ intent: "unknown", message: "huh" }, COMBINED);
    assert.equal(res.intent, "expand_note_and_clock_out");
  });
});
