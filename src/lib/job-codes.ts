export const JOB_CODES = [
  { code: "DSI", label: "DSI — Day Support Institutional" },
  { code: "SLN", label: "SLN — Supported Living No-Night" },
  { code: "SLH", label: "SLH — Supported Living Hourly" },
  { code: "DSG", label: "DSG — Day Support Group" },
  { code: "SEI", label: "SEI — Supported Employment Individual" },
  { code: "RHS", label: "RHS — Residential Support Health & Safety" },
] as const;

export type JobCode = (typeof JOB_CODES)[number]["code"];

export function jobCodeLabel(code: string | null | undefined) {
  return JOB_CODES.find((j) => j.code === code)?.label ?? code ?? "—";
}
