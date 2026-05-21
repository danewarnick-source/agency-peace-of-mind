import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings")({ component: SettingsPage });

function SettingsPage() {
  const { user } = useAuth();
  const { data: org, refetch } = useCurrentOrg();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setFullName(user.user_metadata?.full_name ?? "");
    if (org) setOrgName(org.organization_name);
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
    const { error } = await supabase.from("organizations").update({ name: orgName }).eq("id", org.organization_id);
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
          <p className="text-sm text-muted-foreground">Visible to your whole team.</p>
          <div className="mt-5 grid gap-4">
            <div className="grid gap-2"><Label htmlFor="org_name">Organization name</Label><Input id="org_name" value={orgName} onChange={(e) => setOrgName(e.target.value)} required /></div>
            <Button type="submit" disabled={busy}>Save organization</Button>
          </div>
        </form>
      )}
    </div>
  );
}
