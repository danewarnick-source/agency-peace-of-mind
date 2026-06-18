import { useMemo } from "react";
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
        <p className="text-xs text-muted-foreground mt-1">
          Includes completions from both the Courses module and the Training module.
        </p>
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

type ModuleProgressRow = {
  user_id: string;
  module_id: string;
  is_completed: boolean;
  completed_at: string | null;
  training_modules: { title: string; category: string | null } | null;
};

function StandardReports() {
  const { data: org } = useCurrentOrg();

  // Training reports (1–3) come from course_assignments…
  const { data: assigns } = useQuery({
    enabled: !!org,
    queryKey: ["report-assignments", org?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_assignments")
        .select("status, progress, due_date, completed_at, courses(title, category), user_id")
        .eq("organization_id", org!.organization_id);
      return data ?? [];
    },
  });

  const { data: moduleProgress } = useQuery({
    enabled: !!org,
    queryKey: ["report-module-progress", org?.organization_id],
    queryFn: async () => {
      // Org admins/managers can read training progress for all active members of
      // their org via RLS policy "org admins read member training progress"
      // (user_training_progress.user_id -> organization_members). Employees read
      // only their own rows. No org filter is applied here — the table has no
      // organization_id column; scoping is enforced entirely by RLS.
      const { data } = await supabase
        .from("user_training_progress")
        .select("user_id, module_id, is_completed, completed_at, training_modules(title, category)")
        .eq("is_completed", true)
        .order("completed_at", { ascending: false });
      return data ?? [];
    },
  });

  const progressUserIds = useMemo(
    () => [...new Set((moduleProgress ?? []).map((r: any) => r.user_id))],
    [moduleProgress],
  );

  const { data: progressProfiles } = useQuery({
    enabled: progressUserIds.length > 0,
    queryKey: ["report-progress-profiles", progressUserIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", progressUserIds);
      return data ?? [];
    },
  });

  const progressNameMap = useMemo(
    () =>
      new Map(
        (progressProfiles ?? []).map((p) => [
          p.id,
          p.full_name ?? p.email ?? p.id.slice(0, 8),
        ]),
      ),
    [progressProfiles],
  );

  // …while Certification Renewals comes from external_certifications (uploaded
  // staff credentials with an expiry), a completely different dataset.
  const { data: certs } = useQuery({
    enabled: !!org,
    queryKey: ["report-external-certs", org?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("external_certifications")
        .select("user_id, cert_name, cert_type, status, expires_at, issuer")
        .eq("organization_id", org!.organization_id)
        .not("expires_at", "is", null);
      return data ?? [];
    },
  });

  const courseTitle = (a: { courses: unknown }) =>
    (a.courses as { title: string } | null)?.title ?? "";
  const courseCategory = (a: { courses: unknown }) =>
    (a.courses as { category: string } | null)?.category ?? "";

  const moduleTitle = (m: { training_modules: unknown }) =>
    (m.training_modules as { title: string } | null)?.title ?? "";
  const moduleCategory = (m: { training_modules: unknown }) =>
    (m.training_modules as { category: string } | null)?.category ?? "";

  const download = (
    filename: string,
    headers: string[],
    rows: Array<Array<string | number | null>>,
  ) => {
    const all = [headers, ...rows];
    const csv = all
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  const today = new Date().toISOString().slice(0, 10);

  // 1) Compliance Summary — every training assignment + module completions.
  const exportComplianceSummary = () => {
    const list = assigns ?? [];
    const courseRows = list.map((a) => [
      a.user_id, courseTitle(a), courseCategory(a),
      a.status, a.progress, a.due_date ?? "", a.completed_at ?? "", "Courses module",
    ]);
    const moduleRows = (moduleProgress ?? []).map((r) => {
      const row = r as unknown as ModuleProgressRow;
      return [
        progressNameMap.get(row.user_id) ?? row.user_id,
        row.training_modules?.title ?? row.module_id,
        row.training_modules?.category ?? "",
        "completed",
        100,
        "",
        row.completed_at ?? "",
        "Training module",
      ];
    });
    const allRows = [...courseRows, ...moduleRows];
    if (!allRows.length) return toast.error("No training assignments to export yet");
    download(
      "compliance-summary",
      ["user_id", "course", "category", "status", "progress", "due_date", "completed_at", "source"],
      allRows,
    );
  };

  // 2) Training Completion — only completed assignments.
  const exportTrainingCompletion = () => {
    const list = (assigns ?? []).filter((a) => a.status === "completed" || !!a.completed_at);
    const fromCourses = list
      .filter((a) => a.status === "completed")
      .map((a) => ({
        source: "Courses module",
        title: courseTitle(a),
        category: courseCategory(a),
        completed_at: a.completed_at ?? "",
        user_id: a.user_id ?? "",
      }));

    const fromModules = (moduleProgress ?? []).map((r) => {
      const row = r as unknown as ModuleProgressRow;
      return {
        source: "Training module",
        title: row.training_modules?.title ?? row.module_id,
        category: row.training_modules?.category ?? "",
        completed_at: row.completed_at ?? "",
        user_id: progressNameMap.get(row.user_id) ?? row.user_id,
      };
    });

    const all = [...fromCourses, ...fromModules];
    if (!all.length) return toast.error("No completed training to export yet.");
    download(
      "training-completion",
      ["source", "title", "category", "completed_at", "user_id"],
      all.map((r) => [r.source, r.title, r.category, r.completed_at, r.user_id]),
    );
  };

  // 3) Overdue Training — past the due date and not yet completed.
  const exportOverdueTraining = () => {
    const list = (assigns ?? []).filter((a) => {
      if (a.status === "completed" || a.completed_at) return false;
      if (a.status === "overdue") return true;
      return !!a.due_date && a.due_date.slice(0, 10) < today;
    });
    if (!list.length) return toast.error("No overdue training to export — nothing is past due");
    download(
      "overdue-training",
      ["user_id", "course", "category", "status", "due_date", "progress"],
      list.map((a) => [
        a.user_id, courseTitle(a), courseCategory(a), a.status, a.due_date ?? "", a.progress,
      ]),
    );
  };

  // 4) Module Completions — completions recorded in user_training_progress.
  const exportModuleCompletions = () => {
    const list = moduleProgress ?? [];
    if (!list.length) return toast.error("No module completions to export yet");
    download(
      "module-completions",
      ["staff", "module_id", "module_title", "category", "completed_at"],
      list.map((m) => [
        progressNameMap.get(m.user_id) ?? m.user_id, m.module_id, moduleTitle(m), moduleCategory(m), m.completed_at ?? "",
      ]),
    );
  };

  // 5) Certification Renewals — external certs expiring within the next 90 days.
  const exportCertificationRenewals = () => {
    const startMs = Date.now();
    const horizonMs = startMs + 90 * 24 * 60 * 60 * 1000;
    const list = (certs ?? []).filter((c) => {
      if (!c.expires_at) return false;
      const t = new Date(c.expires_at).getTime();
      return isFinite(t) && t >= startMs && t <= horizonMs;
    });
    if (!list.length) return toast.error("No certifications expiring in the next 90 days");
    download(
      "certification-renewals",
      ["user_id", "certification", "type", "status", "expires_at", "issuer"],
      list.map((c) => [
        c.user_id, c.cert_name ?? "", c.cert_type, c.status, c.expires_at ?? "", c.issuer ?? "",
      ]),
    );
  };

  const reports = [
    { name: "Compliance Summary", desc: "All training assignments with status and progress.", onExport: exportComplianceSummary },
    { name: "Training Completion", desc: "Completed courses across the organization.", onExport: exportTrainingCompletion },
    { name: "Module Completions", desc: "Individual module completions recorded during training.", onExport: exportModuleCompletions },
    { name: "Overdue Training", desc: "Assignments past their due date.", onExport: exportOverdueTraining },
    { name: "Certification Renewals", desc: "Certificates expiring in the next 90 days.", onExport: exportCertificationRenewals },
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
          <Button variant="outline" size="sm" onClick={r.onExport}>
            <FileDown className="mr-2 h-3.5 w-3.5" /> Download CSV
          </Button>
        </div>
      ))}
    </div>
  );
}
