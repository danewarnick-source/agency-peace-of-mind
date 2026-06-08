import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getClientSpecificTraining,
  draftClientSpecificTrainingWithNectar,
  updateClientSpecificTraining,
  publishClientSpecificTraining,
  type CSTContent,
  type CSTSection,
  type CSTItem,
} from "@/lib/client-specific-training.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, CheckCircle2, RefreshCw, Pencil, Trash2, Plus, ArrowUp, ArrowDown, Shield } from "lucide-react";
import { toast } from "sonner";

type Training = {
  id: string;
  title: string;
  content: CSTContent;
  attestation_statement: string;
  status: "draft" | "published";
  version: number;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
};

export function ClientSpecificTrainingCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getClientSpecificTraining);
  const draftFn = useServerFn(draftClientSpecificTrainingWithNectar);
  const updateFn = useServerFn(updateClientSpecificTraining);
  const publishFn = useServerFn(publishClientSpecificTraining);

  const queryKey = ["client-specific-training", clientId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getFn({ data: { clientId } }),
  });
  const training = (data?.training ?? null) as Training | null;

  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState<CSTContent | null>(null);
  const [draftTitle, setDraftTitle] = useState<string>("");

  const workingContent: CSTContent = useMemo(() => {
    if (editing && draftContent) return draftContent;
    return training?.content ?? { sections: [] };
  }, [editing, draftContent, training]);

  const draftMut = useMutation({
    mutationFn: (rebuild: boolean) => draftFn({ data: { clientId, rebuild } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("NECTAR assembled a draft from this client's authoritative data.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: string; title?: string; content?: CSTContent }) => updateFn({ data: payload }),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success("Saved."); setEditing(false); setDraftContent(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => publishFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success("Approved & published."); },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit() {
    if (!training) return;
    setDraftContent(structuredClone(training.content));
    setDraftTitle(training.title);
    setEditing(true);
  }
  function cancelEdit() { setEditing(false); setDraftContent(null); }
  function saveEdit() {
    if (!training || !draftContent) return;
    updateMut.mutate({ id: training.id, title: draftTitle, content: draftContent });
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground"><Loader2 className="inline h-3.5 w-3.5 animate-spin mr-1.5" />Loading…</div>;
  }

  if (!training) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
          No client-specific training yet. NECTAR will assemble a draft from this client's own authoritative data (intake, PCSP goals, billing codes, active meds, BSP status & published behaviors, rights summary, documents). NECTAR <strong>presents verbatim</strong> — it does not author care guidance.
        </div>
        <Button onClick={() => draftMut.mutate(false)} disabled={draftMut.isPending}>
          {draftMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4 text-amber-500" />}
          Draft with NECTAR
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {training.status === "published" ? (
          <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Published v{training.version}</Badge>
        ) : (
          <Badge variant="secondary">Draft v{training.version}</Badge>
        )}
        <span className="text-xs text-muted-foreground">Updated {new Date(training.updated_at).toLocaleString()}</span>
        {training.approved_at && (
          <span className="text-xs text-muted-foreground">· Approved {new Date(training.approved_at).toLocaleString()}</span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {!editing && (
            <>
              <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
              <Button variant="outline" size="sm" onClick={() => draftMut.mutate(true)} disabled={draftMut.isPending}>
                {draftMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                Rebuild with NECTAR
              </Button>
              {training.status !== "published" && (
                <Button size="sm" onClick={() => publishMut.mutate(training.id)} disabled={publishMut.isPending}>
                  {publishMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  Approve & Publish
                </Button>
              )}
            </>
          )}
          {editing && (
            <>
              <Button variant="ghost" size="sm" onClick={cancelEdit}>Cancel</Button>
              <Button size="sm" onClick={saveEdit} disabled={updateMut.isPending}>
                {updateMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Save changes
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 flex gap-2">
        <Shield className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          NECTAR <strong>presents this client's own documented data verbatim</strong>. It does not write care techniques, interventions, or how-to.
          Review and edit before publishing. Editing a published version returns it to draft.
        </span>
      </div>

      {editing ? (
        <div className="space-y-2">
          <label className="text-xs font-medium">Title</label>
          <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} maxLength={200} />
        </div>
      ) : (
        <h3 className="text-base font-semibold">{training.title}</h3>
      )}

      <SectionsView
        content={workingContent}
        editing={editing}
        onChange={(next) => setDraftContent(next)}
      />

      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Competency attestation (fixed)</div>
        <div className="italic">"{training.attestation_statement}"</div>
      </div>
    </div>
  );
}

// ── Sections rendering & edit controls ─────────────────────────────────────
export function SectionsView({
  content, editing, onChange,
}: { content: CSTContent; editing: boolean; onChange: (next: CSTContent) => void }) {
  const sections = content.sections ?? [];

  function update(next: CSTSection[]) { onChange({ sections: next }); }
  function moveSection(idx: number, dir: -1 | 1) {
    const next = [...sections];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    update(next);
  }
  function deleteSection(idx: number) {
    update(sections.filter((_, i) => i !== idx));
  }
  function addSection() {
    update([...sections, { id: `s_${Math.random().toString(36).slice(2, 10)}`, title: "New section", items: [{ kind: "text", label: "Note", value: "" }] }]);
  }
  function patchSection(idx: number, patch: Partial<CSTSection>) {
    const next = [...sections];
    next[idx] = { ...next[idx], ...patch };
    update(next);
  }

  return (
    <div className="space-y-3">
      {sections.length === 0 && (
        <div className="text-sm text-muted-foreground">No sections.</div>
      )}
      {sections.map((sec, idx) => (
        <section key={sec.id} className="rounded-lg border border-border/60 bg-card p-3">
          <header className="flex items-center gap-2 mb-2">
            {editing ? (
              <Input
                value={sec.title}
                onChange={(e) => patchSection(idx, { title: e.target.value })}
                className="h-8 text-sm font-semibold"
              />
            ) : (
              <h4 className="text-sm font-semibold flex-1">{sec.title}</h4>
            )}
            {editing && (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSection(idx, -1)} disabled={idx === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSection(idx, 1)} disabled={idx === sections.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteSection(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </header>
          <div className="space-y-2">
            {sec.items.map((item, i) => (
              <ItemView
                key={i}
                item={item}
                editing={editing}
                onChange={(next) => {
                  const items = [...sec.items];
                  items[i] = next;
                  patchSection(idx, { items });
                }}
                onDelete={() => patchSection(idx, { items: sec.items.filter((_, j) => j !== i) })}
              />
            ))}
            {editing && (
              <Button variant="outline" size="sm" onClick={() => patchSection(idx, { items: [...sec.items, { kind: "text", label: "Note", value: "" }] })}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />Add note
              </Button>
            )}
          </div>
        </section>
      ))}
      {editing && (
        <Button variant="outline" onClick={addSection}><Plus className="mr-1.5 h-4 w-4" />Add section</Button>
      )}
    </div>
  );
}

function ItemView({
  item, editing, onChange, onDelete,
}: { item: CSTItem; editing: boolean; onChange: (next: CSTItem) => void; onDelete: () => void }) {
  if (item.kind === "text" || item.kind === "note") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
          {editing && (
            <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
          )}
        </div>
        {editing ? (
          <Textarea
            value={item.value}
            rows={2}
            onChange={(e) => onChange({ ...item, value: e.target.value })}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap">{item.value || <span className="text-muted-foreground italic">(empty)</span>}</p>
        )}
      </div>
    );
  }
  if (item.kind === "list") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
          {editing && (
            <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
          )}
        </div>
        {editing ? (
          <Textarea
            value={item.values.join("\n")}
            rows={Math.min(8, Math.max(2, item.values.length))}
            onChange={(e) => onChange({ ...item, values: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
        ) : (
          <ul className="list-disc pl-5 text-sm space-y-0.5">
            {item.values.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        )}
      </div>
    );
  }
  if (item.kind === "kv") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
          {editing && (
            <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
          )}
        </div>
        <div className="rounded-md border border-border/40 divide-y divide-border/40">
          {item.pairs.map((p, i) => (
            <div key={i} className="flex flex-col md:flex-row md:items-start gap-1 md:gap-3 px-2 py-1.5 text-sm">
              {editing ? (
                <>
                  <Input value={p.label} className="h-7 md:w-48" onChange={(e) => {
                    const pairs = [...item.pairs]; pairs[i] = { ...p, label: e.target.value }; onChange({ ...item, pairs });
                  }} />
                  <Textarea value={p.value} rows={1} className="flex-1 min-h-[36px]" onChange={(e) => {
                    const pairs = [...item.pairs]; pairs[i] = { ...p, value: e.target.value }; onChange({ ...item, pairs });
                  }} />
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                    onChange({ ...item, pairs: item.pairs.filter((_, j) => j !== i) });
                  }}><Trash2 className="h-3 w-3" /></Button>
                </>
              ) : (
                <>
                  <div className="md:w-48 text-xs font-medium text-muted-foreground">{p.label}</div>
                  <div className="flex-1 whitespace-pre-wrap">{p.value || <span className="text-muted-foreground italic">—</span>}</div>
                </>
              )}
            </div>
          ))}
          {editing && (
            <div className="px-2 py-1.5">
              <Button size="sm" variant="ghost" onClick={() => onChange({ ...item, pairs: [...item.pairs, { label: "", value: "" }] })}>
                <Plus className="mr-1 h-3 w-3" />Add row
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }
  // link
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
        {editing && (
          <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
        )}
      </div>
      <ul className="text-sm space-y-0.5">
        {item.links.map((l, i) => (
          <li key={i}>
            {l.href ? (
              <a href={l.href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{l.label}</a>
            ) : (
              <span>{l.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
