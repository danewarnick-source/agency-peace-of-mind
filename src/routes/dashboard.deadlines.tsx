import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlarmClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionRequiredQueue } from "@/hooks/use-action-required-queue";

/**
 * Legacy Deadlines page — consolidated into Compliance → Action Required.
 * Keep this route file so old bookmarks resolve without a 404.
 */
export const Route = createFileRoute("/dashboard/deadlines")({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/company-obligations",
      search: { tab: "action-required" },
      replace: true,
    });
  },
});

/** Compact card for the Home dashboard — now mirrors Action Required counts. */
export function DeadlinesHomeCard() {
  const { totalCount, sections, isLoading } = useActionRequiredQueue();
  const overdue =
    sections.find((s) => s.id === "overdue_obligations")?.items.length ?? 0;
  const dueSoon = Math.max(0, totalCount - overdue);

  const counts = useMemo(
    () => ({ overdue, dueSoon, total: totalCount }),
    [overdue, dueSoon, totalCount],
  );

  return (
    <Link to="/dashboard/company-obligations" search={{ tab: "action-required" }} className="block">
      <Card className="transition hover:border-[var(--hive-ink)]/40 hover:shadow-[var(--shadow-card)]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <AlarmClock className="h-4 w-4 text-[var(--hive-ink)]" />
            Action required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-6">
            <div>
              <div
                className={`text-2xl font-bold ${counts.overdue > 0 ? "text-rose-600" : "text-foreground"}`}
              >
                {isLoading ? "—" : counts.overdue}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Overdue
              </div>
            </div>
            <div>
              <div
                className={`text-2xl font-bold ${counts.total > 0 ? "text-amber-600" : "text-foreground"}`}
              >
                {isLoading ? "—" : counts.total}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Total open
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
