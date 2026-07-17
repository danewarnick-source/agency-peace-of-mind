export type EmarStatus = "self_administered" | "refused" | "omitted" | "missed" | "loa";

export function normalizeEmarStatus(raw: string): EmarStatus {
  switch (raw.toLowerCase()) {
    case "administered":
    case "passed":
    case "self_administered":
      return "self_administered";
    case "held":
    case "omitted":
      return "omitted";
    case "refused":
      return "refused";
    case "missed":
      return "missed";
    case "loa":
      return "loa";
    default:
      return "self_administered";
  }
}

export const EMAR_STATUS_LABELS: Record<EmarStatus, string> = {
  self_administered: "Observed",
  refused: "Refused",
  omitted: "Omitted",
  missed: "Missed",
  loa: "LOA",
};
