/**
 * Public marketing homepage tokens and copy.
 * Isolated from in-app PI_THEME (cream canvas). Do not import this into Admin chrome.
 */

export const PI_HOME_NAVY = "#0a0f1c";
export const PI_HOME_NAVY2 = "#0d1526";
export const PI_HOME_PANEL = "#0f182b";
export const PI_HOME_LINE = "#1f2b44";
export const PI_HOME_INK = "#f4efe3";
export const PI_HOME_INK2 = "#aeb7c9";
export const PI_HOME_INK3 = "#7a8599";
export const PI_HOME_GOLD = "#c4a35a";
export const PI_HOME_GOLD2 = "#d9c284";
export const PI_HOME_OK = "#7fd1a8";
export const PI_HOME_WARN = "#f0b35a";
export const PI_HOME_BAD = "#e88a8a";
export const PI_HOME_PILL_OK = "#1e3a30";
export const PI_HOME_PILL_WARN = "#3a2e1a";
export const PI_HOME_PILL_BAD = "#3a2020";
export const PI_HOME_PILL_MUTE = "#1b2740";
export const PI_HOME_SIGN_IN_BTN = "#f1ecdf";
export const PI_HOME_NAV_BG = "rgba(10,15,28,0.78)";

export const PI_HOME_SERIF =
  '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';
export const PI_HOME_SANS = '"Inter", "Segoe UI", system-ui, sans-serif';

export const PI_HOME_BODY_BG =
  "radial-gradient(900px 600px at 50% 0%, #132038 0%, #0a0f1c 60%)";

export const PI_HOME_MAX_WIDTH = 1120;
export const PI_HOME_BTN_RADIUS = 14;
export const PI_HOME_NAV_BREAKPOINT = 820;
/** Mobile / hero side inset. Shared landing `section { padding: 0 }` must not win. */
export const PI_HOME_GUTTER_PX = 24;

export const PI_HOME_EYEBROW = "Already standing the day you sign in.";
export const PI_HOME_H1_LEAD = "The interface";
export const PI_HOME_H1_TO = "to";
export const PI_HOME_H1_MID = "the contract.";
export const PI_HOME_H1_BUILT = "Built";
export const PI_HOME_H1_FOR = "for";
export const PI_HOME_H1_TAIL = "the people who run it.";
export const PI_HOME_SEE_IT = "See it in 10 minutes";
export const PI_HOME_HOW_NECTAR = "How Nectar works";
export const PI_HOME_HERO_FINE = "$69/client · $350 min";
export const PI_HOME_START_SIGNUP = "Start signup";

/** Locked Utah line — keep as written. Flagged in the PR. */
export const PI_HOME_UTAH_LINE = "Built for Utah Medicaid disability providers";
export const PI_HOME_DSP_CAPTION =
  "Direct support professionals clock in. The office already knows the rest.";

export const PI_HOME_PRICING_KICKER = "Pricing";
export const PI_HOME_PRICING_HEADLINE = "One number. Whole platform.";
export const PI_HOME_PRICING_UNIT = "per client / month";
export const PI_HOME_PRICING_MIN = "$350 / month minimum. No setup fee. No feature tiers.";

export const PI_HOME_FOOTER_HCBS =
  "Operations software for home and community-based services (HCBS) providers. One office for people, the schedule, notes, trainings, and Nectar.";

export const PI_HOME_PRIVACY = "Privacy";
export const PI_HOME_TERMS = "Terms";
export const PI_HOME_CONTACT = "Contact";

export const PI_HOME_NAV = [
  { label: "Nectar", to: "/" as const, hash: "nectar" },
  { label: "Training", to: "/" as const, hash: "training" },
  { label: "Pricing", to: "/" as const, hash: "pricing" },
  { label: "About", to: "/about" as const, hash: undefined },
] as const;

export const PI_HOME_FOOTER_LINKS = [
  { label: PI_HOME_PRIVACY, to: "/privacy" as const },
  { label: PI_HOME_TERMS, to: "/terms" as const },
  { label: PI_HOME_CONTACT, to: "/contact" as const },
] as const;

export const PI_HOME_FEATURES = [
  {
    id: "notes",
    kicker: "Notes",
    title: "Notes already written.",
    body: "Nectar reviews every shift note before staff clock out. It checks the support given and how the person responded — and knows what each service code requires. Staff fix it on the spot, not you later.",
    reverse: false,
  },
  {
    id: "nectar",
    kicker: "Nectar Ask",
    title: "A second set of eyes on the day.",
    body: "Ask Nectar while the day is still happening. It offers a sentence, a flag, a next step. You stay in charge. Drafts stay drafts until you say they are done. Nothing publishes itself.",
    reverse: true,
  },
  {
    id: "training",
    kicker: "Training",
    title: "Trainings in the room.",
    body: "Assigned work, finished work, the packet you would otherwise assemble by hand — already next to the people they belong to. Optional classes are sold separately. The platform has no feature tiers.",
    reverse: false,
  },
] as const;

export const PI_HOME_PHONE_ROWS = [
  { label: "Evening note", value: "Complete", tone: "ok" as const },
  { label: "CPR renewal", value: "12 days", tone: "warn" as const },
  { label: "Auth remaining", value: "Thin", tone: "bad" as const },
  { label: "Coverage", value: "Standing", tone: "ok" as const },
  { label: "30-day course", value: "Assigned", tone: "mute" as const },
] as const;

export const PI_HOME_CHIPS = ["Nectar", "Notes written", "$69"] as const;

export const PI_HOME_ASK = [
  {
    who: "you" as const,
    text: "What does tonight's note still need before Justin's shift can close?",
  },
  {
    who: "nectar" as const,
    text: "Name the goals worked on and how Justin responded. Add whether evening medications were given.",
  },
] as const;

export const PI_HOME_TRAINING_ROWS = [
  { name: "CPR / First Aid", state: "Current", tone: "ok" as const },
  { name: "30-day orientation", state: "In progress", tone: "warn" as const },
  { name: "Mandt", state: "Assigned", tone: "mute" as const },
] as const;

export const PI_PRIVACY_TITLE = "Privacy";
export const PI_PRIVACY_INTRO =
  "This is how Provider Interface LLC treats information you put in the product.";
export const PI_PRIVACY_PARAS = [
  "We use the information you enter to run the office you signed up for — people, the schedule, notes, trainings, and billing. We do not sell it.",
  "Some of that information is protected health information. The Business Associate Agreement on this site is how that is covered.",
  "Questions: use the contact page. The company is Provider Interface LLC.",
] as const;
