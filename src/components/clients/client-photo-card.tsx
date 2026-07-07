// ClientPhotoCard — mounts <PhotoUpload> against the client-photos bucket
// and persists to clients.client_photo_url + clients.client_photo_taken_on.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card, CardContent } from "@/components/ui/card";
import { Camera } from "lucide-react";
import { PhotoUpload } from "@/components/person/photo-upload";

export function ClientPhotoCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;

  const q = useQuery({
    queryKey: ["client-photo-card", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("first_name, last_name, client_photo_url, profile_photo_url, client_photo_taken_on")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const persist = useMutation({
    mutationFn: async (patch: { client_photo_url: string | null; client_photo_taken_on: string | null }) => {
      const { error } = await supabase.from("clients").update(patch).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-photo-card", clientId] });
      qc.invalidateQueries({ queryKey: ["client-face-sheet-info", clientId] });
      // Any workspace/header queries that read the photo — refresh broadly.
      qc.invalidateQueries({ queryKey: ["client-workspace"] });
      qc.invalidateQueries({ queryKey: ["caseload"] });
    },
  });

  const c = q.data;
  const name = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : null;
  const currentPath = (c?.client_photo_url ?? c?.profile_photo_url ?? null) as string | null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Camera className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Client photo</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Used on the Client Face Sheet. Recent, front-facing preferred.
              {c?.client_photo_taken_on ? ` Last taken ${c.client_photo_taken_on}.` : ""}
            </p>
          </div>
        </div>
        {orgId ? (
          <PhotoUpload
            bucket="client-photos"
            organizationId={orgId}
            subjectId={clientId}
            currentPath={currentPath}
            personName={name}
            onUploaded={async (path) => {
              await persist.mutateAsync({
                client_photo_url: path,
                client_photo_taken_on: new Date().toISOString().slice(0, 10),
              });
            }}
            onCleared={async () => {
              await persist.mutateAsync({
                client_photo_url: null,
                client_photo_taken_on: null,
              });
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
      </CardContent>
    </Card>
  );
}
