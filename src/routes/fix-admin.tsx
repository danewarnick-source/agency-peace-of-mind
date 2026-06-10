import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/fix-admin")({
  component: FixAdmin,
});

// SECURITY: this page previously called the `restore_my_admin_role` RPC, which let
// ANY signed-in user promote themselves to super_admin (and, via is_super_admin()
// checks in RLS, read every organization's data). That RPC has been disabled
// server-side (see migration ..._lock_restore_my_admin_role.sql). This route is
// retained only as an inert placeholder — it performs no privileged action.
export function FixAdmin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Page disabled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This admin-restore page has been disabled. If you need an access or
            role change, please contact an administrator.
          </p>
          <Button onClick={() => { window.location.href = "/dashboard"; }} className="w-full">
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
