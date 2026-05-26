// Utah DHHS / Medicaid service type codes used for EVV billing.
export const EVV_SERVICE_CODES = [
  { code: "PCS", label: "PCS — Personal Care Services" },
  { code: "MHC", label: "MHC — Habilitation (Community)" },
  { code: "SLN", label: "SLN — Supported Living" },
  { code: "DSG", label: "DSG — Day Program / Day Support Group" },
  { code: "HHS", label: "HHS — Host Home Daily" },
  { code: "RHS", label: "RHS — Residential Support (H&S)" },
  { code: "SEI", label: "SEI — Supported Employment" },
] as const;

export type EvvServiceCode = (typeof EVV_SERVICE_CODES)[number]["code"];

export function evvServiceLabel(code: string | null | undefined) {
  return EVV_SERVICE_CODES.find((c) => c.code === code)?.label ?? code ?? "—";
}

/** Pad a Utah Medicaid Member ID to 10 chars (preserve leading zeros). */
export function padMemberId(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  return v.length >= 10 ? v : v.padStart(10, "0");
}
