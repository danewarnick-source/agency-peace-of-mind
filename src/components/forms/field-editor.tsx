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
        </>
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
