import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent, type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  sortableKeyboardCoordinates, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { FieldEditor } from "./field-editor";
import { sanitizeConditions, type FormField } from "@/lib/forms-utils";

/** A section "owns" the contiguous fields that follow it until the next section.
 *  Fields before the first section live in an implicit "head" group. */
type Group = { key: string; section: FormField | null; fields: FormField[] };

function computeGroups(fields: FormField[]): Group[] {
  const groups: Group[] = [];
  let current: Group = { key: "__head__", section: null, fields: [] };
  for (const f of fields) {
    if (f.type === "section") {
      if (current.section || current.fields.length > 0) groups.push(current);
      current = { key: f.id, section: f, fields: [] };
    } else {
      current.fields.push(f);
    }
  }
  if (current.section || current.fields.length > 0) groups.push(current);
  return groups;
}

function flattenGroups(groups: Group[]): FormField[] {
  const out: FormField[] = [];
  for (const g of groups) {
    if (g.section) out.push(g.section);
    out.push(...g.fields);
  }
  return out;
}

const GROUP_TONES = [
  "bg-slate-50/60 border-slate-200",
  "bg-amber-50/40 border-amber-200",
  "bg-sky-50/40 border-sky-200",
  "bg-emerald-50/40 border-emerald-200",
  "bg-violet-50/40 border-violet-200",
  "bg-rose-50/40 border-rose-200",
];

export function SortableFields({
  fields, setFields, lastAddedId, onLastAddedConsumed,
}: {
  fields: FormField[];
  setFields: (next: FormField[]) => void;
  lastAddedId?: string | null;
  onLastAddedConsumed?: () => void;
}) {
  const groups = useMemo(() => computeGroups(fields), [fields]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Build a flat sortable id list. Section ids prefixed "sec:", field ids "fld:".
  const itemIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) {
      if (g.section) ids.push(`sec:${g.section.id}`);
      for (const f of g.fields) ids.push(`fld:${f.id}`);
    }
    return ids;
  }, [groups]);

  function moveField(activeFieldId: string, overId: string) {
    // Build flat array of non-section fields with their group keys, plus section markers.
    // Simpler: do array reorder on the flat `fields` array using arrayMove based on
    // resolved indices.
    const aIdx = fields.findIndex((f) => f.id === activeFieldId);
    if (aIdx < 0) return;
    const overKind = overId.startsWith("sec:") ? "sec" : "fld";
    const overRawId = overId.slice(4);
    let targetIdx: number;
    if (overKind === "sec") {
      // Drop onto a section header → place field as FIRST field of that section.
      const secIdx = fields.findIndex((f) => f.id === overRawId);
      if (secIdx < 0) return;
      targetIdx = secIdx + 1;
    } else {
      targetIdx = fields.findIndex((f) => f.id === overRawId);
      if (targetIdx < 0) return;
    }
    // arrayMove handles the index shift correctly.
    const next = arrayMove(fields, aIdx, targetIdx);
    setFields(sanitizeConditions(next));
  }

  function moveSection(activeSectionId: string, overId: string) {
    // Move section block (header + its trailing fields up to next section).
    const gIdx = groups.findIndex((g) => g.section?.id === activeSectionId);
    if (gIdx < 0) return;
    // Determine target group index. If dropping on a section, that's the target group.
    // If dropping on a field, find that field's group.
    let targetGIdx: number;
    if (overId.startsWith("sec:")) {
      const overSecId = overId.slice(4);
      targetGIdx = groups.findIndex((g) => g.section?.id === overSecId);
    } else {
      const overFldId = overId.slice(4);
      targetGIdx = groups.findIndex((g) => g.fields.some((f) => f.id === overFldId));
    }
    if (targetGIdx < 0 || targetGIdx === gIdx) return;
    const reordered = arrayMove(groups, gIdx, targetGIdx);
    setFields(sanitizeConditions(flattenGroups(reordered)));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const aId = String(active.id);
    const oId = String(over.id);
    if (aId.startsWith("sec:")) moveSection(aId.slice(4), oId);
    else moveField(aId.slice(4), oId);
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  // Helpers that map back to original-flat-index for FieldEditor callbacks
  const indexOf = (id: string) => fields.findIndex((f) => f.id === id);

  function update(idx: number, next: FormField) {
    setFields(sanitizeConditions(fields.map((f, i) => (i === idx ? next : f))));
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= fields.length) return;
    const arr = [...fields];
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setFields(sanitizeConditions(arr));
  }
  function remove(idx: number) {
    setFields(sanitizeConditions(fields.filter((_, i) => i !== idx)));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {groups.map((g, gi) => {
            const tone = g.section ? GROUP_TONES[gi % GROUP_TONES.length] : "bg-muted/30 border-dashed border-border";
            return (
              <div key={g.key} className={`rounded-lg border p-2 space-y-2 ${tone}`}>
                {g.section ? (
                  <SortableItem
                    id={`sec:${g.section.id}`}
                    field={g.section}
                    fieldIndex={indexOf(g.section.id)}
                    allFields={fields}
                    onChange={(n) => update(indexOf(g.section!.id), n)}
                    onMoveUp={() => move(indexOf(g.section!.id), -1)}
                    onMoveDown={() => move(indexOf(g.section!.id), 1)}
                    onRemove={() => remove(indexOf(g.section!.id))}
                  />
                ) : (
                  <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Ungrouped (before first section)</p>
                )}
                <div className="space-y-2 pl-3 border-l-2 border-border/60">
                  {g.fields.length === 0 && g.section && (
                    <p className="text-[11px] italic text-muted-foreground px-1">Drop a field here, or add one from the palette.</p>
                  )}
                  {g.fields.map((f) => {
                    const idx = indexOf(f.id);
                    return (
                      <SortableItem
                        key={f.id}
                        id={`fld:${f.id}`}
                        field={f}
                        fieldIndex={idx}
                        allFields={fields}
                        onChange={(n) => update(idx, n)}
                        onMoveUp={() => move(idx, -1)}
                        onMoveDown={() => move(idx, 1)}
                        onRemove={() => remove(idx)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </SortableContext>
      <DragOverlay>{activeId ? <div className="rounded-md border-2 border-primary bg-card/95 px-3 py-2 text-sm shadow-lg">Moving…</div> : null}</DragOverlay>
    </DndContext>
  );
}

function SortableItem({
  id, field, fieldIndex, allFields, onChange, onMoveUp, onMoveDown, onRemove,
}: {
  id: string;
  field: FormField;
  fieldIndex: number;
  allFields: FormField[];
  onChange: (n: FormField) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const eligible = allFields.slice(0, fieldIndex)
    .map((cf, ci) => ({ field: cf, index: ci }))
    .filter((c) => c.field.type !== "section");

  const handle = (
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent cursor-grab active:cursor-grabbing touch-none"
      aria-label="Drag to reorder"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <FieldEditor
      field={field}
      index={fieldIndex}
      eligibleControllers={eligible}
      onChange={onChange}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onRemove={onRemove}
      dragHandle={handle}
      containerRef={setNodeRef}
      containerStyle={style}
      isDragging={isDragging}
    />
  );
}

