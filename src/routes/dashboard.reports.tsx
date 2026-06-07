import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileDown, FileBarChart } from "lucide-react";
import { toast } from "sonner";

import { RequirePermission } from "@/components/rbac-guard";
import { BehaviorSupportsReport } from "@/components/behavior-support/behavior-supports-report";

export const Route = createFileRoute("/dashboard/reports")({
  component: () => (
    <RequirePermission perm="export_reports">
      <ReportsPage />
    </RequirePermission>
  ),
});

function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Audit-ready reports</h2>
        <p className="text-sm text-muted-foreground">Export compliance evidence as CSV or PDF anytime.</p>
      </div>
      <Tabs defaultValue="standard">
        <TabsList>
          <TabsTrigger value="standard">Standard Reports</TabsTrigger>
          <TabsTrigger value="behavior">Behavior Supports</TabsTrigger>
        </TabsList>
        <TabsContent value="standard" className="mt-4">
          <StandardReports />
        </TabsContent>
        <TabsContent value="behavior" className="mt-4">
          <BehaviorSupportsReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StandardReports() {
  const { data: org } = useCurrentOrg();

  const { data: assigns } = useQuery({
    enabled: !!org,
    queryKey: ["report-data", org?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_assignments")
        .select("status, progress, due_date, completed_at, courses(title, category), user_id")
        .eq("organization_id", org!.organization_id);
      return data ?? [];
    },
  });

  const exportCsv = (name: string) => {
    if (!assigns?.length) return toast.error("Nothing to export yet");
    const rows = [
      ["user_id", "course", "category", "status", "progress", "due_date", "completed_at"],
      ...assigns.map((a) => [
        a.user_id, (a.courses as { title: string } | null)?.title ?? "",
        (a.courses as { category: string } | null)?.category ?? "",
        a.status, String(a.progress), a.due_date ?? "", a.completed_at ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  const reports = [
    { name: "Compliance Summary", desc: "All training assignments with status and progress." },
    { name: "Training Completion", desc: "Completed courses across the organization." },
    { name: "Overdue Training", desc: "Assignments past their due date." },
    { name: "Certification Renewals", desc: "Certificates expiring in the next 90 days." },
  ];

  return (
    <div className="grid gap-3">
      {reports.map((r) => (
        <div key={r.name} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <FileBarChart className="h-5 w-5" />
            </span>
            <div>
              <p className="font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.desc}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportCsv(r.name.toLowerCase().replace(/\s+/g, "-"))}>
            <FileDown className="mr-2 h-3.5 w-3.5" /> Download CSV
          </Button>
        </div>
      ))}
    </div>
  );
}
