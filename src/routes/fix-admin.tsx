import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/fix-admin")({
  component: FixAdmin,
});

export function FixAdmin() {
  const { user, session } = useAuth();
  const [status, setStatus] = useState(null);
  const [done, setDone] = useState(false);

  async function fix() {
    if (!user) return;
    setStatus("Working…");

    localStorage.setItem("portal-view", "admin");
    window.dispatchEvent(new Event("portal-view-change"));

    const { error } = await supabase
      .from("organization_members")
      .update({ role: "super_admin" as never, active: true })
      .eq("user_id", user.id);

    if (error) {
      setStatus("⚠️ Could not update role — but portal view is set to Admin. Reloading…");
    } else {
      setStatus("✅ Role restored to super_admin and portal set to Admin. Reloading…");
    }

    setDone(true);
    setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CardTitle>Log in first</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>🔧 Admin Access Restore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p><strong>Email:</strong> {user?.email}</p>
            <p><strong>User ID:</strong> {user?.id}</p>
          </div>

          <p className="text-sm text-muted-foreground">
            Click below to restore your super admin role and switch the portal to Admin view.
          </p>

          {status && (
            <div className="p-3 rounded-md bg-primary/10 text-primary text-sm">
              {status}
            </div>
          )}
          {!done && (
            <Button onClick={fix} className="w-full">
              ✅ Restore My Admin Access
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
