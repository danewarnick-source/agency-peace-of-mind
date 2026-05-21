import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export const Route = createFileRoute("/dashboard/billing")({ component: BillingPage });

function BillingPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <p className="text-sm font-medium text-accent">Current plan</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Growth</h2>
          <span className="text-muted-foreground">· $249/mo · renews June 18</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Up to 75 staff · 23 seats remaining</p>
        <div className="mt-6 flex gap-2">
          <Button variant="outline">Manage seats</Button>
          <Button className="bg-[image:var(--gradient-brand)] text-primary-foreground">Upgrade to Enterprise</Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h3 className="text-base font-semibold">What's included</h3>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {["Full DSPD library", "Automated renewals", "Audit-ready exports", "Priority support", "Custom roles", "Bulk import"].map((f) => (
            <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-accent" /> {f}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
