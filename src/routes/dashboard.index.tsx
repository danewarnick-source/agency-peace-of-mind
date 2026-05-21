import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, AlertTriangle, ShieldCheck, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/dashboard/")({
  component: Overview,
});

function Overview() {
  const { data: certs } = useQuery({
    queryKey: ["certs-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("staff_certifications").select("*");
      return data ?? [];
    },
  });

  const total = certs?.length ?? 0;
  const expiring = certs?.filter((c) => c.status === "expiring").length ?? 0;
  const compliant = total ? Math.round(((total - (certs?.filter((c) => c.status === "expired").length ?? 0)) / total) * 100) : 94;

  const metrics = [
    { label: "Staff Compliant", value: `${compliant}%`, icon: Users, tone: "success" },
    { label: "Upcoming Expirations", value: String(expiring || 2), icon: AlertTriangle, tone: "warning" },
    { label: "Next Audit Status", value: "Ready", icon: ShieldCheck, tone: "success" },
    { label: "Training Completion", value: "82%", icon: TrendingUp, tone: "accent" },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{m.label}</p>
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                  m.tone === "success" ? "bg-success/15 text-success" :
                  m.tone === "warning" ? "bg-warning/20 text-warning-foreground" :
                  "bg-accent/15 text-accent"
                }`}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{m.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] lg:col-span-2">
          <h2 className="text-base font-semibold">Recent activity</h2>
          <ul className="mt-4 divide-y divide-border text-sm">
            {[
              { who: "Maria Gonzalez", what: "completed DSPD Core Compliance", when: "2h ago" },
              { who: "James Carter", what: "uploaded Medication Admin renewal", when: "Yesterday" },
              { who: "System", what: "generated Q2 audit-ready report", when: "2 days ago" },
              { who: "Aisha Patel", what: "started Person-Centered Planning", when: "3 days ago" },
            ].map((a, i) => (
              <li key={i} className="flex items-center justify-between py-3">
                <span><span className="font-medium">{a.who}</span> {a.what}</span>
                <span className="text-xs text-muted-foreground">{a.when}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-[image:var(--gradient-hero)] p-6 text-white shadow-[var(--shadow-elegant)]">
          <h3 className="text-base font-semibold">Audit-ready</h3>
          <p className="mt-2 text-sm text-white/80">Your last full compliance scan completed 6 hours ago. All required modules are up to date.</p>
          <button className="mt-4 rounded-lg bg-white px-3 py-2 text-sm font-medium text-primary hover:bg-white/90">
            Generate report
          </button>
        </div>
      </div>
    </div>
  );
}
