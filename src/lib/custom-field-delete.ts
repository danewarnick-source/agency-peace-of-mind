/** Hard-delete chunk size for `custom_field_definitions` `.in("id", …)` calls. */
export const CUSTOM_FIELD_DELETE_CHUNK = 80;

/** Deduped id batches so deletes stay inside PostgREST URL / RLS row limits. */
export function chunkIds(
  ids: string[],
  size: number = CUSTOM_FIELD_DELETE_CHUNK,
): string[][] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  if (!unique.length) return [];
  const out: string[][] = [];
  const step = size > 0 ? size : CUSTOM_FIELD_DELETE_CHUNK;
  for (let i = 0; i < unique.length; i += step) {
    out.push(unique.slice(i, i + step));
  }
  return out;
}

export function customFieldDeleteCopy(labels: string[]): {
  title: string;
  body: string;
} {
  const count = labels.length;
  if (count <= 0) {
    return { title: "Delete custom fields?", body: "Nothing is selected." };
  }
  if (count === 1) {
    const name = labels[0] ?? "this field";
    return {
      title: `Delete "${name}"?`,
      body: `This removes the "${name}" custom field and its values for every client. This cannot be undone.`,
    };
  }
  const listed = labels.slice(0, 5).map((l) => `"${l}"`).join(", ");
  const extra = count > 5 ? ` and ${count - 5} more` : "";
  return {
    title: `Delete ${count} custom fields?`,
    body: `This removes ${listed}${extra} and their values for every client. This cannot be undone.`,
  };
}
