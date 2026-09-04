import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { attachGetSessionBoot } from "@/lib/auth-session-boot";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
}
const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    let prevUserId: string | null | undefined = undefined;
    const clearPortalRoutingState = () => {
      // Routing-only preferences. Anything that decides which dashboard
      // surface the user lands on must NOT survive a logout or an account
      // switch — otherwise a stale `hive_exec` view from the previous
      // session races the fresh executive check on next login and the
      // dashboard shell flips between /dashboard and /dashboard/hive-exec
      // repeatedly. Last-org prefs are cleared by completeClientSignOut.
      try {
        window.localStorage.removeItem("portal-view");
        window.localStorage.removeItem("portal-view-state-code");
        window.localStorage.removeItem("portal-view-state-sub");
        window.dispatchEvent(new Event("portal-view-change"));
      } catch { /* ignore */ }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
      const nextUserId = s?.user?.id ?? null;
      // Whenever the signed-in identity changes (sign in, sign out, switch),
      // drop cached query data so no stale request fires without a bearer token.
      if (prevUserId !== undefined && prevUserId !== nextUserId) {
        queryClient.cancelQueries();
        queryClient.clear();
        // Wipe Portal View on sign-out and account switch so a stale
        // hive_exec from another person cannot trap the next session.
        // Do NOT wipe on sign-in (null → user): honor a stored Admin/Staff
        // choice. Login no longer overwrites those to hive_exec.
        if (prevUserId !== null) {
          clearPortalRoutingState();
        }
        router.invalidate();
      }
      prevUserId = nextUserId;
    });
    // getSession can hang (no reject) on a stalled GoTrue init/refresh.
    // Without catch + timeout, loading stays true and /login never runs.
    const stopBoot = attachGetSessionBoot({
      getSession: () => (supabase as any).auth.getSession(),
      onSession: (s) => {
        setSession(s as Session | null);
        prevUserId = s?.user?.id ?? null;
      },
      onLoadingDone: () => setLoading(false),
    });
    return () => {
      subscription.unsubscribe();
      stopBoot();
    };
  }, [queryClient, router]);

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

