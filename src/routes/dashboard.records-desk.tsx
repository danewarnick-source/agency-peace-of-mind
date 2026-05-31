import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommandCenter } from "./dashboard.command-center";
import { ComplianceDeskWrapped } from "./dashboard.compliance-desk";
import { HostHomeControl } from "./dashboard.host-home-control";

export const Route = createFileRoute("/dashboard/records-desk")({
  head: () => ({ meta: [{ title: "Records Desk — HIVE" }] }),
  component: RecordsDesk,
});

function RecordsDesk() {
  const [tab, setTab] = useState("command-center");
  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="command-center">Command Center</TabsTrigger>
          <TabsTrigger value="evv-timesheets">EVV &amp; Timesheets</TabsTrigger>
          <TabsTrigger value="host-home">Host Home</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
