/**
 * Hide 1056 / client_billing_codes rows whose client_id has no matching
 * clients row. Do not delete those rows. Dane enters real auths — this
 * filter does not invent dates or rates.
 *
 * Live leftovers (keep in DB, skip in UI):
 *   HHS 908a79e6… → client 534ca354…
 *   SLH / HHS / DSI → client 217b8790…
 */

export function uniqueBillingClientIds(
  codes: Array<{ client_id: string | null | undefined }>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of codes) {
    const id = String(row.client_id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function billingCodesForLiveClients<T extends { client_id: string }>(
  codes: T[],
  liveClientIds: Iterable<string>,
): T[] {
  const live =
    liveClientIds instanceof Set ? liveClientIds : new Set(liveClientIds);
  return codes.filter((row) => live.has(row.client_id));
}
