// Fully customizable healthcare provider list — replaces the old fixed
// PCP/specialist/neurologist/dentist/prescriber columns with an open-ended,
// admin-typed provider_type per row.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, HeartPulse } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listHealthcareProviders,
  upsertHealthcareProvider,
  deleteHealthcareProvider,
  type HealthcareProvider,
} from "@/lib/client-healthcare-providers.functions";

export function HealthcareProvidersCard({ clientId, orgId }: { clientId: string; orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listHealthcareProviders);
  const upsertFn = useServerFn(upsertHealthcareProvider);
  const deleteFn = useServerFn(deleteHealthcareProvider);

  const q = useQuery({
    queryKey: ["client-healthcare-providers", orgId, clientId],
    queryFn: () => listFn({ data: { organization_id: orgId, client_id: clientId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["client-healthcare-providers", orgId, clientId] });

  const addMutation = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          organization_id: orgId,
          client_id: clientId,
          provider_type: "",
          provider_name: "",
          phone: "",
          notes: "",
          sort_order: (q.data?.length ?? 0) + 1,
        },
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const providers = q.data ?? [];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start gap-2.5 px-5 py-4 border-b border-border/60">
          <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <HeartPulse className="h-3.5 w-3.5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-tight">Healthcare providers</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Add as many providers as needed — type, name, phone, notes.</p>
          </div>
          <Button size="sm" variant="outline" disabled={addMutation.isPending} onClick={() => addMutation.mutate()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add provider
          </Button>
        </div>
        <div className="p-5 space-y-3">
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No providers on file yet.</p>
          ) : (
            providers.map((p) => (
              <ProviderRow
                key={p.id}
                provider={p}
                orgId={orgId}
                clientId={clientId}
                upsertFn={upsertFn}
                deleteFn={deleteFn}
                onChanged={invalidate}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderRow({
  provider, orgId, clientId, upsertFn, deleteFn, onChanged,
}: {
  provider: HealthcareProvider;
  orgId: string;
  clientId: string;
  upsertFn: ReturnType<typeof useServerFn<typeof upsertHealthcareProvider>>;
  deleteFn: ReturnType<typeof useServerFn<typeof deleteHealthcareProvider>>;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState({
    provider_type: provider.provider_type,
    provider_name: provider.provider_name ?? "",
    phone: provider.phone ?? "",
    notes: provider.notes ?? "",
  });
  const [dirty, setDirty] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          organization_id: orgId,
          client_id: clientId,
          id: provider.id,
          provider_type: draft.provider_type || "Provider",
          provider_name: draft.provider_name,
          phone: draft.phone,
          notes: draft.notes,
          sort_order: provider.sort_order,
        },
      }),
    onSuccess: () => { setDirty(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { organization_id: orgId, id: provider.id } }),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof draft, v: string) => { setDraft((d) => ({ ...d, [k]: v })); setDirty(true); };

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-[11px]">Provider type</Label>
          <Input
            value={draft.provider_type}
            onChange={(e) => set("provider_type", e.target.value)}
            placeholder="e.g. Primary Care Physician, Neurologist, Dentist"
          />
        </div>
        <div>
          <Label className="text-[11px]">Name</Label>
          <Input value={draft.provider_name} onChange={(e) => set("provider_name", e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px]">Phone</Label>
          <Input value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px]">Notes (optional)</Label>
          <Input value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
        </Button>
        {dirty && (
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
    </div>
  );
}
