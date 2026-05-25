import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RequireRole } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Clock, ClipboardList, Stethoscope } from "lucide-react";
import { TimesheetsPage } from "./dashboard.timesheets";
import { SubmissionsPage } from "./dashboard.submissions";
import { AuditPage } from "./dashboard.admin.emar-audit";

export const Route = createFileRoute("/dashboard/compliance-desk")({
  head: () => ({ meta: [{ title: "Compliance Desk — Care Academy" }] }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <ComplianceDeskPage />
    </RequireRole>
  ),
});

type Tab = "timesheets" | "logs" | "emar";

function ComplianceDeskPage() {
  const [tab, setTab] = useState<Tab>("timesheets");

  const tabs: { id: Tab; label: string; icon: typeof Clock }[] = [
    { id: "timesheets", label: "⏳ Timesheets", icon: Clock },
    { id: "logs", label: "📋 Progress Note Logs", icon: ClipboardList },
    { id: "emar", label: "🩺 Master eMAR Audits", icon: Stethoscope },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" /> Compliance Desk
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Consolidated administrative review hub for payroll timesheets, daily progress notes, and medication audits.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <Button
              key={t.id}
              variant={active ? "default" : "ghost"}
              onClick={() => setTab(t.id)}
              className="flex-1 min-w-[180px] justify-center gap-2"
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Button>
          );
        })}
      </div>

      <div>
        {tab === "timesheets" && <TimesheetsPage />}
        {tab === "logs" && <SubmissionsPage />}
        {tab === "emar" && <AuditPage />}
      </div>
    </div>
  );
}
