import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { RequireCapability } from "@/hooks/use-exec-capability";
import {
  listHiveKnowledge,
  upsertHiveKnowledgeEntry,
  deleteHiveKnowledgeEntry,
  type HiveKnowledgeRow,
} from "@/lib/hive-knowledge.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/dashboard/hive-exec/knowledge")({
  head: () => ({ meta: [{ title: "Knowledge Base — Executive Command Center" }] }),
  component: () => (
    <RequireCapability cap="knowledge.manage">
      <KnowledgePage />
    </RequireCapability>
  ),
});

function KnowledgePage() {
  const listFn = useServerFn(listHiveKnowledge);
  const q = useQuery({ queryKey: ["hive-knowledge-admin"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<HiveKnowledgeRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold text-[#0f1b3d]">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">
            HIVE's own how-to articles. Steve (Guide-me) answers exec questions by retrieving from
            these entries. No org data or PHI belongs here — platform ops only.
          </p>
        </div>
        <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New article
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing ? "Edit article" : "New article"}</DialogTitle></DialogHeader>
            <ArticleForm entry={editing} onDone={() => { setCreating(false); setEditing(null); }} />
          </DialogContent>
        </Dialog>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-2">Title</th>
              <th className="p-2">Category</th>
              <th className="p-2">Feature</th>
              <th className="p-2">Route</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 font-medium">{r.title}</td>
                <td className="p-2 text-xs text-muted-foreground">{r.category}</td>
                <td className="p-2 font-mono text-[11px]">{r.related_feature_key ?? "—"}</td>
                <td className="p-2 font-mono text-[11px]">{r.related_route ?? "—"}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                </td>
              </tr>
            ))}
            {q.data?.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">No articles yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArticleForm({ entry, onDone }: { entry: HiveKnowledgeRow | null; onDone: () => void }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertHiveKnowledgeEntry);
  const delFn = useServerFn(deleteHiveKnowledgeEntry);
  const [form, setForm] = useState({
    title: entry?.title ?? "",
    slug: entry?.slug ?? "",
    category: entry?.category ?? "",
    body: entry?.body ?? "",
    related_feature_key: entry?.related_feature_key ?? "",
    related_route: entry?.related_route ?? "",
  });

  const save = useMutation({
    mutationFn: () => upsertFn({
      data: {
        id: entry?.id,
        title: form.title.trim(),
        slug: form.slug.trim() || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        category: form.category.trim(),
        body: form.body,
        related_feature_key: form.related_feature_key.trim() || null,
        related_route: form.related_route.trim() || null,
      },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hive-knowledge-admin"] }); toast.success("Saved."); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id: entry!.id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hive-knowledge-admin"] }); toast.success("Deleted."); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="slug (lowercase-hyphens; auto if blank)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        <Input placeholder="Category (e.g. Feature Registry)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Related feature key (optional)" value={form.related_feature_key} onChange={(e) => setForm({ ...form, related_feature_key: e.target.value })} />
        <Input placeholder="Related route (optional, e.g. /dashboard/hive-exec/features)" value={form.related_route} onChange={(e) => setForm({ ...form, related_route: e.target.value })} />
      </div>
      <Textarea placeholder="Body (markdown allowed)" rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      <div className="flex items-center justify-between gap-2">
        <div>
          {entry && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del.mutate()} disabled={del.isPending}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !form.title || !form.category || !form.body}>Save</Button>
        </div>
      </div>
    </div>
  );
}
