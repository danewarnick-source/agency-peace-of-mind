import { Outlet, createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark, ArrowRight, ShieldCheck, Wand2, ListChecks, BookOpenCheck, CreditCard, Mail, Inbox, UserCircle2, Building2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { CompanyOverviewSettings } from "@/components/company-overview-settings";
import { OrgBrandingCard } from "@/components/settings/org-branding-card";
import { CelebrationSettings } from "@/components/celebrations/celebration-settings";
import { ShiftBehaviorToggleCard } from "@/components/evv/shift-behavior-toggle-card";
import { getAccountContact, updateAccountContact } from "@/lib/hive-exec.functions";

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
  const [dhhsProviderId, setDhhsProviderId] = useState("");
  const [evvVendorName, setEvvVendorName] = useState("Hive");
  const [incidentAiEnabled, setIncidentAiEnabled] = useState(true);
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
      // Fetch EVV-specific org fields directly (not part of useCurrentOrg)
      void supabase
        .from("organizations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("dhhs_provider_id, evv_vendor_name, incident_ai_review_enabled" as any)
        .eq("id", org.organization_id)
        .maybeSingle()
        .then(({ data }) => {
          const d = (data ?? null) as { dhhs_provider_id: string | null; evv_vendor_name: string | null; incident_ai_review_enabled: boolean | null } | null;
          if (d) {
            setDhhsProviderId(d.dhhs_provider_id ?? "");
            setEvvVendorName(d.evv_vendor_name ?? "Hive");
            setIncidentAiEnabled(d.incident_ai_review_enabled !== false);
          }
        });
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        name: orgName,
        legal_name: legalName.trim() || null,
        dba_name: dbaName.trim() || null,
        display_acronym: displayAcronym.trim() || null,
        dhhs_provider_id: dhhsProviderId.trim() || null,
        evv_vendor_name: evvVendorName.trim() || "Hive",
        incident_ai_review_enabled: incidentAiEnabled,
      } as any)
      .eq("id", org.organization_id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Organization updated");
    refetch();
  };

  const isAdmin = org?.role === "admin";
  const canBillingContact = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] lg:col-span-2">
        <header className="mb-2">
          <h2 className="text-base font-semibold">Profile &amp; organization</h2>
          <p className="text-sm text-muted-foreground">
            All identity-related information in one place — your profile, your
            organization, and who Hive contacts about billing.
          </p>
        </header>

        <div className="mt-4 space-y-8">
          <form onSubmit={saveProfile}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <UserCircle2 className="h-4 w-4 text-muted-foreground" /> Your profile
            </h3>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" value={user?.email ?? ""} disabled /></div>
              <div className="grid gap-2"><Label htmlFor="full_name">Full name</Label><Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
            </div>
            <div className="mt-3"><Button type="submit" disabled={busy}>Save profile</Button></div>
          </form>

          {isAdmin && (
            <>
              <div className="border-t border-border" />
              <form onSubmit={saveOrg}>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Building2 className="h-4 w-4 text-muted-foreground" /> Organization details
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Visible to your whole team. Acronym is used in dashboard labels (e.g. column headers).
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2"><Label htmlFor="org_name">Organization name</Label><Input id="org_name" value={orgName} onChange={(e) => setOrgName(e.target.value)} required /></div>
                  <div className="grid gap-2"><Label htmlFor="legal_name">Legal name</Label><Input id="legal_name" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="e.g. Acme Supports LLC" /></div>
                  <div className="grid gap-2"><Label htmlFor="dba_name">Doing-business-as (DBA)</Label><Input id="dba_name" value={dbaName} onChange={(e) => setDbaName(e.target.value)} placeholder="Optional" /></div>
                  <div className="grid gap-2"><Label htmlFor="display_acronym">Display acronym</Label><Input id="display_acronym" value={displayAcronym} onChange={(e) => setDisplayAcronym(e.target.value)} placeholder="e.g. ACME" maxLength={12} /></div>
                  <div className="grid gap-2"><Label htmlFor="dhhs_provider_id">DHHS Provider ID</Label><Input id="dhhs_provider_id" value={dhhsProviderId} onChange={(e) => setDhhsProviderId(e.target.value)} placeholder="Required for Utah EVV export" /></div>
                  <div className="grid gap-2"><Label htmlFor="evv_vendor_name">EVV Vendor name</Label><Input id="evv_vendor_name" value={evvVendorName} onChange={(e) => setEvvVendorName(e.target.value)} placeholder="Hive" /></div>
                </div>
                <label className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={incidentAiEnabled}
                    onChange={(e) => setIncidentAiEnabled(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Nectar incident-report review</span>
                    <span className="block text-xs text-muted-foreground">
                      Before staff submit an incident report, Nectar reads the draft and flags missing 5-Ws or vague phrases as concrete follow-up questions. Reviewer outages never block submission — the IR is filed with an AI-skipped badge.
                    </span>
                  </span>
                </label>
                <div className="mt-3"><Button type="submit" disabled={busy}>Save organization</Button></div>
              </form>
            </>
          )}

          {canBillingContact && org?.organization_id && (
            <>
              <div className="border-t border-border" />
              <BillingContactSection organizationId={org.organization_id} />
            </>
          )}
        </div>
      </section>

      {(org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin") && (
        <CompanyOverviewSettings />
      )}

      <OrgBrandingCard />

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
                <h2 className="text-base font-semibold">Service codes</h2>
                <p className="mt-1 text-sm text-muted-foreground">One place for every code. <strong>Reference</strong> shows read-only regulatory data (EVV, rates, cadence, caps). <strong>Configuration</strong> is the editable scheduling/billing catalog the scheduler and billing engine read from.</p>
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

      {(org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin") && (
        <Link to="/dashboard/settings/email" className="group lg:col-span-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:border-primary/40 hover:bg-accent/30">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Mail className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-semibold">Email Sender (Resend)</h2>
                <p className="mt-1 text-sm text-muted-foreground">Configure the From name / address used for every email HIVE sends — referral follow-ups, notifications. Refuses to send until you've verified a sending domain in Resend.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </Link>
      )}

      {(org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin") && (
        <Link to="/dashboard/settings/retention" className="group lg:col-span-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:border-primary/40 hover:bg-accent/30">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><ListChecks className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-semibold">Referral retention</h2>
                <p className="mt-1 text-sm text-muted-foreground">Configure how long referrals stay active after their due date before being archived, and the grace period before purge. Archive is recoverable; a tombstone is kept after purge for audit.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </Link>
      )}

      {(org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin") && (
        <Link to="/dashboard/settings/gmail" className="group lg:col-span-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:border-primary/40 hover:bg-accent/30">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Inbox className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-semibold">Gmail referral ingestion</h2>
                <p className="mt-1 text-sm text-muted-foreground">Connect a provider Gmail inbox (read-only) so matching referral emails auto-parse into reviewable drafts every 5 minutes. Configure sender / subject rules and review the PHI ingestion audit log.</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </Link>
      )}



    </div>
  );
}

function BillingContactSection({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getAccountContact);
  const saveFn = useServerFn(updateAccountContact);

  const q = useQuery({
    queryKey: ["account-contact", organizationId],
    queryFn: () => getFn({ data: { organizationId } }),
    refetchInterval: 30_000,
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!q.data) return;
    setName(q.data.name ?? "");
    setEmail(q.data.email ?? "");
    setPhone(q.data.phone ?? "");
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          organizationId,
          patch: {
            name: name.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Billing contact updated");
      qc.invalidateQueries({ queryKey: ["account-contact", organizationId] });
      qc.invalidateQueries({ queryKey: ["hive-exec-company", organizationId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Receipt className="h-4 w-4 text-muted-foreground" /> Billing contact
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Who Hive should contact for urgent billing or account issues. Changes here are visible to the
        Hive operations team and stay in sync with their records.
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ac_name">Main contact</Label>
          <Input id="ac_name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ac_email">Email</Label>
          <Input id="ac_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="ac_phone">Mobile phone</Label>
          <Input
            id="ac_phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(801) 555-0123"
          />
          <p className="text-xs text-muted-foreground">
            Used for urgent billing SMS only. Never used for marketing.
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Button type="submit" disabled={save.isPending || q.isLoading}>
          {save.isPending ? "Saving…" : "Save billing contact"}
        </Button>
      </div>
    </form>
  );
}

