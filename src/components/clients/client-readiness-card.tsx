// Live readiness card — runs the real queries via clientReadiness and shows
// per-check ✓/✗ status. Used on the client profile and embedded in the
// Smart Import done page.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, ShieldCheck, AlertTriangle } from "lucide-react";
import { clientReadiness, type ReadinessReport } from "@/lib/client-readiness.functions";

type CheckRow = {
  key: keyof Omit<ReadinessReport, "isLive">;
  label: string;
  fixHref: string;
  fixLabel: string;
};

const CHECKS = (clientId: string): CheckRow[] => [
  { key: "schedulable", label: "Has a clockable service code", fixHref: `/dashboard/clients/${clientId}?tab=codes`, fixLabel: "Add billing code" },
  { key: "hasStaff", label: "At least one staff assigned", fixHref: `/dashboard/clients/${clientId}?tab=caseload`, fixLabel: "Assign staff" },
  { key: "evvReady", label: "Home geocoded for EVV", fixHref: `/dashboard/clients/${clientId}?tab=overview`, fixLabel: "Confirm home" },
  { key: "billable", label: "Rate & units set on at least one code", fixHref: `/dashboard/clients/${clientId}?tab=codes`, fixLabel: "Set rate" },
  { key: "guardianValid", label: "Guardian state valid", fixHref: `/dashboard/clients/${clientId}?tab=overview`, fixLabel: "Confirm guardian" },
  { key: "goalsPresent", label: "PCSP goals captured", fixHref: `/dashboard/clients/${clientId}?tab=plan`, fixLabel: "Add goals" },
];

export function useClientReadiness(clientId: string) {
  const fn = useServerFn(clientReadiness);
  return useQuery({
    queryKey: ["client-readiness", clientId],
    queryFn: () => fn({ data: { clientId } }) as Promise<ReadinessReport>,
  });
}

export function ClientReadinessCard({ clientId }: { clientId: string }) {
  const q = useClientReadiness(clientId);
  if (q.isLoading) return null;
  if (q.isError || !q.data) return null;
  const r = q.data;
  const rows = CHECKS(clientId);
  const failing = rows.filter((row) => !r[row.key]);

  return (
    <Card
      className={
        r.isLive
          ? "border-emerald-300/60 bg-emerald-50/30 dark:bg-emerald-950/10"
          : "border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/10"
      }
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          {r.isLive ? (
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          )}
          <CardTitle className="text-base">
            {r.isLive ? "Client is live" : "Needs attention before going live"}
          </CardTitle>
        </div>
        <Badge variant="outline" className={r.isLive ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
          {rows.length - failing.length}/{rows.length} checks
        </Badge>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.map((row) => {
          const ok = r[row.key];
          return (
            <div key={row.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-amber-600" />
                )}
                {row.label}
              </span>
              {!ok && (
                <Link
                  to={row.fixHref}
                  className="text-xs text-primary hover:underline"
                >
                  {row.fixLabel} →
                </Link>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function ClientLiveBadge({ clientId }: { clientId: string }) {
  const q = useClientReadiness(clientId);
  if (q.isLoading || q.isError || !q.data) {
    return <Badge variant="outline">checking…</Badge>;
  }
  if (q.data.isLive) {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        live
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
      needs attention
    </Badge>
  );
}
