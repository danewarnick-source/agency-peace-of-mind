/**
 * Legacy Company Overview prefs — settings still reads these keys.
 * The Command Center overview UI was deleted in Step 10.
 */

const CARD_KEYS = ["greeting", "kpis", "attention", "celebrations", "billing"] as const;
type CardKey = (typeof CARD_KEYS)[number];
const STORAGE_KEY = "hive.company-overview.cards.v1";

export function getOverviewPrefs(): { visible: Record<CardKey, boolean>; order: CardKey[] } {
  if (typeof window === "undefined") {
    return {
      visible: Object.fromEntries(CARD_KEYS.map((k) => [k, true])) as Record<CardKey, boolean>,
      order: [...CARD_KEYS],
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("none");
    const parsed = JSON.parse(raw) as { visible?: Record<string, boolean>; order?: string[] };
    const visible = Object.fromEntries(
      CARD_KEYS.map((k) => [k, parsed.visible?.[k] !== false]),
    ) as Record<CardKey, boolean>;
    const order = (parsed.order ?? []).filter((k): k is CardKey =>
      (CARD_KEYS as readonly string[]).includes(k),
    );
    for (const k of CARD_KEYS) if (!order.includes(k)) order.push(k);
    return { visible, order };
  } catch {
    return {
      visible: Object.fromEntries(CARD_KEYS.map((k) => [k, true])) as Record<CardKey, boolean>,
      order: [...CARD_KEYS],
    };
  }
}

export function saveOverviewPrefs(prefs: { visible: Record<CardKey, boolean>; order: CardKey[] }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export const OVERVIEW_CARDS: { key: CardKey; label: string; description: string }[] = [
  { key: "greeting", label: "NECTAR daily brief", description: "Templated brief built from today's live counts" },
  { key: "kpis", label: "Health KPIs", description: "Audit readiness, EVV, documentation, credentials, compliance" },
  { key: "attention", label: "Needs you today", description: "Operational to-dos with deep links" },
  { key: "celebrations", label: "Worth celebrating", description: "Anniversaries, certifications, streaks" },
  { key: "billing", label: "Billing & payroll snapshot", description: "Admin/billing roles only" },
];
