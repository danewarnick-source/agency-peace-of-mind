/**
 * Bind special-directions / clinical-alert copy to the client on the page.
 * Catalog templates use [First Name] / [Client Name] placeholders; a stale
 * substitution (or leftover name from another record) must not render.
 */

const PLACEHOLDER_RE =
  /\[(?:client name|first name|last name|name)\]|\{(?:client_name|first_name|last_name|name)\}|\{\{(?:client_name|first_name|last_name|name)\}\}/gi;

export function bindSpecialDirections(
  text: string | null | undefined,
  client: { first_name?: string | null; last_name?: string | null },
): string {
  const raw = (text ?? "").trim();
  if (!raw) return "";
  const first = (client.first_name ?? "").trim();
  const last = (client.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  return raw.replace(PLACEHOLDER_RE, (match) => {
    const key = match.replace(/[[\]{}]/g, "").toLowerCase().replace(/\s+/g, "_");
    if (key === "first_name" || key === "first name") return first || full;
    if (key === "last_name" || key === "last name") return last || full;
    return full || first;
  });
}
