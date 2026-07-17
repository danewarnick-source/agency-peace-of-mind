import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import {
  listClientTargetBehaviors,
  upsertClientTargetBehavior,
  deleteClientTargetBehavior,
  type ClientTargetBehavior,
} from "@/lib/client-target-behaviors.functions";

const QK = (clientId: string) => ["client-target-behaviors", clientId];

type DraftRow = { behavior_name: string; description: string };
const EMPTY_DRAFT: DraftRow = { behavior_name: "", description: "" };

function BehaviorRow({
  b,
  orgId,
  clientId,
  onMutated,
}: {
  b: ClientTargetBehavior;
  orgId: string;
  clientId: string;
  onMutated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftRow>({ behavior_name: b.behavior_name, description: b.description });
  const [busy, setBusy] = useState(false);
  const upsertFn = useServerFn(upsertClientTargetBehavior);
  const deleteFn = useServerFn(deleteClientTargetBehavior);

  async function save() {
    if (!draft.behavior_name.trim()) {
      toast.error("Behavior name is required.");
      return;
    }
    setBusy(true);
    try {
      await upsertFn({
        data: {
          id: b.id,
          organization_id: orgId,
          client_id: clientId,
          behavior_name: draft.behavior_name.trim(),
          description: draft.description.trim(),
          sort_order: b.sort_order,
        },
      });
      setEditing(false);
      onMutated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove "${b.behavior_name}"?`)) return;
    setBusy(true);
    try {
      await deleteFn({ data: { organization_id: orgId, id: b.id } });
      onMutated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3 grid gap-2">
        <div className="grid gap-1">
          <Label className="text-[11px] font-semibold">Behavior name</Label>
          <Input
            value={draft.behavior_name}
            onChange={(e) => setDraft((d) => ({ ...d, behavior_name: e.target.value }))}
            maxLength={200}
            placeholder="e.g., Verbal escalation"
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px] font-semibold">Description (helps staff recognize it)</Label>
          <Textarea
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            maxLength={2000}
            placeholder="e.g., Raised voice, repeated phrases, pacing — typically precedes a meltdown"
            rows={2}
            className="text-sm min-h-[56px]"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={busy} className="h-8">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setEditing(false); setDraft({ behavior_name: b.behavior_name, description: b.description }); }}
            disabled={busy}
            className="h-8"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{b.behavior_name}</p>
        {b.description && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{b.description}</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => { setDraft({ behavior_name: b.behavior_name, description: b.description }); setEditing(true); }}
          disabled={busy}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
          aria-label="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-rose-100 text-muted-foreground hover:text-rose-700"
          aria-label="Remove"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function TargetBehaviorsPanel({
  clientId,
  orgId,
}: {
  clientId: string;
  orgId: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listClientTargetBehaviors);
  const upsertFn = useServerFn(upsertClientTargetBehavior);

  const { data: behaviors = [], isLoading } = useQuery({
    queryKey: QK(clientId),
    queryFn: () => listFn({ data: { organization_id: orgId, client_id: clientId } }),
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK(clientId) });

  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<DraftRow>(EMPTY_DRAFT);
  const [addBusy, setAddBusy] = useState(false);

  async function saveNew() {
    if (!addDraft.behavior_name.trim()) {
      toast.error("Behavior name is required.");
      return;
    }
    setAddBusy(true);
    try {
      await upsertFn({
        data: {
          organization_id: orgId,
          client_id: clientId,
          behavior_name: addDraft.behavior_name.trim(),
          description: addDraft.description.trim(),
          sort_order: behaviors.length,
        },
      });
      setAddDraft(EMPTY_DRAFT);
      setAddOpen(false);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setAddBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {behaviors.length === 0 && !addOpen && (
        <p className="text-sm text-muted-foreground">
          No target behaviors defined yet. Add one to surface it in staff clock-out notes.
        </p>
      )}

      {behaviors.map((b) => (
        <BehaviorRow
          key={b.id}
          b={b}
          orgId={orgId}
          clientId={clientId}
          onMutated={invalidate}
        />
      ))}

      {addOpen ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 grid gap-2">
          <div className="grid gap-1">
            <Label className="text-[11px] font-semibold">Behavior name</Label>
            <Input
              value={addDraft.behavior_name}
              onChange={(e) => setAddDraft((d) => ({ ...d, behavior_name: e.target.value }))}
              maxLength={200}
              placeholder="e.g., Property destruction"
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] font-semibold">Description (helps staff recognize it)</Label>
            <Textarea
              value={addDraft.description}
              onChange={(e) => setAddDraft((d) => ({ ...d, description: e.target.value }))}
              maxLength={2000}
              placeholder="e.g., Throwing or slamming objects — usually during transitions"
              rows={2}
              className="text-sm min-h-[56px]"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveNew} disabled={addBusy} className="h-8">
              {addBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Add behavior
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setAddOpen(false); setAddDraft(EMPTY_DRAFT); }}
              disabled={addBusy}
              className="h-8"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          className="w-fit"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add target behavior
        </Button>
      )}
    </div>
  );
}
