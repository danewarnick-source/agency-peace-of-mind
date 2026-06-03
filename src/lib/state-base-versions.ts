// Types for the versioned generic HIVE base template.
// The base template is the state-neutral structure/field set. Each state's
// filled-in template records which base version it was built from, so we can
// flag states that need updating and bring them forward without losing their
// state-specific data.

export type BaseTemplateChangeType = "added" | "removed" | "renamed" | "changed";

export interface BaseTemplateChange {
  type: BaseTemplateChangeType;
  section: string;
  field?: string;
  note?: string;
}

export interface BaseTemplateSectionSchema {
  key: string;
  fields: string[];
}

export interface BaseTemplateSchema {
  sections: BaseTemplateSectionSchema[];
}

export interface BaseTemplateVersion {
  id: string;
  version: number;
  title: string;
  summary: string;
  changelog: BaseTemplateChange[];
  schema: BaseTemplateSchema;
  is_current: boolean;
  released_at: string;
  released_by: string | null;
}

/** Diff two schema snapshots. Returns sections/fields that exist in `next`
 *  but not `prev` (added) and ones in `prev` but not `next` (removed). */
export function diffBaseSchemas(
  prev: BaseTemplateSchema | null,
  next: BaseTemplateSchema,
): { added: BaseTemplateChange[]; removed: BaseTemplateChange[] } {
  const prevMap = new Map<string, Set<string>>();
  for (const s of prev?.sections ?? []) prevMap.set(s.key, new Set(s.fields));
  const nextMap = new Map<string, Set<string>>();
  for (const s of next.sections) nextMap.set(s.key, new Set(s.fields));

  const added: BaseTemplateChange[] = [];
  const removed: BaseTemplateChange[] = [];

  for (const [sec, fields] of nextMap) {
    const before = prevMap.get(sec);
    if (!before) {
      added.push({ type: "added", section: sec, note: "New section" });
      for (const f of fields) added.push({ type: "added", section: sec, field: f });
      continue;
    }
    for (const f of fields) if (!before.has(f)) added.push({ type: "added", section: sec, field: f });
  }
  for (const [sec, fields] of prevMap) {
    const after = nextMap.get(sec);
    if (!after) {
      removed.push({ type: "removed", section: sec, note: "Section removed" });
      continue;
    }
    for (const f of fields) if (!after.has(f)) removed.push({ type: "removed", section: sec, field: f });
  }
  return { added, removed };
}
