/** Same display rule as the client header: never drop a leading-zero ID. */
export function displayMedicaidId(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}
