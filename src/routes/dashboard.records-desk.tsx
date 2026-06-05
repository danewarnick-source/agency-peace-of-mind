import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommandCenter } from "./dashboard.command-center";
import { ComplianceDeskWrapped } from "./dashboard.compliance-desk";
import { HostHomeControl } from "./dashboard.host-home-control";
import { AuditZone } from "@/components/audit-zone/audit-zone";
import { TrainingRecordsAdmin } from "@/components/audit-zone/training-records-admin";

const recordsDeskSearch = z.object({
  tab: z
    .enum(["command-center", "evv-timesheets", "host-home", "audit-zone", "training-records"])
    .optional(),
  /** Inner Command Center tab (forwarded from deep-links). */
  cc: z.enum(["urgent", "pending", "approved", "analytics", "nectar"]).optional(),
});

export const Route = createFileRoute("/dashboard/records-desk")({
  head: () => ({ meta: [{ title: "Records Desk — HIVE" }] }),
  validateSearch: recordsDeskSearch,
  component: RecordsDesk,
});

function RecordsDesk() {
  const search = useSearch({ from: "/dashboard/records-desk" });
  const navigate = useNavigate({ from: "/dashboard/records-desk" });
  const tab = search.tab ?? "command-center";

  const setTab = (next: string) => {
    navigate({
      search: (prev: z.infer<typeof recordsDeskSearch>) => ({
        ...prev,
        tab: next as z.infer<typeof recordsDeskSearch>["tab"],
      }),
      replace: true,
    });
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="command-center">Command Center</TabsTrigger>
          <TabsTrigger value="evv-timesheets">EVV &amp; Timesheets</TabsTrigger>
          <TabsTrigger value="host-home">Host Home</TabsTrigger>
          <TabsTrigger value="training-records">Training Records</TabsTrigger>
          <TabsTrigger value="audit-zone">Audit Zone</TabsTrigger>
        </TabsList>
        <TabsContent value="command-center" className="mt-4">
          <CommandCenter />
        </TabsContent>
        <TabsContent value="evv-timesheets" className="mt-4">
          <ComplianceDeskWrapped />
        </TabsContent>
        <TabsContent value="host-home" className="mt-4">
          <HostHomeControl />
        </TabsContent>
        <TabsContent value="training-records" className="mt-4">
          <TrainingRecordsAdmin />
        </TabsContent>
        <TabsContent value="audit-zone" className="mt-4">
          <AuditZone />
        </TabsContent>
      </Tabs>
    </div>
  );
}
