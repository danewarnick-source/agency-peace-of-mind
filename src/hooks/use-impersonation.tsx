import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "impersonation_session_v1";
const EVENT_NAME = "impersonation-changed";

export type ImpersonationSession = {
  original_admin_id: string;
  original_admin_name: string;
  original_admin_email: string;
  current_user_id: string;
  current_user_name: string;
  current_user_email: string;
  tenant_id: string | null;
  tenant_name: string | null;
  role: string;
  started_at: string;
};

export function readImpersonation(): ImpersonationSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ImpersonationSession) : null;
  } catch {
    return null;
  }
}

export function startImpersonation(session: ImpersonationSession) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function endImpersonation() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function useImpersonation() {
  const [session, setSession] = useState<ImpersonationSession | null>(() => readImpersonation());

  useEffect(() => {
    const sync = () => setSession(readImpersonation());
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const stop = useCallback(() => endImpersonation(), []);
  return { session, isImpersonating: !!session, stop };
}

/**
 * Decorates an insert/update payload with an `impersonated_by` audit flag when
 * a Super-Admin is currently acting as another user. Use:
 *   supabase.from('foo').insert(withImpersonationMeta({ ... }))
 */
export function withImpersonationMeta<T extends Record<string, unknown>>(payload: T): T {
  const s = readImpersonation();
  if (!s) return payload;
  return { ...payload, impersonated_by: s.original_admin_id } as T;
}
