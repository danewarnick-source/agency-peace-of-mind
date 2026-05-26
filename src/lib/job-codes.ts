// Backward-compat shim. The master Utah service code registry now lives in
// `src/lib/evv-codes.ts` (single source of truth; HHS intentionally excluded).
import { EVV_SERVICE_CODES, evvServiceLabel } from "./evv-codes";

export const JOB_CODES = EVV_SERVICE_CODES;
export type JobCode = string;
export const jobCodeLabel = evvServiceLabel;
