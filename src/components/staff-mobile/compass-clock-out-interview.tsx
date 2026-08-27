import { Loader2, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectedPill, unselectedPill } from "@/components/evv/toggle-styles";
import { BASELINE_GOAL_LABEL, type CompassInterviewPhase } from "@/lib/compass-clock-out-interview";

const CEDAR_TEAL = "#137182";

export function CompassClockOutInterview({
  phase,
  narrativePreview,
  goals,
  goalsLoading,
  selectedGoals,
  baseline,
  onToggleGoal,
  onToggleBaseline,
  onGoalsContinue,
  incident,
  onIncident,
  targetOptions,
  selectedTargets,
  behaviorsObserved,
  onBehaviorsYesNo,
  onToggleTarget,
  onTargetsContinue,
  listening,
  transcript,
  onStopListen,
  onStartListen,
  finishing,
}: {
  phase: CompassInterviewPhase;
  narrativePreview: string | null;
  goals: string[];
  goalsLoading?: boolean;
  selectedGoals: string[];
  baseline: boolean;
  onToggleGoal: (goal: string) => void;
  onToggleBaseline: () => void;
  onGoalsContinue: () => void;
  incident: "yes" | "no" | null;
  onIncident: (v: "yes" | "no") => void;
  targetOptions: string[];
  selectedTargets: string[];
  behaviorsObserved: boolean | null;
  onBehaviorsYesNo: (v: boolean) => void;
  onToggleTarget: (name: string) => void;
  onTargetsContinue: () => void;
  listening: boolean;
  transcript: string;
  onStopListen: () => void;
  onStartListen: () => void;
  finishing: boolean;
}) {
  const hasGoalPick = baseline || selectedGoals.length > 0;

  if (finishing || phase === "finishing") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: CEDAR_TEAL }} />
        <p className="text-sm text-muted-foreground">
          {narrativePreview ? "NECTAR is drafting your note…" : "Opening clock-out…"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Clock-out questions
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tap an answer or say it. Compass will not clock you out or attest.
        </p>
      </div>

      {narrativePreview ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Note Compass heard
          </p>
          {narrativePreview}
        </div>
      ) : null}

      {phase === "goals" && (
        <div className="space-y-3">
          <h2 className="text-base font-medium">Which PCSP goals this shift?</h2>
          {goalsLoading ? (
            <p className="text-sm text-muted-foreground">Loading this shift&apos;s PCSP goals…</p>
          ) : goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No PCSP goals tagged for this service. Using baseline monitoring.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {goals.map((goal) => {
                const sel = selectedGoals.includes(goal);
                return (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => onToggleGoal(goal)}
                    className={`min-h-[44px] rounded-md border px-3 py-2 text-left text-sm ${
                      sel ? selectedPill : unselectedPill
                    }`}
                  >
                    {goal}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={onToggleBaseline}
            className={`min-h-[44px] w-full rounded-md border px-3 py-2 text-left text-sm italic ${
              baseline ? selectedPill : unselectedPill
            }`}
          >
            {BASELINE_GOAL_LABEL}
          </button>
          {goals.length > 0 && (
            <Button
              className="w-full text-white"
              style={{ backgroundColor: CEDAR_TEAL }}
              disabled={!hasGoalPick}
              onClick={onGoalsContinue}
            >
              Continue
            </Button>
          )}
        </div>
      )}

      {phase === "incident" && (
        <div className="space-y-3">
          <h2 className="text-base font-medium">
            Did anything happen that needs an incident report?
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onIncident("no")}
              className={`flex min-h-[44px] flex-1 items-center justify-center rounded-md border px-3 text-sm font-medium ${
                incident === "no" ? selectedPill : unselectedPill
              }`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => onIncident("yes")}
              className={`flex min-h-[44px] flex-1 items-center justify-center rounded-md border px-3 text-sm font-medium ${
                incident === "yes" ? selectedPill : unselectedPill
              }`}
            >
              Yes
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            If yes, you&apos;ll file the report on the punch pad — Compass will not file it.
          </p>
        </div>
      )}

      {phase === "behaviors" && (
        <div className="space-y-3">
          <h2 className="text-base font-medium">Any target behaviors this shift?</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onBehaviorsYesNo(false)}
              className={`flex min-h-[44px] flex-1 items-center justify-center rounded-md border px-3 text-sm font-medium ${
                behaviorsObserved === false ? selectedPill : unselectedPill
              }`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => onBehaviorsYesNo(true)}
              className={`flex min-h-[44px] flex-1 items-center justify-center rounded-md border px-3 text-sm font-medium ${
                behaviorsObserved === true ? selectedPill : unselectedPill
              }`}
            >
              Yes
            </button>
          </div>
        </div>
      )}

      {phase === "behavior-names" && (
        <div className="space-y-3">
          <h2 className="text-base font-medium">Which target behaviors?</h2>
          {targetOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No named target behaviors on file. You can finish details on the punch pad.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {targetOptions.map((name) => {
                const sel = selectedTargets.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onToggleTarget(name)}
                    className={`min-h-[44px] rounded-md border px-3 py-2 text-left text-sm ${
                      sel ? selectedPill : unselectedPill
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          <Button
            className="w-full text-white"
            style={{ backgroundColor: CEDAR_TEAL }}
            onClick={onTargetsContinue}
          >
            Continue
          </Button>
        </div>
      )}

      <div className="flex flex-col items-center gap-2 pt-1">
        {listening ? (
          <>
            <button
              type="button"
              onClick={onStopListen}
              className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
              style={{
                backgroundColor: CEDAR_TEAL,
                boxShadow: `0 0 0 6px ${CEDAR_TEAL}33`,
              }}
              aria-label="Stop listening"
            >
              <MicOff className="h-5 w-5" />
            </button>
            <p className="min-h-[2rem] max-w-sm px-2 text-center text-sm text-muted-foreground">
              {transcript || "Listening…"}
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onStartListen}
              className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
              style={{ backgroundColor: CEDAR_TEAL }}
              aria-label="Answer by voice"
            >
              <Mic className="h-5 w-5" />
            </button>
            <p className="text-xs text-muted-foreground">Tap a choice or the mic</p>
          </>
        )}
      </div>
    </div>
  );
}
