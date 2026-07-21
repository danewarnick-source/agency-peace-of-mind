import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Explicit Required / Exempt picker for the de-escalation & ABI training
 * requirements. Warns before allowing Exempt when the staffer is currently
 * assigned to a client the setting is typically required for.
 */
export function TrainingRequirementField({
  label, hint, value, onChange, atRisk, warningText,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (next: boolean) => void;
  atRisk: boolean;
  warningText: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select
        value={value ? "required" : "exempt"}
        onValueChange={(v) => {
          const next = v === "required";
          if (!next && atRisk && !window.confirm(warningText)) return;
          onChange(next);
        }}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="required">Required</SelectItem>
          <SelectItem value="exempt">Not required / Exempt</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
