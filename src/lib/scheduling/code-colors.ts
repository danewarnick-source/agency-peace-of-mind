// Service-code → color-family map for the DSPD scheduler.
// Used everywhere a shift is rendered (cards, coverage bars, chips, NECTAR suggestions).
// Colors live as Tailwind class tokens so dark mode + theming behave; we never
// hardcode hex values into components.

export type CodeFamily =
  | "residential"
  | "supported_living"
  | "day_supports"
  | "employment"
  | "respite"
  | "other";

const FAMILY_BY_CODE: Record<string, CodeFamily> = {
  // Residential
  HHS: "residential", RHS: "residential", PPS: "residential", ELS: "residential",
  // Supported Living
  SLH: "supported_living", SLN: "supported_living", CMP: "supported_living", CMS: "supported_living",
  // Day Supports
  DSI: "day_supports", DSG: "day_supports", DSP: "day_supports", EPR: "day_supports",
  // Employment
  SEI: "employment", SJD: "employment", SEC: "employment", SED: "employment", SEE: "employment",
  // Respite
  RP2: "respite", RP3: "respite", RP4: "respite", RP5: "respite", RPS: "respite",
};

export function familyForCode(code?: string | null): CodeFamily {
  if (!code) return "other";
  return FAMILY_BY_CODE[code.toUpperCase()] ?? "other";
}

// Hourly vs daily-unit distinction (used by Add 1:1 Segment and conflict engine).
const DAILY_CODES = new Set(["HHS", "RHS", "DSG", "RP4", "RP5"]);
export function isDailyCode(code?: string | null) {
  return !!code && DAILY_CODES.has(code.toUpperCase());
}
export function isHourlyCode(code?: string | null) {
  return !!code && !DAILY_CODES.has(code.toUpperCase());
}

// Required age threshold per code (HHS staff must be ≥21).
export function minStaffAgeForCode(code?: string | null): number {
  return code?.toUpperCase() === "HHS" ? 21 : 18;
}

// Recommended max duration (hours) for service codes. Used for soft "unusual
// duration" warnings on the create dialog, not as a hard block.
export function maxRecommendedHours(code?: string | null): number | null {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === "DSI") return 6;   // 1:1 day supports — atomic visit
  if (c === "SEI") return 6;
  if (c === "DSG") return 8;
  return null;
}

// Semantic Tailwind class bundles for each family. Components import these
// instead of choosing colors directly.
export const FAMILY_CLASSES: Record<CodeFamily, {
  bg: string; bgSoft: string; border: string; text: string; ring: string; bar: string;
}> = {
  residential: {
    bg: "bg-teal-500",   bgSoft: "bg-teal-50",   border: "border-teal-500",
    text: "text-teal-700", ring: "ring-teal-500", bar: "bg-teal-500",
  },
  supported_living: {
    bg: "bg-sky-500",    bgSoft: "bg-sky-50",    border: "border-sky-500",
    text: "text-sky-700",  ring: "ring-sky-500",  bar: "bg-sky-500",
  },
  day_supports: {
    bg: "bg-emerald-500", bgSoft: "bg-emerald-50", border: "border-emerald-500",
    text: "text-emerald-700", ring: "ring-emerald-500", bar: "bg-emerald-500",
  },
  employment: {
    bg: "bg-violet-500", bgSoft: "bg-violet-50", border: "border-violet-500",
    text: "text-violet-700", ring: "ring-violet-500", bar: "bg-violet-500",
  },
  respite: {
    bg: "bg-pink-500",   bgSoft: "bg-pink-50",   border: "border-pink-500",
    text: "text-pink-700", ring: "ring-pink-500", bar: "bg-pink-500",
  },
  other: {
    bg: "bg-slate-500",  bgSoft: "bg-slate-50",  border: "border-slate-500",
    text: "text-slate-700", ring: "ring-slate-500", bar: "bg-slate-500",
  },
};

export function classesForCode(code?: string | null) {
  return FAMILY_CLASSES[familyForCode(code)];
}

// Semantic CSS variable names per family (defined in src/styles.css).
// Use via `style={{ color: \`var(${cssVarForCode(code)})\` }}` when Tailwind
// classes aren't expressive enough (e.g. coverage-bar gradient stops).
export const FAMILY_VARS: Record<CodeFamily, string> = {
  residential: "--sched-residential",
  supported_living: "--sched-supported-living",
  day_supports: "--sched-day-supports",
  employment: "--sched-employment",
  respite: "--sched-respite",
  other: "--sched-other",
};
export function cssVarForCode(code?: string | null): string {
  return FAMILY_VARS[familyForCode(code)];
}
