import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Compass / punch pad go-live contracts", () => {
  it("Compass createClockIn never writes gps_in_bypassed: true", () => {
    const src = read("src/lib/cedar-voice-agent.server.ts");
    assert.match(src, /gps_in_bypassed:\s*false/);
    assert.equal(/gps_in_bypassed:\s*true/.test(src), false);
    assert.match(src, /refuses to insert a gps_in_bypassed stub/);
  });

  it("Compass createClockIn enforces Launchpad and billing authorization", () => {
    const src = read("src/lib/cedar-voice-agent.server.ts");
    assert.match(src, /assertLaunchpadPassed/);
    assert.match(src, /assertActiveBillingCode/);
    assert.match(src, /clientId:\s*z\.string\(\)\.uuid\(\)/);
  });

  it("Launchpad helper has no tester email / env bypass", () => {
    const src = read("src/lib/scheduling/shifts.functions.ts");
    assert.doesNotMatch(src, /SKIP_LAUNCHPAD|LAUNCHPAD_BYPASS|VITE_SKIP_LAUNCHPAD/i);
    assert.match(src, /if \(!data\?\.has_passed_launchpad\)/);
  });

  it("punch pad still gates submit on goal, 50-word note, incident, behaviors, meds, attest", () => {
    const src = read("src/components/evv/punch-pad.tsx");
    assert.match(src, /wordCount >= 50/);
    assert.match(src, /hasGoalSelected/);
    assert.match(src, /incidentAnswer !== null/);
    assert.match(src, /attestationChecked/);
    assert.match(src, /medDosesResolved/);
    assert.match(src, /behaviorOk/);
    assert.match(src, /setAttestationChecked\(false\)/);
  });

  it("Compass clock-out interview handoff never includes attestation", () => {
    const src = read("src/lib/compass-clock-out-interview.ts");
    assert.match(src, /verify: "1"/);
    assert.match(src, /never auto-attests/);
    const searchType = src.slice(
      src.indexOf("export type WorkspaceClockOutSearch"),
      src.indexOf("const STOP_WORDS"),
    );
    assert.doesNotMatch(searchType, /attest/);
    assert.doesNotMatch(src, /attested_accurate|attestationChecked/);
  });

  it("spoken notes go through NECTAR draftShiftNote", () => {
    const src = read("src/components/staff-mobile/compass-voice-button.tsx");
    assert.match(src, /draftShiftNote/);
    assert.match(src, /draftFn/);
  });
});
