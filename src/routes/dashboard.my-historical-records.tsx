// Combined staff-facing entry point for historical imports awaiting the
// staff member's action. The two underlying pages (timesheets confirmation
// and daily-notes attestation) are unchanged — this route just wraps them
// in a Tabs shell and picks a sensible default tab based on what's pending.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueries } from "@tanstack/react-query";
import { Archive } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MyHistoricalTimesheetsPage } from "./dashboard.my-historical-timesheets";
import { MyHistoricalDailyNotesPage } from "./dashboard.my-historical-daily-notes";
import { listMyPendingHistoricalTimesheets } from "@/lib/historical-timesheet-confirmation.functions";
import { listMyPendingHistoricalDailyNotes } from "@/lib/historical-daily-note-attestation.functions";

export const Route = createFileRoute("/dashboard/my-historical-records")({
  head: () => ({ meta: [{ title: "Historical records — HIVE" }] }),
  component: MyHistoricalRecordsPage,
});

function MyHistoricalRecordsPage() {
  const listTs = useServerFn(listMyPendingHistoricalTimesheets);
  const listDn = useServerFn(listMyPendingHistoricalDailyNotes);

  const [tsQ, dnQ] = useQueries({
    queries: [
      { queryKey: ["my-historical-timesheets-pending"], queryFn: () => listTs() },
      { queryKey: ["my-historical-daily-notes-pending"], queryFn: () => listDn() },
    ],
  });

  const tsCount = ((tsQ.data as { rows?: unknown[] } | undefined)?.rows ?? []).length;
  const dnCount = ((dnQ.data as { rows?: unknown[] } | undefined)?.rows ?? []).length;

  const [tab, setTab] = useState<"timesheets" | "daily-notes">("timesheets");
  const [defaulted, setDefaulted] = useState(false);

  // Set the default tab exactly once, after both counts have settled.
  useEffect(() => {
    if (defaulted) return;
    if (tsQ.isLoading || dnQ.isLoading) return;
    if (tsCount === 0 && dnCount > 0) setTab("daily-notes");
    else setTab("timesheets");
    setDefaulted(true);
  }, [defaulted, tsQ.isLoading, dnQ.isLoading, tsCount, dnCount]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <header className="flex items-center gap-2">
        <Archive className="h-5 w-5 text-amber-700" />
        <h1 className="text-xl font-semibold">Historical Records</h1>
      </header>
      <p className="text-sm text-muted-foreground">
        Past entries an admin imported from another platform and submitted to you. Switch between timesheets and daily
        notes below — each one is signed off individually.
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "timesheets" | "daily-notes")}>
        <TabsList>
          <TabsTrigger value="timesheets" className="gap-2">
            Timesheets
            {tsCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{tsCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="daily-notes" className="gap-2">
            Daily Notes
            {dnCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{dnCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timesheets" className="mt-4">
          <MyHistoricalTimesheetsPage />
        </TabsContent>
        <TabsContent value="daily-notes" className="mt-4">
          <MyHistoricalDailyNotesPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
