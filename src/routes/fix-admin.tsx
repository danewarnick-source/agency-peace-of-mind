import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/fix-admin")({
  component: FixAdmin,
});

export function FixAdmin() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Checking your account…");
  const [membership, setMembership] = useState<{
    id: string;
    role: string;
    organization_id: string;
    organization_name: string;
    active: boolean;
  } | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("organization_members")
      .select("id, role, organization_id, active, organizations(name)")
      .eq("user_id", user.id)
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); return; }
        if (!data?.length) {
          setStatus("⚠️ No organization membership found for your account.");
          return;
        }
        const m = data[0] as {
          id: string; role: string; organization_id: string; active: boolean;
          organizations: { name: string } | null;
        };
        setMembership({
          id: m.id,
          role: m.role,
          organization_id: m.organization_id,
          organization_name: m.organizations?.name ?? "Unknown",
          active: m.active,
        });
        setStatus(`Found membership: role = "${m.role}", active = ${m.active}`);
      });
  }, [user]);

  async function fixRole() {
    if (!membership) return;
    setStatus("Updating role to super_admin…");
    const { error: err } = await supabase
      .from("organization_members")
      .update({ role: "super_admin", active: true })
      .eq("id", membership.id);
    if (err) { setError(err.message); return; }

    // Also set portal-view to admin in localStorage
    localStorage.setItem("portal-view", "admin");

    setStatus("✅ Role updated to super_admin. Redirecting to dashboard…");
    setDone(true);
    setTimeout(() => navigate({ to: "/dashboard" }), 1500);
  }

  async function fixViewOnly() {
    localStorage.setItem("portal-view", "admin");
    window.dispatchEvent(new Event("portal-view-change"));
    setStatus("✅ Portal view set to admin. Redirecting…");
    setDone(true);
    setTimeout(() => navigate({ to: "/dashboard" }), 1000);
  }

  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            You must be logged in to use this page.{" "}
            <a href="/login" className="text-primary underline">Log in</a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-center">🔧 Admin Access Restore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs font-mono">
            <p><strong>User:</strong> {user?.email}</p>
            <p><strong>User ID:</strong> {user?.id?.slice(0, 8)}…</p>
            {membership && (
              <>
                <p><strong>Org:</strong> {membership.organization_name}</p>
                <p><strong>Current role:</strong> {membership.role}</p>
                <p><strong>Active:</strong> {String(membership.active)}</p>
              </>
            )}
          </div>

          <div className={`rounded-lg p-3 text-sm ${done ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" : "bg-muted text-muted-foreground"}`}>
            {status}
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
              Error: {error}
            </div>
          )}

          {membership && !done && (
            <div className="space-y-2">
              {membership.role !== "super_admin" ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Your role is currently <strong>{membership.role}</strong>. 
                    Click below to restore super_admin access.
                  </p>
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={fixRole}>
                    ✅ Restore Super Admin Role + Set Admin View
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Your role is already <strong>super_admin</strong>. 
                    The issue is just the portal view toggle. Click below to fix it.
                  </p>
                  <Button className="w-full bg-primary text-primary-foreground"
                    onClick={fixViewOnly}>
                    ✅ Switch Portal to Admin View
                  </Button>
                </>
              )}
            </div>
          )}

          {!membership && !error && (
            <p className="text-center text-xs text-muted-foreground">Loading membership data…</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
