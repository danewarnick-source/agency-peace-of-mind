import type { FormField, FieldType, FieldCondition } from "@/lib/forms-utils";
import { operatorsFor } from "@/lib/forms-utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Trash2, Plus, GitBranch } from "lucide-react";

export function FieldEditor({
  field, index, eligibleControllers, onChange, onMoveUp, onMoveDown, onRemove,
}: {
  field: FormField;
  index: number;
  eligibleControllers: { field: FormField; index: number }[];
  onChange: (next: FormField) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  function patch(p: Partial<FormField>) { onChange({ ...field, ...p }); }
  function patchConfig(p: NonNullable<FormField["config"]>) { onChange({ ...field, config: { ...(field.config ?? {}), ...p } }); }
  const hasOptions = field.type === "dropdown" || field.type === "checkboxes";
  const controller = field.condition ? eligibleControllers.find((c) => c.field.id === field.condition!.fieldId) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{TYPE_LABEL[field.type]}</div>
          {controller && (
            <Badge variant="outline" className="text-[10px] gap-1 border-teal-300 text-teal-700">
              <GitBranch className="h-3 w-3" /> Conditional → Q{controller.index + 1}
            </Badge>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onMoveUp} className="h-8 w-8"><ArrowUp className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onMoveDown} className="h-8 w-8"><ArrowDown className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onRemove} className="h-8 w-8 text-rose-600"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>


      <div className="grid gap-1.5">
        <Label className="text-xs">Question / heading</Label>
        <Input value={field.label} onChange={(e) => patch({ label: e.target.value })} maxLength={200} />
      </div>

      {field.type === "section" ? (
        <div className="grid gap-1.5">
          <Label className="text-xs">Instructions</Label>
          <Textarea value={field.instructions ?? ""} onChange={(e) => patch({ instructions: e.target.value })} rows={3} maxLength={2000} />
        </div>
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label className="text-xs">Help text (optional)</Label>
            <Input value={field.help ?? ""} onChange={(e) => patch({ help: e.target.value })} maxLength={240} />
          </div>
          {(field.type === "short_text" || field.type === "paragraph" || field.type === "email" || field.type === "phone") && (
            <div className="grid gap-1.5">
              <Label className="text-xs">Placeholder</Label>
              <Input value={field.placeholder ?? ""} onChange={(e) => patch({ placeholder: e.target.value })} maxLength={120} />
            </div>
          )}
          {field.type === "number" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5 col-span-2">
                <Label className="text-xs">Display</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={field.config?.display !== "slider" ? "default" : "outline"}
                    onClick={() => patchConfig({ display: "box" })}>Number box</Button>
                  <Button type="button" size="sm" variant={field.config?.display === "slider" ? "default" : "outline"}
                    onClick={() => patchConfig({ display: "slider" })}>Sliding scale</Button>
                </div>
              </div>
              <div className="grid gap-1.5"><Label className="text-xs">Min</Label>
                <Input type="number" value={field.config?.min ?? 0} onChange={(e) => patchConfig({ min: Number(e.target.value) })} /></div>
              <div className="grid gap-1.5"><Label className="text-xs">Max</Label>
                <Input type="number" value={field.config?.max ?? 100} onChange={(e) => patchConfig({ max: Number(e.target.value) })} /></div>
              <div className="grid gap-1.5"><Label className="text-xs">Step</Label>
                <Input type="number" value={field.config?.step ?? 1} onChange={(e) => patchConfig({ step: Number(e.target.value) })} /></div>
            </div>
          )}
          {field.type === "rating" && (
            <div className="grid gap-1.5">
              <Label className="text-xs">Max stars</Label>
              <Input type="number" min={3} max={10} value={field.config?.scale ?? 5}
                onChange={(e) => patchConfig({ scale: Math.max(3, Math.min(10, Number(e.target.value) || 5)) })} />
            </div>
          )}
          {hasOptions && (
            <div className="grid gap-1.5">
              <Label className="text-xs">Options</Label>
              <div className="space-y-1.5">
                {(field.options ?? []).map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={o} onChange={(e) => {
                      const next = [...(field.options ?? [])]; next[i] = e.target.value; patch({ options: next });
                    }} maxLength={100} />
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0"
                      onClick={() => patch({ options: (field.options ?? []).filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => patch({ options: [...(field.options ?? []), `Option ${(field.options?.length ?? 0) + 1}`] })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add option
                </Button>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm min-h-[44px]">
            <Checkbox checked={!!field.required} onCheckedChange={(c) => patch({ required: !!c })} />
            Required
          </label>

          <ConditionEditor
            condition={field.condition ?? null}
            eligibleControllers={eligibleControllers}
            onChange={(c) => patch({ condition: c })}
          />
        </>
      )}
    </div>
  );
}

function ConditionEditor({
  condition, eligibleControllers, onChange,
}: {
  condition: FieldCondition;
  eligibleControllers: { field: FormField; index: number }[];
  onChange: (c: FieldCondition) => void;
}) {
  const enabled = !!condition;
  const ctrl = condition ? eligibleControllers.find((c) => c.field.id === condition.fieldId) : null;
  const ops = ctrl ? operatorsFor(ctrl.field.type) : [];
  const needsValue = condition && condition.operator !== "answered" && condition.operator !== "not_answered";

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-2 space-y-2">
      <label className="flex items-center gap-2 text-xs min-h-[36px]">
        <Checkbox
          checked={enabled}
          disabled={eligibleControllers.length === 0}
          onCheckedChange={(c) => {
            if (!c) return onChange(null);
            const first = eligibleControllers[0];
            if (!first) return;
            const op = operatorsFor(first.field.type)[0].value;
            onChange({ fieldId: first.field.id, operator: op, value: "" });
          }}
        />
        <GitBranch className="h-3.5 w-3.5" />
        <span className="font-medium">Show this field only if…</span>
        {eligibleControllers.length === 0 && <span className="text-muted-foreground">(add a question above first)</span>}
      </label>
      {enabled && condition && ctrl && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            value={condition.fieldId}
            onChange={(e) => {
              const f = eligibleControllers.find((c) => c.field.id === e.target.value);
              if (!f) return;
              onChange({ fieldId: f.field.id, operator: operatorsFor(f.field.type)[0].value, value: "" });
            }}
          >
            {eligibleControllers.map((c) => (
              <option key={c.field.id} value={c.field.id}>Q{c.index + 1}: {c.field.label.slice(0, 40)}</option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            value={condition.operator}
            onChange={(e) => onChange({ ...condition, operator: e.target.value as typeof condition.operator })}
          >
            {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {needsValue && (
            ctrl.field.type === "dropdown" || ctrl.field.type === "checkboxes" || ctrl.field.type === "yes_no" ? (
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                value={String(condition.value ?? "")}
                onChange={(e) => onChange({ ...condition, value: e.target.value })}
              >
                <option value="">Select…</option>
                {(ctrl.field.type === "yes_no" ? ["Yes", "No"] : (ctrl.field.options ?? [])).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <Input
                type={ctrl.field.type === "number" || ctrl.field.type === "rating" ? "number" : "text"}
                value={String(condition.value ?? "")}
                onChange={(e) => onChange({ ...condition, value: ctrl.field.type === "number" || ctrl.field.type === "rating" ? Number(e.target.value) : e.target.value })}
                className="h-9 text-xs"
                placeholder="Value"
              />
            )
          )}
        </div>
      )}
    </div>
  );
}


export const TYPE_LABEL: Record<FieldType, string> = {
  section: "Section / instructions",
  short_text: "Short text",
  paragraph: "Paragraph",
  dropdown: "Dropdown",
  checkboxes: "Checkboxes",
  yes_no: "Yes / No",
  number: "Number / scale",
  date: "Date",
  time: "Time",
  rating: "Rating",
  signature: "Signature",
  photo: "Photo upload",
  file: "File upload",
  location: "Location (GPS)",
  email: "Email",
  phone: "Phone",
};

export const TYPE_GROUPS: { name: string; types: FieldType[] }[] = [
  { name: "Layout", types: ["section"] },
  { name: "Common", types: ["short_text", "paragraph", "dropdown", "checkboxes", "yes_no", "number", "date", "time"] },
  { name: "More", types: ["rating", "signature", "photo", "file", "location", "email", "phone"] },
];
