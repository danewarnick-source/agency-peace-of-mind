import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCaseloadClockInResolution,
  extractNoteNarrative,
  hasClockOutCue,
  reconcileVoiceAgentResponse,
} from "./cedar-voice-intent.ts";
import { formatCaseloadForPrompt } from "./cedar-voice-client-resolve.ts";

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

const TOMMY = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  firstName: "Tommy",
  lastName: "Lane",
};
const BLAKE = {
  id: "11111111-2222-4333-8444-555555555555",
  firstName: "Blake",
  lastName: "Reed",
};
const TOMMY_JONES = {
  id: "99999999-aaaa-4bbb-8ccc-dddddddddddd",
  firstName: "Tommy",
  lastName: "Jones",
};
const FAKE_UUID = "00000000-0000-4000-8000-000000000000";

function fromBedrockClockIn(
  parsed: Record<string, unknown>,
  transcript: string,
  caseload: (typeof TOMMY)[],
) {
  return applyCaseloadClockInResolution(
    reconcileVoiceAgentResponse(parsed, transcript),
    caseload,
    transcript,
  );
}

describe("clock-in caseload uuid resolution", () => {
  it("includes each caseload id in the prompt Bedrock sees", () => {
    const text = formatCaseloadForPrompt([
      { ...TOMMY, authorizedCodes: ["SEI"] },
      { ...BLAKE, authorizedCodes: ["HHS", "DSI"] },
    ]);
    assert.match(text, new RegExp(`id=${TOMMY.id}`));
    assert.match(text, new RegExp(`id=${BLAKE.id}`));
    assert.match(text, /Tommy Lane/);
    assert.match(text, /authorized: SEI/);
  });

  it("resolves a non-uuid clientId Bedrock invented to the caseload uuid", () => {
    const res = fromBedrockClockIn(
      { intent: "clock_in", clientId: "tommy", clientName: "Tommy", serviceCode: "SEI" },
      "Clock me in with Tommy for SEI",
      [TOMMY, BLAKE],
    );
    assert.deepEqual(res, {
      intent: "clock_in",
      clientId: TOMMY.id,
      clientName: "Tommy Lane",
      serviceCode: "SEI",
    });
  });

  it("resolves by name when Bedrock returns a uuid that is not on the caseload", () => {
    const res = fromBedrockClockIn(
      { intent: "clock_in", clientId: FAKE_UUID, clientName: "Blake", serviceCode: "SEI" },
      "Clock me in with Blake for SEI",
      [TOMMY, BLAKE],
    );
    assert.equal(res.intent, "clock_in");
    if (res.intent === "clock_in") {
      assert.equal(res.clientId, BLAKE.id);
    }
  });

  it("keeps a caseload uuid Bedrock copied correctly", () => {
    const res = fromBedrockClockIn(
      { intent: "clock_in", clientId: BLAKE.id, clientName: "Blake", serviceCode: "SEI" },
      "Clock me in with Blake for SEI",
      [TOMMY, BLAKE],
    );
    assert.equal(res.intent, "clock_in");
    if (res.intent === "clock_in") {
      assert.equal(res.clientId, BLAKE.id);
    }
  });

  it("clarifies when two caseload people share the spoken first name", () => {
    const res = fromBedrockClockIn(
      { intent: "clock_in", clientId: "tommy", clientName: "Tommy", serviceCode: "SEI" },
      "Clock me in with Tommy for SEI",
      [TOMMY, TOMMY_JONES, BLAKE],
    );
    assert.equal(res.intent, "clarify");
    if (res.intent === "clarify") {
      assert.match(res.question, /which client/i);
      assert.equal(res.candidates?.length, 2);
      assert.equal(res.serviceCode, "SEI");
    }
  });

  it("uses first+last to pick one Tommy when Bedrock returns the full name", () => {
    const res = fromBedrockClockIn(
      {
        intent: "clock_in",
        clientId: "tommy lane",
        clientName: "Tommy Lane",
        serviceCode: "SEI",
      },
      "Clock me in with Tommy Lane for SEI",
      [TOMMY, TOMMY_JONES],
    );
    assert.equal(res.intent, "clock_in");
    if (res.intent === "clock_in") {
      assert.equal(res.clientId, TOMMY.id);
    }
  });

  it("clarifies when the spoken name matches nobody", () => {
    const res = fromBedrockClockIn(
      { intent: "clock_in", clientId: "nobody", clientName: "Nobody", serviceCode: "SEI" },
      "Clock me in with Nobody for SEI",
      [TOMMY, BLAKE],
    );
    assert.equal(res.intent, "clarify");
    if (res.intent === "clarify") {
      assert.match(res.question, /which client/i);
      assert.equal(
        res.candidates?.some((c) => c.id === TOMMY.id),
        true,
      );
    }
  });

  it("resolves a name-only clock_in with no clientId", () => {
    const res = fromBedrockClockIn(
      { intent: "clock_in", clientId: "", clientName: "Blake", serviceCode: "SEI" },
      "Clock me in with Blake for SEI",
      [TOMMY, BLAKE],
    );
    assert.equal(res.intent, "clock_in");
    if (res.intent === "clock_in") {
      assert.equal(res.clientId, BLAKE.id);
    }
  });
});
