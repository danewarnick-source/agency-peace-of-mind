// "Finish onboarding" — lists the human-only setup items that documents
// can't supply for a newly-imported client. Step 1: assign staff so the
// client becomes clockable and shows up on caseloads / the scheduler.
//
// Hidden once every step is done so it doesn't clutter the profile.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ListChecks } from "lucide-react";
import { CaseloadEditor } from "@/components/clients/caseload-editor";

export function FinishOnboardingCard({ clientId }: { clientId: string }) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  const assignedQ = useQuery({
    enabled: !!orgId && !!clientId,
    queryKey: ["finish-onboarding-assigned", orgId, clientId],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("staff_assignments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .eq("client_id", clientId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const assignedCount = assignedQ.data ?? 0;
  const staffDone = assignedCount > 0;

  // Future steps will be added here. For now, hide the whole card once
  // every step is complete.
  const allDone = staffDone;
  if (assignedQ.isLoading || allDone) return null;

  return (
    <Card className="border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-amber-600" />
          <CardTitle className="text-base">Finish onboarding</CardTitle>
        </div>
        <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
          {staffDone ? 1 : 0}/1 done
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Documents can&apos;t tell us who works with this client. Pick the
          staff who should be able to schedule and clock in for them.
        </p>

        <div className="rounded-md border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {staffDone ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <span className="inline-block h-4 w-4 rounded-full border-2 border-amber-500" />
            )}
            Step 1 · Assign staff
          </div>
          <CaseloadEditor clientId={clientId} />
        </div>
      </CardContent>
    </Card>
  );
}
