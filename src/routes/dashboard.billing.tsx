import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Check, CreditCard } from "lucide-react";

export const Route = createFileRoute("/dashboard/billing")({ component: BillingPage });

function BillingPage() {
  const { data: org } = useCurrentOrg();
  const { data: count } = useQuery({
    enabled: !!org,
    queryKey: ["seat-count", org?.organization_id],
    queryFn: async () => {
      const { count } = await supabase
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org!.organization_id)
        .eq("active", true);
      return count ?? 0;
    },
  });

  const seats = count ?? 0;
  const monthly = seats * 25;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <p className="text-sm font-medium text-accent">Current plan</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Per-employee</h2>
          <span className="text-muted-foreground">· $25 / active employee / month</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {seats} active employee{seats === 1 ? "" : "s"} ·
          <span className="ml-1 font-semibold text-foreground">${monthly}/mo</span> estimated
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="outline" disabled><CreditCard className="mr-2 h-4 w-4" /> Update payment method</Button>
          <Button className="bg-[image:var(--gradient-brand)] text-primary-foreground" disabled>Open billing portal</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Stripe billing will activate when you connect your payment account.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h3 className="text-base font-semibold">What's included</h3>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {["Unlimited course assignments", "Verifiable certificates", "Manager dashboards", "Email invitations", "CSV exports", "Priority support"].map((f) => (
            <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-accent" /> {f}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h3 className="text-base font-semibold">Recent invoices</h3>
        <p className="mt-1 text-sm text-muted-foreground">No invoices yet — you're in the free trial period.</p>
      </div>
    </div>
  );
}
