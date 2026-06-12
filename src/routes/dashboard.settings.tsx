import { Outlet, createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark, ArrowRight, ShieldCheck, Wand2, ListChecks, BookOpenCheck, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { CompanyOverviewSettings } from "@/components/company-overview-settings";
import { CelebrationSettings } from "@/components/celebrations/celebration-settings";
import { ShiftBehaviorToggleCard } from "@/components/evv/shift-behavior-toggle-card";

export const Route = createFileRoute("/dashboard/settings")({ component: SettingsPage });

function SettingsPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { data: org, refetch } = useCurrentOrg();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [dbaName, setDbaName] = useState("");
  const [displayAcronym, setDisplayAcronym] = useState("");
  const [busy, setBusy] = useState(false);

  if (pathname !== "/dashboard/settings") {
    return <Outlet />;
  }

  useEffect(() => {
    if (user) setFullName(user.user_metadata?.full_name ?? "");
    if (org) {
      setOrgName(org.organization_name);
      setLegalName(org.legal_name ?? "");
      setDbaName(org.dba_name ?? "");
      setDisplayAcronym(org.display_acronym ?? "");
    }
  }, [user, org]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    await supabase.from("profiles").update({ full_name: fullName }).eq("id", user!.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  };

  const saveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setBusy(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: orgName,
        legal_name: legalName.trim() || null,
        dba_name: dbaName.trim() || null,
        display_acronym: displayAcronym.trim() || null,
      })
      .eq("id", org.organization_id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Organization updated");
    refetch();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={saveProfile} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground">Manage your personal information.</p>
        <div className="mt-5 grid gap-4">
          <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" value={user?.email ?? ""} disabled /></div>
          <div className="grid gap-2"><Label htmlFor="full_name">Full name</Label><Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
          <Button type="submit" disabled={busy}>Save profile</Button>
        </div>
      </form>

      {org?.role === "admin" && (
        <form onSubmit={saveOrg} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold">Organization</h2>
          <p className="text-sm text-muted-foreground">Visible to your whole team. Acronym is used in dashboard labels (e.g. column headers).</p>
          <div className="mt-5 grid gap-4">
            <div className="grid gap-2"><Label htmlFor="org_name">Organization name</Label><Input id="org_name" value={orgName} onChange={(e) => setOrgName(e.target.value)} required /></div>
            <div className="grid gap-2"><Label htmlFor="legal_name">Legal name</Label><Input id="legal_name" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="e.g. Acme Supports LLC" /></div>
            <div className="grid gap-2"><Label htmlFor="dba_name">Doing-business-as (DBA)</Label><Input id="dba_name" value={dbaName} onChange={(e) => setDbaName(e.target.value)} placeholder="Optional" /></div>
            <div className="grid gap-2"><Label htmlFor="display_acronym">Display acronym</Label><Input id="display_acronym" value={displayAcronym} onChange={(e) => setDisplayAcronym(e.target.value)} placeholder="e.g. ACME" maxLength={12} /></div>
            <Button type="submit" disabled={busy}>Save organization</Button>
          </div>
        </form>
      )}
      {(org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin") && (
        <CompanyOverviewSettings />
      )}

      <CelebrationSettings isAdmin={org?.role === "admin" || org?.role === "super_admin"} />

      <ShiftBehaviorToggleCard isAdmin={org?.role === "admin" || org?.role === "super_admin"} />


      {(org?.role === "admin" || org?.role === "super_admin") && (
        <Link to="/dashboard/settings/team-access" className="group lg:col-span-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:border-primary/40 hover:bg-accent/30">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-semibold">Team access</h2>
                <p className="mt-1 text-sm text-muted-foreground">Invite teammates by email and grant any combination of Staff, Admin, Company Executive, and (for HIVE staff) HIVE Executive roles per login.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </Link>
      )}

      {org?.role === "admin" && (
        <Link to="/dashboard/settings/bank-mapping" className="group lg:col-span-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:border-primary/40 hover:bg-accent/30">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Landmark className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-semibold">🏦 Institutional Client Banking Registry</h2>
                <p className="mt-1 text-sm text-muted-foreground">Link your corporate Plaid bank streams, map sub-accounts to client trust profiles, and auto-reconcile SSI/SSDI deposits into the PBA ledger.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </Link>
      )}

      {org?.role === "admin" && (
        <Link to="/dashboard/settings/automation-rules" className="group lg:col-span-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:border-primary/40 hover:bg-accent/30">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Wand2 className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-semibold">Automation Rules</h2>
                <p className="mt-1 text-sm text-muted-foreground">Control what NECTAR sets up automatically when it imports a document. Toggle, edit, or add rules — nothing is created without your review.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </Link>
      )}

      {(org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin") && (
        <Link to="/dashboard/settings/service-codes" className="group lg:col-span-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:border-primary/40 hover:bg-accent/30">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><BookOpenCheck className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-semibold">Service Code Registry</h2>
                <p className="mt-1 text-sm text-muted-foreground">Read-only reference for every service code — EVV mandate, rate source, default rate, summary cadence, daily/weekly caps, and overnight (asleep) billability — grouped by category.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </Link>
      )}

      {(org?.role === "admin" || org?.role === "super_admin") && (
        <Link to="/dashboard/settings/service-catalog" className="group lg:col-span-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:border-primary/40 hover:bg-accent/30">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><ListChecks className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-semibold">Service Catalog</h2>
                <p className="mt-1 text-sm text-muted-foreground">Edit scheduling and billing attributes for every service code your agency uses — category, scheduling behavior, EVV/schedule/carve-out flags, and unit. The scheduler and billing engine read from here.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </Link>
      )}

      {(org?.role === "admin" || org?.role === "super_admin") && (
        <Link to="/dashboard/settings/subscription" className="group lg:col-span-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:border-primary/40 hover:bg-accent/30">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-semibold">HIVE Subscription</h2>
                <p className="mt-1 text-sm text-muted-foreground">Manage your HIVE plan and subscription details. Self-service is coming soon — for now, our team handles changes directly.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </Link>
      )}

    </div>
  );
}
