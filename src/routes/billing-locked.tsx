import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Hexagon, Lock, Mail, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/billing-locked")({
  head: () => ({ meta: [{ title: "Account locked — HIVE" }] }),
  component: BillingLockedPage,
});

interface LockState {
  loading: boolean;
  authed: boolean;
  isAdmin: boolean;
  agencyName: string;
  daysPastDue: number | null;
  lockedAt: string | null;
  lastPaymentError: string | null;
}

const INITIAL: LockState = {
  loading: true,
  authed: false,
  isAdmin: false,
  agencyName: "your agency",
  daysPastDue: null,
  lockedAt: null,
  lastPaymentError: null,
};

function BillingLockedPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<LockState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        if (!cancelled) navigate({ to: "/auth" });
        return;
      }

      let activeOrgId: string | null = null;
      try { activeOrgId = window.localStorage.getItem("hive.activeOrgId"); } catch { /* ignore */ }

      const { data: memberships } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations(name)")
        .eq("user_id", session.user.id)
        .eq("active", true);
      const ms = (memberships ?? []) as Array<{
        organization_id: string;
        role: string;
        organizations: { name: string } | null;
      }>;
      if (ms.length === 0) {
        if (!cancelled) navigate({ to: "/auth" });
        return;
      }
      const m = ms.find((x) => x.organization_id === activeOrgId) ?? ms[0];
      const orgId = m.organization_id;
      const isAdmin = m.role === "admin" || m.role === "super_admin";

      const { data: sub } = await supabase
        .from("org_subscriptions")
        .select("locked_at, past_due_since, last_payment_error")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // If the org isn't locked, kick back to the dashboard.
      if (!sub?.locked_at) {
        if (!cancelled) navigate({ to: "/dashboard" });
        return;
      }

      const since = sub.past_due_since ? new Date(sub.past_due_since) : null;
      const daysPastDue = since
        ? Math.max(0, Math.floor((Date.now() - since.getTime()) / (24 * 60 * 60 * 1000)))
        : null;

      if (cancelled) return;
      setState({
        loading: false,
        authed: true,
        isAdmin,
        agencyName: m.organizations?.name ?? "your agency",
        daysPastDue,
        lockedAt: sub.locked_at as string,
        lastPaymentError: (sub.last_payment_error as string | null) ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F1A2E] px-4 text-white">
        <p className="text-sm text-white/60">Loading account status…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1A2E] px-4 py-12 text-white">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <div className="mb-6 flex items-center gap-2">
          <Hexagon className="h-7 w-7 text-[#F5A524]" fill="#F5A524" />
          <span className="text-xl font-extrabold tracking-tight">HIVE</span>
        </div>

        <div className="mb-6 rounded-full bg-[#F5A524]/10 p-4">
          <Lock className="h-10 w-10 text-[#F5A524]" />
        </div>

        <h1 className="text-2xl font-bold sm:text-3xl">
          Your agency's account is currently locked
        </h1>
        <p className="mt-3 text-white/70">
          {state.agencyName}'s Hive account is locked due to a past-due balance.
        </p>

        {state.daysPastDue != null && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-6 py-4">
            <div className="text-xs uppercase tracking-wider text-white/50">Past due</div>
            <div className="mt-1 text-3xl font-bold text-[#F5A524]">
              {state.daysPastDue} {state.daysPastDue === 1 ? "day" : "days"}
            </div>
          </div>
        )}

        {state.isAdmin ? (
          <div className="mt-8 w-full">
            {state.lastPaymentError && (
              <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-left text-sm text-red-200">
                <div className="font-semibold">Last payment error</div>
                <div className="mt-1 text-red-100/90">{state.lastPaymentError}</div>
              </div>
            )}
            <Button
              asChild
              size="lg"
              className="w-full bg-[#F5A524] text-[#0F1A2E] hover:bg-[#F5A524]/90"
            >
              <Link to="/dashboard/billing/subscription">
                <CreditCard className="mr-2 h-4 w-4" />
                Update payment method
              </Link>
            </Button>
            <p className="mt-3 text-xs text-white/50">
              Access is restored immediately when payment succeeds.
            </p>
          </div>
        ) : (
          <div className="mt-8 w-full rounded-xl border border-white/10 bg-white/5 px-6 py-5 text-left text-sm text-white/80">
            Please contact your agency administrator to restore access. You will not be
            able to log in until the payment issue is resolved.
          </div>
        )}

        <div className="mt-10 flex items-center gap-2 text-sm text-white/50">
          <Mail className="h-4 w-4" />
          <a href="mailto:support@hive.app" className="hover:text-white">
            support@hive.app
          </a>
        </div>
      </div>
    </div>
  );
}
