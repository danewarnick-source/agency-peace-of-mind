import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnswerType } from "@/lib/obligations/agency-setup-questions";

export type ComplianceAnswerValue = boolean | string | number | string[] | null;

/** Shape shared by AgencySetupQuestionDefinition and DeferredFactDefinition. */
export type AnswerFieldQuestion = {
  answerType: AnswerType;
  options?: ReadonlyArray<{ value: string; label: string }>;
};

const BOOLEAN_CHOICES: Array<{ value: boolean; label: string }> = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
];

/**
 * One question's input, keyed off answerType — used for both the agency
 * questionnaire and the deferred (staff/client/location/assignment) facts
 * panel, so every scope renders answers the same way.
 * Unanswered is always "no button pressed / empty field" — never a
 * defaulted value — so a fresh render never silently reads as "No".
 */
export function ComplianceAnswerField({
  question,
  value,
  onChange,
  disabled,
}: {
  question: AnswerFieldQuestion;
  value: ComplianceAnswerValue;
  onChange: (next: ComplianceAnswerValue) => void;
  disabled?: boolean;
}) {
  if (question.answerType === "boolean") {
    return (
      <div className="flex flex-wrap gap-2">
        {BOOLEAN_CHOICES.map((choice) => {
          const selected = value === choice.value;
          return (
            <button
              key={String(choice.value)}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(choice.value)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.answerType === "multi_select") {
    const selectedCodes = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-2">
        {(question.options ?? []).map((opt) => {
          const selected = selectedCodes.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() =>
                onChange(
                  selected
                    ? selectedCodes.filter((c) => c !== opt.value)
                    : [...selectedCodes, opt.value],
                )
              }
              className={`rounded-md border px-3 py-1.5 text-sm ${
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.answerType === "single_select") {
    const current = typeof value === "string" ? value : "";
    return (
      <Select disabled={disabled} value={current || undefined} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="max-w-sm">
          <SelectValue placeholder="Choose one…" />
        </SelectTrigger>
        <SelectContent>
          {(question.options ?? []).map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (question.answerType === "number") {
    const current = typeof value === "number" ? String(value) : "";
    return (
      <Input
        inputMode="numeric"
        disabled={disabled}
        value={current}
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === "" ? null : Number(raw));
        }}
        className="max-w-[10rem]"
        placeholder="e.g. 24"
      />
    );
  }

  if (question.answerType === "date") {
    const current = typeof value === "string" ? value : "";
    return (
      <Input
        type="date"
        disabled={disabled}
        value={current}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="max-w-[12rem]"
      />
    );
  }

  // text
  const current = typeof value === "string" ? value : "";
  return (
    <Input
      disabled={disabled}
      value={current}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      placeholder="Type an answer…"
    />
  );
}
