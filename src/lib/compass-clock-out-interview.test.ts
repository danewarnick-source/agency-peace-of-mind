import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyBehaviorNameSpeech,
  applyGoalSpeech,
  buildGoalsPrompt,
  canAutoSubmitInterviewReply,
  compassHandoffToSearch,
  matchNamedOptions,
  parseYesNo,
  searchToCompassHandoff,
  spokenWantsBaseline,
} from "./compass-clock-out-interview.ts";

const GOALS = [
  "Increase independent cooking skills",
  "Community access and public transportation",
  "Personal hygiene routine",
];

describe("parseYesNo", () => {
  it("reads yes variants", () => {
    assert.equal(parseYesNo("yes"), "yes");
    assert.equal(parseYesNo("Yeah"), "yes");
    assert.equal(parseYesNo("yep"), "yes");
  });

  it("reads no variants", () => {
    assert.equal(parseYesNo("no"), "no");
    assert.equal(parseYesNo("nope"), "no");
    assert.equal(parseYesNo("nothing happened"), "no");
  });

  it("does not guess from unrelated speech", () => {
    assert.equal(parseYesNo("cooking skills"), null);
  });
});

describe("matchNamedOptions", () => {
  it("matches spoken names to on-file goals and does not invent", () => {
    assert.deepEqual(matchNamedOptions("cooking skills", GOALS), [
      "Increase independent cooking skills",
    ]);
    assert.deepEqual(matchNamedOptions("community access", GOALS), [
      "Community access and public transportation",
    ]);
    assert.deepEqual(matchNamedOptions("skydiving lessons", GOALS), []);
  });

  it("can match more than one name in one utterance", () => {
    const hits = matchNamedOptions("cooking and hygiene", GOALS);
    assert.equal(hits.includes("Increase independent cooking skills"), true);
    assert.equal(hits.includes("Personal hygiene routine"), true);
  });
});

describe("applyGoalSpeech", () => {
  it("selects baseline from speech", () => {
    assert.equal(spokenWantsBaseline("just baseline"), true);
    const res = applyGoalSpeech("just baseline", GOALS, {
      selectedGoals: [],
      baseline: false,
    });
    assert.equal(res.baseline, true);
    assert.deepEqual(res.selectedGoals, []);
    assert.equal(res.advance, true);
  });

  it("adds a matched goal without auto-advancing so staff can pick more", () => {
    const res = applyGoalSpeech("cooking skills", GOALS, {
      selectedGoals: [],
      baseline: false,
    });
    assert.deepEqual(res.selectedGoals, ["Increase independent cooking skills"]);
    assert.equal(res.advance, false);
    assert.equal(res.unclear, false);
  });

  it("advances on that's all when something is selected", () => {
    const res = applyGoalSpeech("that's all", GOALS, {
      selectedGoals: ["Increase independent cooking skills"],
      baseline: false,
    });
    assert.equal(res.advance, true);
  });
});

describe("applyBehaviorNameSpeech", () => {
  const names = ["Elopement", "Physical aggression"];
  it("matches a named target and does not invent counts", () => {
    const res = applyBehaviorNameSpeech("elopement", names, []);
    assert.deepEqual(res.targetBehaviors, ["Elopement"]);
    assert.equal(res.advance, false);
  });
});

describe("canAutoSubmitInterviewReply", () => {
  it("accepts a one-word yes", () => {
    assert.equal(canAutoSubmitInterviewReply("yes", "yesno"), true);
    assert.equal(canAutoSubmitInterviewReply("um", "yesno"), false);
  });
});

describe("handoff search params", () => {
  it("round-trips goals, incident, and behaviors without attestation", () => {
    const search = compassHandoffToSearch({
      note: "Drafted note",
      spoken: "we cooked then clock me out",
      selectedGoals: ["Increase independent cooking skills"],
      baseline: false,
      incident: "no",
      behaviorsObserved: true,
      targetBehaviors: ["Elopement"],
    });
    assert.equal(search.verify, "1");
    assert.equal(search.incident, "no");
    assert.equal(search.behaviors, "yes");
    const back = searchToCompassHandoff(search);
    assert.deepEqual(back?.selectedGoals, ["Increase independent cooking skills"]);
    assert.equal(back?.incident, "no");
    assert.deepEqual(back?.targetBehaviors, ["Elopement"]);
    assert.equal(back?.baseline, false);
  });

  it("does not treat a note-only URL as an interview handoff", () => {
    assert.equal(searchToCompassHandoff({ note: "hello", spoken: "hello" }), null);
  });
});

describe("buildGoalsPrompt", () => {
  it("says so when no tagged goals exist", () => {
    const p = buildGoalsPrompt([]);
    assert.match(p, /No PCSP goals/i);
    assert.match(p, /baseline/i);
  });

  it("lists on-file goal names", () => {
    const p = buildGoalsPrompt(GOALS);
    assert.match(p, /cooking/i);
    assert.doesNotMatch(p, /skydiving/i);
  });
});
