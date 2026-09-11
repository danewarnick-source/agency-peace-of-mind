/**
 * Compliance spine: clocks live on company_obligations* via the
 * catalog/instance engine (plus explicit Soft Core / hire seeds).
 * Parallel writers (bell bootstrap, nectar_compliance_*, orphan creates)
 * must not mint a second register.
 */

export const ORPHAN_OBLIGATION_CREATE_GONE =
  "410 Gone: obligation creates are retired. Only the Compliance catalog/instance engine can mint clocks.";
