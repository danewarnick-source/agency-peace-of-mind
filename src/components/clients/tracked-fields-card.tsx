// Profile card listing every tracked client field with its has/none/unknown
// state. Reads the live tri-state map from getClientFieldStates so confirmed
// "none" answers show as positive statements and unconfirmed fields surface
// as confirmation chips that jump to the wizard.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stethoscope } from "lucide-react";
import { TRACKED_FIELDS, type FieldState } from "@/lib/field-confirmations";
import { getClientFieldStates } from "@/lib/field-confirmations.functions";
import { FieldStateLine } from "@/components/clients/field-state-line";

export function TrackedFieldsCard({ clientId }: { clientId: string }) {
  const fetchStates = useServerFn(getClientFieldStates);
  const q = useQuery({
    queryKey: ["client-field-states", clientId],
    queryFn: () => fetchStates({ data: { clientId } }),
  });

  if (q.isLoading || !q.data) return null;
  const states = q.data.states as Record<string, FieldState>;
  const unknownCount = TRACKED_FIELDS.filter((f) => states[f.key] === "unknown").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Tracked health & care fields</CardTitle>
        </div>
        {unknownCount > 0 && (
          <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
            {unknownCount} to confirm
          </Badge>
        )}
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {TRACKED_FIELDS.map((f) => (
          <FieldStateLine
            key={f.key}
            field={f}
            state={states[f.key] ?? "unknown"}
            clientId={clientId}
          />
        ))}
      </CardContent>
    </Card>
  );
}
