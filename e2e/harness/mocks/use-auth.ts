import { STAFF_USER } from "../fixtures";

export function useAuth() {
  return {
    user: STAFF_USER,
    session: { user: STAFF_USER },
    loading: false,
  };
}
