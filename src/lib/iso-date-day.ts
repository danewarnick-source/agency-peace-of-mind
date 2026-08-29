/**
 * Coerce pg Date / ISO / date-only values to YYYY-MM-DD.
 * node-pg returns Date objects for date/timestamptz; PostgREST returns strings.
 * Must never throw — obligation bootstrap calls this on the document path.
 */
export function toIsoDateDay(raw: unknown, depth = 0): string | null {
  try {
    if (depth > 4) return null;
    if (raw == null || raw === "") return null;

    if (raw instanceof Date) {
      if (Number.isNaN(raw.getTime())) return null;
      return raw.toISOString().slice(0, 10);
    }

    if (typeof raw === "number") {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    }

    if (typeof raw === "string") {
      const s = raw.trim();
      if (!s) return null;
      return s.slice(0, 10);
    }

    if (typeof raw !== "object") return null;

    const obj = raw as {
      toISOString?: () => unknown;
      toJSON?: () => unknown;
      valueOf?: () => unknown;
    };

    if (typeof obj.toISOString === "function") {
      const iso = obj.toISOString();
      if (typeof iso === "string" && iso.trim()) return iso.slice(0, 10);
    }
    if (typeof obj.toJSON === "function") {
      const json = obj.toJSON();
      if (json !== raw) return toIsoDateDay(json, depth + 1);
    }
    if (typeof obj.valueOf === "function") {
      const v = obj.valueOf();
      if (v !== raw) return toIsoDateDay(v, depth + 1);
    }

    const asString = String(raw);
    if (/^\d{4}-\d{2}-\d{2}/.test(asString)) return asString.slice(0, 10);
    return null;
  } catch {
    return null;
  }
}
