import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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
      // repeatedly. Non-routing prefs (active org, etc.) are left intact.
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
        clearPortalRoutingState();
        router.invalidate();
      }
      prevUserId = nextUserId;
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      prevUserId = data.session?.user?.id ?? null;
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [queryClient, router]);

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

