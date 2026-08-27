import { useMemo, useState } from "react";
import { OriginalSpeechAudit } from "@/components/staff-mobile/original-speech-audit";
import {
  BehaviorObservationsBlock,
  emptyBehaviorAnswers,
  validateBehaviorAnswers,
  type BehaviorAnswers,
} from "@/components/evv/behavior-observations-block";
import { TOMMY_BEHAVIORS, TOMMY_GOALS } from "./fixtures";

const FRAUD =
  "I attest that this shift note is accurate and truthful, that it reflects services I personally provided, and that I understand submitting false Medicaid documentation constitutes fraud.";

const FIFTY_WORDS = Array.from({ length: 50 }, (_, i) => `word${i + 1}`).join(" ");

export function PunchPadClockOutStage({ search }: { search: Record<string, string | undefined> }) {
  const [narrative, setNarrative] = useState(search.note ?? "");
  const [checkedGoals, setCheckedGoals] = useState<Record<string, boolean>>({});
  const [baseline, setBaseline] = useState(false);
  const [incidentAnswer, setIncidentAnswer] = useState<"yes" | "no" | null>(null);
  const [behaviorAnswers, setBehaviorAnswers] = useState<BehaviorAnswers>(emptyBehaviorAnswers);
  const [medsDue] = useState(true);
  const [medDosesResolved, setMedDosesResolved] = useState(false);
  const [attestationChecked, setAttestationChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const wordCount = useMemo(() => {
    const t = narrative.trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }, [narrative]);

  const hasGoalSelected = baseline || Object.values(checkedGoals).some(Boolean);
  const narrativeOk = wordCount >= 50;
  const behaviorOk = validateBehaviorAnswers(behaviorAnswers) === null;
  const canSubmit =
    hasGoalSelected &&
    narrativeOk &&
    behaviorOk &&
    incidentAnswer !== null &&
    (!medsDue || medDosesResolved) &&
    attestationChecked;

  return (
    <main data-e2e-scene="punch-pad-clock-out">
      <h1>Shift Verification &amp; Medicaid Compliance Form</h1>
      <p data-e2e-verify={search.verify ?? ""}>verify={search.verify ?? ""}</p>
      <p data-e2e-timesheet-writes={window.__e2e.timesheetWrites}>
        Timesheet writes: {window.__e2e.timesheetWrites}
      </p>
      <p data-e2e-attest-initial={attestationChecked ? "1" : "0"}>
        Fraud attestation starts unchecked.
      </p>
      <button type="button" onClick={() => setNarrative(FIFTY_WORDS)}>
        Fill 50-word note
      </button>

      <OriginalSpeechAudit transcript={search.spoken ?? ""} />

      <section>
        <h2>PCSP goals</h2>
        {TOMMY_GOALS.map((goal) => (
          <label key={goal}>
            <input
              type="checkbox"
              checked={!!checkedGoals[goal]}
              onChange={(e) => setCheckedGoals((p) => ({ ...p, [goal]: e.target.checked }))}
            />
            {goal}
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={baseline}
            onChange={(e) => setBaseline(e.target.checked)}
          />
          General baseline monitoring &amp; safety oversight
        </label>
      </section>

      <section>
        <h2>Progress note</h2>
        <textarea
          aria-label="Shift note"
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={8}
        />
        <p>Word Count: {wordCount} / 50 words minimum</p>
      </section>

      <section>
        <h2>Incident</h2>
        <button type="button" onClick={() => setIncidentAnswer("no")}>
          No
        </button>
        <button type="button" onClick={() => setIncidentAnswer("yes")}>
          Yes
        </button>
        <p>Incident: {incidentAnswer ?? "unanswered"}</p>
      </section>

      <BehaviorObservationsBlock
        value={behaviorAnswers}
        onChange={setBehaviorAnswers}
        targetBehaviorOptions={TOMMY_BEHAVIORS}
      />

      <section>
        <h2>Medications due this shift</h2>
        <label>
          <input
            type="checkbox"
            checked={medDosesResolved}
            onChange={(e) => setMedDosesResolved(e.target.checked)}
          />
          I documented due medications
        </label>
      </section>

      <label>
        <input
          type="checkbox"
          checked={attestationChecked}
          onChange={(e) => setAttestationChecked(e.target.checked)}
        />
        {FRAUD}
      </label>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => {
          window.__e2e.timesheetWrites += 1;
          setSubmitted(true);
        }}
      >
        Submit timesheet
      </button>
      {submitted ? <p>Timesheet submitted</p> : null}
    </main>
  );
}
