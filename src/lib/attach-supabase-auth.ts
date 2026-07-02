import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Project-specific bearer attacher.
 *
 * Replaces the generated `attachSupabaseAuth` so we can proactively refresh
 * a near-expired access token before attaching it. Without this, a stale
 * token in localStorage is sent verbatim to `requireSupabaseAuth` and the
 * server rejects with "Unauthorized" even though the user is signed in.
 */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    let session = data.session;

    // If token is missing or expires within 60s, force a refresh.
    const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
    const needsRefresh = !!session && expiresAt - Date.now() < 60_000;
    if (needsRefresh) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session ?? session;
    }

    const token = session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
