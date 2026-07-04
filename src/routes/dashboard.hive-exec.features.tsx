import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { RequireCapability } from "@/hooks/use-exec-capability";
import {
  listFeatureRegistry,
  upsertFeatureRegistryEntry,
  type FeatureRegistryRow,
} from "@/lib/feature-registry-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/dashboard/hive-exec/features")({
  head: () => ({ meta: [{ title: "Feature Registry — Executive Command Center" }] }),
  component: () => (
    <RequireCapability cap="features.manage">
      <FeatureRegistryPage />
    </RequireCapability>
  ),
});

function FeatureRegistryPage() {
  const listFn = useServerFn(listFeatureRegistry);
  const q = useQuery({ queryKey: ["feature-registry-admin"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<FeatureRegistryRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-lg font-semibold text-[#0f1b3d]">Feature Registry</h1>
          <p className="text-sm text-muted-foreground">Add or edit features so new toggles become available without a database migration.</p>
        </div>
        <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-3.5 w-3.5" /> New feature</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit feature" : "New feature"}</DialogTitle></DialogHeader>
            <FeatureForm entry={editing} onDone={() => { setCreating(false); setEditing(null); }} />
          </DialogContent>
        </Dialog>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-2">Key</th><th className="p-2">Label</th><th className="p-2">Category</th><th className="p-2">Default</th><th className="p-2">Tier</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 font-mono text-xs">{r.feature_key}</td>
                <td className="p-2">{r.label}</td>
                <td className="p-2 text-xs text-muted-foreground">{r.category}</td>
                <td className="p-2">{r.default_enabled ? "on" : "off"}</td>
                <td className="p-2 text-xs">{r.required_tier ?? "—"}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeatureForm({ entry, onDone }: { entry: FeatureRegistryRow | null; onDone: () => void }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertFeatureRegistryEntry);
  const [form, setForm] = useState({
    feature_key: entry?.feature_key ?? "",
    label: entry?.label ?? "",
    description: entry?.description ?? "",
    parent_key: entry?.parent_key ?? "",
    category: (entry?.category ?? "tab") as "tab" | "subtab" | "nectar_feature",
    default_enabled: entry?.default_enabled ?? false,
    sort_order: entry?.sort_order ?? 0,
    required_tier: entry?.required_tier ?? "",
    upgrade_blurb: entry?.upgrade_blurb ?? "",
  });
  const m = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: entry?.id,
          feature_key: form.feature_key,
          label: form.label,
          description: form.description || null,
          parent_key: form.parent_key || null,
          category: form.category,
          default_enabled: form.default_enabled,
          sort_order: form.sort_order,
          required_tier: form.required_tier || null,
          upgrade_blurb: form.upgrade_blurb || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feature-registry-admin"] });
      toast.success("Saved.");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-2">
      <Input placeholder="feature_key (lowercase.dotted)" value={form.feature_key} disabled={!!entry} onChange={(e) => setForm({ ...form, feature_key: e.target.value })} />
      <Input placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      <Textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as typeof form.category })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tab">tab</SelectItem>
            <SelectItem value="subtab">subtab</SelectItem>
            <SelectItem value="nectar_feature">nectar_feature</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="parent_key (optional)" value={form.parent_key} onChange={(e) => setForm({ ...form, parent_key: e.target.value })} />
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.default_enabled} onChange={(e) => setForm({ ...form, default_enabled: e.target.checked })} />
          Default enabled
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>Save</Button>
      </div>
    </div>
  );
}
