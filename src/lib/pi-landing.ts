/** Copy and tokens for Provider Interface public marketing. */

export const PI_PRODUCT_NAME = "Provider Interface";
export const PI_PRODUCT_SHORT = "PI";
export const PI_WORDMARK = "PROVIDER INTERFACE";
export const PI_HEADLINE = "The day got smaller.";
export const PI_SUBHEAD = "Go home. It stays standing.";
export const PI_HERO_SUPPORT =
  "People, the schedule, notes already written, trainings, the shop — and Nectar — in one quiet office. Newer providers. The day stays done.";

export const PI_NAVY = "#0b1220";
export const PI_NAVY_RAISED = "#111827";
export const PI_CREAM = "#f3efe6";
export const PI_CREAM_MUTED = "rgba(243, 239, 230, 0.62)";
export const PI_GOLD = "#c9a227";
export const PI_ACTION = "#1e3a5f";

export const PI_PAGE_TITLE = "Provider Interface — Go home. It stays standing.";
export const PI_PAGE_DESCRIPTION =
  "Provider Interface. One quiet office for people, the schedule, notes, trainings, and Nectar. $69 per client / month. $350 minimum. The day stays done.";

export const PI_SIGN_IN = "Sign in";
export const PI_TALK_TO_US = "Talk to us";
export const PI_CTA = "Sign in";

/** Locked public list price. Post these numbers, nothing else. */
export const PI_LIST_PER_CLIENT_DOLLARS = 69;
export const PI_LIST_MINIMUM_DOLLARS = 350;
export const PI_LIST_PRICE_DISPLAY = "$69";
export const PI_LIST_PRICE_UNIT = "per client / month";
export const PI_LIST_MINIMUM_LINE = "$350 / month minimum";
export const PI_LIST_PRICE_LEAD = "The list price is the price.";
export const PI_LIST_PRICE_CONTRAST = "No setup fee. No add-ons for Nectar. Training optional.";
export const PI_LIST_PRICE_INCLUDED =
  "One number. The whole office. People, the schedule, notes already written, trainings in the room, the shop — and Nectar — are in that number. Nothing extra to unlock the rest.";
export const PI_FOUNDING_QUIET = "Founding rates for the first five agencies — talk to us.";
export const PI_SIGNUP_PRICE_LINE = "Plans start at $69 per client / month ($350 minimum).";
export const PI_ENTERPRISE_LINE = "Custom work. No public dollar amount.";
export const PI_PRICING_PAGE_TITLE = "Pricing — Provider Interface";
export const PI_PRICING_PAGE_DESCRIPTION =
  "Provider Interface is $69 per client / month, $350 / month minimum. No setup fee. No add-ons for Nectar. Training optional.";

export const PI_INCLUDED_IN_PRICE = [
  { title: "No setup fee", body: "No onboarding charge to open the office." },
  { title: "Nectar is included", body: "No extra to sit with the day." },
  {
    title: "The office is open",
    body: "People, the schedule, notes, trainings, the shop — nothing left to unlock.",
  },
] as const;

export const PI_TRAINING_ADDONS = [
  { name: "CPR / First Aid", price: "$100" },
  { name: "30-day", price: "$75" },
  { name: "Mandt", price: "$200" },
  { name: "Pack", price: "$300" },
] as const;

/** Words that must not appear on public marketing. Nectar is required. */
export const PI_FORBIDDEN_MARKETING = [
  "Hive Certify",
  "Ask Hive",
  "honeycomb",
  "Connecteam",
  "Relias",
  "Compass",
  "EVV",
  "timeclock",
  "DSPD",
  "Scope of Work",
  "GIV",
  "givhealthcare",
] as const;

/** Old public prices and frames that must not reappear on marketing surfaces. */
export const PI_FORBIDDEN_PUBLIC_PRICES = [
  "$125",
  "$500",
  "$79",
  "$109",
  "$99",
  "20% off",
  "/ staff",
  "per staff",
  "1–19",
  "20–49",
  "50+",
  "True North Supports stays free",
  "True North Supports stays $0",
  "True North stays free",
] as const;

export const PI_WHAT_YOU_GET = [
  {
    title: "Sunday-night dread, gone",
    body: "The week is already standing when you close the laptop. You are not starting from a blank page on Monday.",
  },
  {
    title: "Peace of mind",
    body: "One quiet office. The day stays done. You can leave.",
  },
  {
    title: "Ease for newer providers",
    body: "The office does the remembering. People, the schedule, notes, trainings — already in one place.",
  },
  {
    title: "Nectar sits with you",
    body: "A quiet second set of eyes while the day is happening. Drafts stay drafts until you say they are done.",
  },
  {
    title: "Notes already written",
    body: "The day writes itself as it happens. Nothing to reconstruct tonight.",
  },
  {
    title: "The shop, in the same room",
    body: "Packets and trainings next to the people they belong to. Not a second storefront.",
  },
] as const;

export const PI_PRODUCT_SHOTS = [
  {
    id: "nectar",
    title: "Nectar",
    kicker: "Sits with the day",
    body: "Nectar reads the room you already keep. It offers a sentence, a flag, a next step. You stay in charge.",
  },
  {
    id: "people",
    title: "People",
    kicker: "Everyone, one list",
    body: "The people you serve and the staff who show up. Open a name. The rest of the office is already there.",
  },
  {
    id: "schedule",
    title: "Schedule",
    kicker: "It holds",
    body: "Coverage you can see. A week that does not fall over when you close the laptop.",
  },
  {
    id: "notes",
    title: "Notes already written",
    kicker: "The day, kept",
    body: "What happened is already on the record. Go home. You are not starting from a blank page.",
  },
  {
    id: "trainings",
    title: "Trainings and packets",
    kicker: "Ready before you need it",
    body: "Assigned work, finished work, the packet you would otherwise assemble by hand — already in the office.",
  },
  {
    id: "shop",
    title: "The shop",
    kicker: "In the same room",
    body: "Seats and packets next to the people they belong to. One office, not a second storefront.",
  },
] as const;

export const PI_PRICING_INTRO = PI_LIST_PRICE_INCLUDED;

export const PI_CTA_HEADLINE = "The office stays standing.";
export const PI_CTA_BODY = "Sign in when you are ready. The day can get smaller.";
