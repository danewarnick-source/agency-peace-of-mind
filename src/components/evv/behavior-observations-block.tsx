import { useId } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ClipboardList, Info } from "lucide-react";
import { selectedPill, unselectedPill } from "@/components/evv/toggle-styles";

export type BehaviorTrend = "fewer" | "same" | "more" | "na";
export type BehaviorFrequency = "0" | "1" | "2-3" | "4+";

export interface BehaviorAnswers {
  behaviorsObserved: boolean | null;
  targetBehaviors: string[];
  counts: Record<string, BehaviorFrequency>;
  objectiveDescription: string;
  antecedentContext: string;
  interventionResponse: string;
  reportableIncident: boolean;
  positives: string;
  trendVsRecent: BehaviorTrend | "";
}

export const emptyBehaviorAnswers: BehaviorAnswers = {
  behaviorsObserved: null,
  targetBehaviors: [],
  counts: {},
  objectiveDescription: "",
  antecedentContext: "",
  interventionResponse: "",
  reportableIncident: false,
  positives: "",
  trendVsRecent: "",
};

/** Validation — returns null if valid, else a short reason. */
export function validateBehaviorAnswers(a: BehaviorAnswers): string | null {
  if (a.behaviorsObserved === null) return "Answer the behavior observation question.";
  if (a.behaviorsObserved) {
    if (!a.objectiveDescription.trim()) return "Describe what happened (objective).";
    if (!a.antecedentContext.trim()) return "Describe what was happening just before.";
    if (!a.interventionResponse.trim()) return "Describe the intervention and response.";
  }
  return null;
}

const FREQS: BehaviorFrequency[] = ["0", "1", "2-3", "4+"];
const OTHER_KEY = "Other (new/emerging)";

export function BehaviorObservationsBlock({
  value,
  onChange,
  targetBehaviorOptions = [],
  onOpenIncident,
}: {
  value: BehaviorAnswers;
  onChange: (next: BehaviorAnswers) => void;
  targetBehaviorOptions?: string[];
  onOpenIncident?: () => void;
}) {
  const groupId = useId();
  const options = [...targetBehaviorOptions, OTHER_KEY];

  function set<K extends keyof BehaviorAnswers>(k: K, v: BehaviorAnswers[K]) {
    onChange({ ...value, [k]: v });
  }

  function toggleTarget(name: string) {
    const has = value.targetBehaviors.includes(name);
    const nextSel = has
      ? value.targetBehaviors.filter((n) => n !== name)
      : [...value.targetBehaviors, name];
    const nextCounts = { ...value.counts };
    if (has) delete nextCounts[name];
    else nextCounts[name] = nextCounts[name] ?? "1";
    onChange({ ...value, targetBehaviors: nextSel, counts: nextCounts });
  }

  function setCount(name: string, freq: BehaviorFrequency) {
    onChange({ ...value, counts: { ...value.counts, [name]: freq } });
  }

  return (
    <div className="grid gap-3 rounded-lg border-2 border-dashed border-[color:var(--amber-400)] bg-[color:var(--amber-50)]/40 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-[color:var(--amber-700)]" />
        <h3 className="text-sm font-semibold text-[color:var(--navy-900)]">
          🧭 Behavior Observations (this shift)
        </h3>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-background/70 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Use <span className="font-semibold">objective, observable language</span> — what you saw and heard.
          Avoid interpretations like "angry" or "upset"; write what the person <em>did</em>.
        </span>
      </div>

      {/* Q1 */}
      <fieldset className="grid gap-2">
        <legend className="text-xs font-semibold text-foreground">
          1. Any behaviors of concern observed this shift? <span className="text-rose-600">*</span>
        </legend>
        <div className="flex gap-2">
          {[
            { v: false, label: "No" },
            { v: true, label: "Yes" },
          ].map((opt) => (
            <label
              key={String(opt.v)}
              className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium ${
                value.behaviorsObserved === opt.v ? selectedPill : unselectedPill
              }`}
            >
              <input
                type="radio"
                name={`${groupId}-observed`}
                className="sr-only"
                checked={value.behaviorsObserved === opt.v}
                onChange={() => set("behaviorsObserved", opt.v)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {value.behaviorsObserved === true && (
        <>
          {/* Q2 */}
          <fieldset className="grid gap-2">
            <legend className="text-xs font-semibold text-foreground">2. Target / known behaviors observed</legend>
            {targetBehaviorOptions.length === 0 && (
              <p className="text-[11px] italic text-muted-foreground">
                No documented target behaviors on file — use "Other (new/emerging)".
              </p>
            )}
            <div className="grid gap-1.5 rounded-md border border-border bg-background/70 p-2">
              {options.map((name) => {
                const sel = value.targetBehaviors.includes(name);
                return (
                  <div key={name} className="flex flex-col gap-1.5 rounded-md p-1.5 hover:bg-accent/40 md:flex-row md:items-center md:justify-between">
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[color:var(--amber-600)]"
                        checked={sel}
                        onChange={() => toggleTarget(name)}
                      />
                      <span className="break-words">{name}</span>
                    </label>
                    {sel && (
                      <div className="flex gap-1">
                        {FREQS.map((f) => (
                          <button
                            type="button"
                            key={f}
                            onClick={() => setCount(name, f)}
                            className={`min-h-[36px] min-w-[44px] rounded-md border px-2 text-[11px] font-medium ${
                              (value.counts[name] ?? "") === f ? selectedPill : unselectedPill
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>

          {/* Q3 */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">
              3. Brief objective description <span className="text-rose-600">*</span>
            </Label>
            <Textarea
              rows={3}
              value={value.objectiveDescription}
              onChange={(e) => set("objectiveDescription", e.target.value)}
              placeholder="e.g., raised voice, walked away from table, sat in bedroom for 8 minutes"
              maxLength={2000}
              className="min-h-[80px]"
            />
          </div>

          {/* Q4 */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">
              4. Environmental context / what was happening just before <span className="text-rose-600">*</span>
            </Label>
            <Textarea
              rows={2}
              value={value.antecedentContext}
              onChange={(e) => set("antecedentContext", e.target.value)}
              placeholder="e.g., transition from outing back home, noisy living room, peer asking for shared item"
              maxLength={2000}
              className="min-h-[64px]"
            />
          </div>

          {/* Q5 */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">
              5. Intervention used and response <span className="text-rose-600">*</span>
            </Label>
            <Textarea
              rows={2}
              value={value.interventionResponse}
              onChange={(e) => set("interventionResponse", e.target.value)}
              placeholder="e.g., offered quiet space + sensory item; calm and re-engaged within ~10 min"
              maxLength={2000}
              className="min-h-[64px]"
            />
          </div>

          {/* Q6 */}
          <div className="flex flex-col items-start gap-2 rounded-md border border-border bg-background/70 p-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[color:var(--amber-600)]"
                checked={value.reportableIncident}
                onChange={(e) => set("reportableIncident", e.target.checked)}
              />
              6. Was this a reportable incident?
            </label>
            {value.reportableIncident && onOpenIncident && (
              <button
                type="button"
                onClick={onOpenIncident}
                className="min-h-[36px] rounded-md border border-rose-500/50 bg-rose-500/10 px-3 text-[11px] font-semibold text-rose-700 hover:bg-rose-500/20"
              >
                File Incident Report
              </button>
            )}
          </div>
        </>
      )}

      {/* Q7 — always */}
      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold">7. Notable positives / exceptional moments (optional)</Label>
        <Textarea
          rows={2}
          value={value.positives}
          onChange={(e) => set("positives", e.target.value)}
          placeholder="e.g., initiated conversation with new neighbor, completed laundry independently"
          maxLength={2000}
          className="min-h-[60px]"
        />
      </div>

      {/* Q8 */}
      <fieldset className="grid gap-1.5">
        <legend className="text-xs font-semibold text-foreground">
          8. Compared to recent shifts, target behaviors today were:
        </legend>
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          {([
            ["fewer", "Fewer"],
            ["same", "About the same"],
            ["more", "More"],
            ["na", "N/A"],
          ] as const).map(([k, label]) => (
            <label
              key={k}
              className={`flex min-h-[40px] cursor-pointer items-center justify-center rounded-md border px-2 text-[11px] font-medium ${
                value.trendVsRecent === k
                  ? "border-[color:var(--amber-600)] bg-[color:var(--amber-100)] text-[color:var(--navy-900)]"
                  : "border-border bg-background hover:bg-accent"
              }`}
            >
              <input
                type="radio"
                name={`${groupId}-trend`}
                className="sr-only"
                checked={value.trendVsRecent === k}
                onChange={() => set("trendVsRecent", k)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
