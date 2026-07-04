import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { RequireCapability } from "@/hooks/use-exec-capability";
import {
  listAgreementRequirements,
  upsertAgreementRequirement,
  deleteAgreementRequirement,
} from "@/lib/agreements.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/dashboard/hive-exec/agreements/requirements")({
  head: () => ({ meta: [{ title: "Agreement Requirements — Executive Command Center" }] }),
  component: () => (
    <RequireCapability cap="agreements.manage">
      <RequirementsPage />
    </RequireCapability>
  ),
});

function RequirementsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAgreementRequirements);
  const upsertFn = useServerFn(upsertAgreementRequirement);
  const deleteFn = useServerFn(deleteAgreementRequirement);
  const q = useQuery({ queryKey: ["agreement-requirements"], queryFn: () => listFn() });

  const [draft, setDraft] = useState({ name: "", description: "", renewal_period_months: "" });

  const create = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          name: draft.name,
          description: draft.description || null,
          renewal_period_months: draft.renewal_period_months ? Number(draft.renewal_period_months) : null,
          required: true,
          sort_order: (q.data?.length ?? 0) * 10,
        },
      }),
    onSuccess: () => {
      setDraft({ name: "", description: "", renewal_period_months: "" });
      qc.invalidateQueries({ queryKey: ["agreement-requirements"] });
      toast.success("Requirement added.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agreement-requirements"] });
      toast.success("Removed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-lg font-semibold text-[#0f1b3d]">Agreement Requirements (Master Checklist)</h1>
        <p className="text-sm text-muted-foreground">Types of paperwork every provider organization must have on file.</p>
      </header>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold">Add new requirement</h2>
        <div className="grid gap-2 md:grid-cols-[2fr_3fr_140px_auto]">
          <Input placeholder="Name (e.g. BAA)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input placeholder="Short description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <Input placeholder="Renewal months" type="number" value={draft.renewal_period_months} onChange={(e) => setDraft({ ...draft, renewal_period_months: e.target.value })} />
          <Button size="sm" onClick={() => create.mutate()} disabled={!draft.name || create.isPending}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </section>

      <div className="space-y-2">
        {(q.data ?? []).map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
            <div>
              <div className="font-medium">{r.name}</div>
              {r.description && <div className="text-sm text-muted-foreground">{r.description}</div>}
              {r.renewal_period_months && <div className="mt-1 text-xs text-muted-foreground">Renews every {r.renewal_period_months} months</div>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => del.mutate(r.id)} disabled={del.isPending}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {q.data && q.data.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No requirements defined yet. Add BAA, Provider Contract, Terms of Service, DPA, etc.
          </div>
        )}
      </div>
    </div>
  );
}
