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
    setStatus("Restoring role via secure function…");

    localStorage.setItem("portal-view", "admin");
    window.dispatchEvent(new Event("portal-view-change"));

    const { error } = await supabase.rpc("restore_my_admin_role" as never);

    if (error) {
      setStatus(`❌ Error: ${error.message}`);
      return;
    }

    setStatus("✅ Role restored to super_admin! Reloading dashboard…");
    setDone(true);
    setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-bold mb-4">Log in first</h2>
            <Button onClick={() => window.location.href = "/login"}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>🔧 Admin Access Restore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>Email:</strong> {user?.email}</p>
            <p><strong>User ID:</strong> {user?.id}</p>
          </div>

          <p className="text-sm">
            Click below to restore your super admin role using a secure database function.
          </p>

          {status && (
            <div className="p-3 bg-muted rounded text-sm">{status}</div>
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
