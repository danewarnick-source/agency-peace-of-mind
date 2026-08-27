import { TOMMY_ACTIVE_SHIFT } from "../fixtures";

export function useActiveShift() {
  const has = typeof window !== "undefined" ? window.__e2e?.hasActiveShift : false;
  return { data: has ? TOMMY_ACTIVE_SHIFT : null, isLoading: false };
}
