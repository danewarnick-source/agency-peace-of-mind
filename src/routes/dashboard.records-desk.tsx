import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight } from "lucide-react";
import { CommandCenter } from "./dashboard.command-center";
import { ComplianceDeskWrapped } from "./dashboard.compliance-desk";
import { HostHomeControl } from "./dashboard.host-home-control";
import { AuditZone } from "@/components/audit-zone/audit-zone";
import { TrainingRecordsAdmin } from "@/components/audit-zone/training-records-admin";
import { TrainingContentAdmin } from "@/components/audit-zone/training-content-admin";

const recordsDeskSearch = z.object({
  tab: z
    .enum(["command-center", "evv-timesheets", "host-home", "audit-zone", "training-records", "training-content", "forms"])
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
          <TabsTrigger value="training-content">Training Content</TabsTrigger>
          <TabsTrigger value="audit-zone">Audit Zone</TabsTrigger>
          <TabsTrigger value="forms">Forms</TabsTrigger>
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
        <TabsContent value="training-content" className="mt-4">
          <TrainingContentAdmin />
        </TabsContent>
        <TabsContent value="audit-zone" className="mt-4">
          <AuditZone />
        </TabsContent>
        <TabsContent value="forms" className="mt-4">
          <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Custom Forms</h2>
              <p className="text-sm text-muted-foreground">
                Build forms, assign them to staff, and review submissions.
              </p>
            </div>
            <Link to="/dashboard/forms">
              <Button className="min-h-[40px]">Open Forms <ArrowRight className="ml-1 h-4 w-4" /></Button>
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

