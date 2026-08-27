import { ORG } from "../fixtures";

export function useCurrentOrg() {
  return { data: ORG, isLoading: false };
}
