// Admin-controlled "Suggested CE focus" multi-topic input.
// Used in the Edit Employee modal. Stores a flat list of topic strings.
// Topics steer Nectar's CE focus per staff member; Nectar still sources
// the actual teaching content from the org's Authoritative Sources.
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Sparkles } from "lucide-react";

export const FREQUENT_CE_TOPICS: string[] = [
  "Medication administration & safety",
  "Incident reporting & documentation",
  "Abuse, neglect & exploitation reporting",
  "Rights & HCBS Settings Rule",
  "Person-centered planning & dignity of risk",
  "De-escalation & positive behavior supports",
  "Trauma-informed care",
  "Emergency preparedness & response",
  "Infection control & communicable disease",
  "Seizure response",
  "Choking & mealtime safety",
  "CPR & first aid (knowledge)",
  "Professional boundaries",
  "Confidentiality & HIPAA",
  "Shift-note quality",
  "EVV & billing accuracy",
  "Suicide prevention & mental health",
  "Elopement / whereabouts unknown",
];

export function SuggestedTopicsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [picker, setPicker] = useState<string>("");
  const [custom, setCustom] = useState("");

  const available = useMemo(
    () => FREQUENT_CE_TOPICS.filter((t) => !value.includes(t)),
    [value],
  );

  const addTopic = (t: string) => {
    const cleaned = t.trim().slice(0, 120);
    if (!cleaned) return;
    if (value.includes(cleaned)) return;
    if (value.length >= 25) return;
    onChange([...value, cleaned]);
  };

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Suggested CE focus (optional)
        </Label>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Nectar will prioritize these topics in this staff member's monthly review and source
        the actual teaching content from your Authoritative Sources. If a topic isn't
        covered, you'll be flagged to upload more.
      </p>

      {value.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {value.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 pl-2 pr-1 font-normal">
              <span>{t}</span>
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={() => onChange(value.filter((x) => x !== t))}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex gap-1">
          <Select
            value={picker}
            onValueChange={(v) => {
              setPicker("");
              addTopic(v);
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Pick a common topic…" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">All common topics added</div>
              ) : (
                available.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (custom.trim()) { addTopic(custom); setCustom(""); }
              }
            }}
            placeholder="Add custom topic"
            className="h-9 text-xs"
            maxLength={120}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => { if (custom.trim()) { addTopic(custom); setCustom(""); } }}
            disabled={!custom.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
