import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getUiDismissals, dismissUiPref } from "@/lib/ui-dismissals.functions";

/**
 * Per-user, DB-persisted one-time dismissal of a UI hint (banner, etc).
 *
 *  - `ready`     — the dismissal set has loaded (avoids a flash before we
 *                  know whether the banner was already dismissed).
 *  - `dismissed` — true once dismissed (DB-backed, or in-session if the
 *                  handoff table doesn't exist yet).
 *  - `dismiss()` — optimistically hides + persists.
 */
export function useUiDismissal(prefKey: string) {
  const qc = useQueryClient();
  const getFn = useServerFn(getUiDismissals);
  const dismissFn = useServerFn(dismissUiPref);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  const q = useQuery({
    queryKey: ["ui-dismissals"],
    queryFn: () => getFn(),
    staleTime: 5 * 60_000,
  });

  const dismissed = sessionDismissed || (q.data ?? []).includes(prefKey);

  const dismiss = async () => {
    setSessionDismissed(true);
    try {
      await dismissFn({ data: { prefKey } });
      qc.invalidateQueries({ queryKey: ["ui-dismissals"] });
    } catch {
      /* in-session hide already applied */
    }
  };

  return { ready: !q.isLoading, dismissed, dismiss };
}
