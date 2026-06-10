import { useEffect, useState } from "react";
import type { ShiftRow } from "@/hooks/use-schedule-preview";

// ── Design tokens ported from HIVE-Schedule-Demo-v6.html ──────────────
export const SCHED = {
  navy: "#0B1126",
  gold: "#f5a623",
  teal: "#137182",
  ink: "#0d112b",
  paper: "#f6f7fb",
  card: "#fff",
  line: "#e6e8f0",
  muted: "#6b7280",
  gap: "#e0463e",
  gapBg: "#fdeceb",
  ok: "#1f9d6b",
  okBg: "#e8f6f0",
  warn: "#b8791a",
  warnBg: "#fdf3e3",
  tealBg: "#e6f1f3",
  purple: "#5b4b9e",
  purpleBg: "#eeeafb",
  shadow: "0 1px 2px rgba(11,17,38,.06),0 8px 24px rgba(11,17,38,.06)",
} as const;

export const font: React.CSSProperties = {
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
};

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const fmtMD = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, "0")}${ampm}` : `${h}${ampm}`;
}

// ── Shift type model (customizable via Settings drawer, persisted per-device) ─
export type ShiftType = {
  key: string;        // stable id (lowercase)
  label: string;      // display name
  start: string;      // 24h "HH:MM"
  end: string;        // 24h "HH:MM"
  color: string;      // hex
};

export const DEFAULT_SHIFT_TYPES: ShiftType[] = [
  { key: "morning",   label: "Morning",     start: "06:00", end: "14:00", color: "#137182" },
  { key: "swing",     label: "Swing",       start: "14:00", end: "22:00", color: "#5b4b9e" },
  { key: "overnight", label: "Overnight",   start: "22:00", end: "06:00", color: "#3a3f78" },
  { key: "day",       label: "Day",         start: "09:00", end: "15:00", color: "#b8791a" },
  { key: "support",   label: "1:1 Support", start: "09:00", end: "15:00", color: "#8a5a12" },
  { key: "dsi",       label: "DSI",         start: "09:00", end: "15:00", color: "#1f9d6b" },
  { key: "respite",   label: "Respite",     start: "16:00", end: "20:00", color: "#a14a8a" },
];

/** Read the user's customized shift-type list (or defaults) from localStorage. */
function readShiftTypes(): ShiftType[] {
  if (typeof window === "undefined") return DEFAULT_SHIFT_TYPES;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SHIFT_TYPES;
    const parsed = JSON.parse(raw);
    const list = parsed?.shiftTypes;
    if (Array.isArray(list) && list.length > 0) return list as ShiftType[];
  } catch { /* ignore */ }
  return DEFAULT_SHIFT_TYPES;
}

function inferKey(s: ShiftRow, types: ShiftType[]): string {
  const explicit = (s.shift_type ?? "").toString().trim().toLowerCase();
  if (explicit && types.some((t) => t.key === explicit)) return explicit;
  const code = (s.job_code ?? "").toUpperCase();
  if (code === "DSI") return "dsi";
  if (code === "DSG") return "day";
  if (code.startsWith("RP") || code === "RL6") return "respite";
  const h = new Date(s.starts_at).getHours();
  if (h >= 21 || h < 5) return "overnight";
  if (h >= 14 && h < 21) return "swing";
  if (h >= 5 && h < 11) return "morning";
  return "support";
}

export function shiftAccentHex(s: ShiftRow): string {
  const types = readShiftTypes();
  const k = inferKey(s, types);
  return types.find((t) => t.key === k)?.color ?? SCHED.teal;
}
export function shiftTypeLabel(s: ShiftRow): string {
  const types = readShiftTypes();
  const k = inferKey(s, types);
  return types.find((t) => t.key === k)?.label ?? s.shift_type ?? s.job_code ?? "Shift";
}

// ── Display settings (persisted per-device; logic preserved verbatim) ──
export type ViewMode = "staff" | "client" | "both";
export type Density = "comfortable" | "compact";
export type ColorBy = "shift_type" | "staff";

export type Settings = {
  defaultView: ViewMode;
  startOnAllSites: boolean;
  density: Density;
  colorBy: ColorBy;
  showTimes: boolean;
  showResidentCount: boolean;
  shiftTypes: ShiftType[];
  allowMultipleStaff: boolean;
  requireMatchingCert: boolean;
  overtimeWarning: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  defaultView: "staff",
  startOnAllSites: true,
  density: "comfortable",
  colorBy: "shift_type",
  showTimes: true,
  showResidentCount: true,
  shiftTypes: DEFAULT_SHIFT_TYPES,
  allowMultipleStaff: true,
  requireMatchingCert: true,
  overtimeWarning: true,
};

const SETTINGS_KEY = "hive.schedulePreview.settings";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
  const update = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  return [settings, update] as const;
}
