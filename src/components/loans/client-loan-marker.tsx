import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HandCoins } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { getClientLoanMarkers } from "@/lib/client-loans.functions";

/**
 * Tiny admin-only marker shown on a client profile when that client has at
 * least one loan with the org. Shows only that one exists — no amounts/terms.
 * Returns null for non-admins (markers fn returns []) or no loans.
 */
export function ClientLoanMarker({ clientId }: { clientId: string }) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const isAdminCapable = org?.role === "admin" || org?.role === "super_admin";
  const fetchMarkers = useServerFn(getClientLoanMarkers);
  const q = useQuery({
    enabled: !!orgId && isAdminCapable,
    queryKey: ["loan-markers", orgId],
    queryFn: () => fetchMarkers({ data: { organization_id: orgId! } }),
    staleTime: 60_000,
  });
  if (!isAdminCapable) return null;
  const has = (q.data ?? []).find((m) => m.client_id === clientId);
  if (!has) return null;
  return (
    <Link
      to="/dashboard/client-loans"
      className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300"
      title="This client has a loan with the company. Admin-only — manage in Client Loans."
    >
      <HandCoins className="h-3 w-3" /> Client Loan
    </Link>
  );
}
