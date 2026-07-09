import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getClientSpecificTraining,
  draftClientSpecificTrainingWithNectar,
  draftClientSpecificTrainingBlank,
  attachClientSpecificTrainingDocument,
  updateClientSpecificTraining,
  publishClientSpecificTraining,
  extractPcspGoalsForTraining,
  saveReviewQuestions,
  type CSTContent,
  type CSTSection,
  type CSTItem,
  type CSTGoal,
  type CSTReviewQuestion,
} from "@/lib/client-specific-training.functions";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Loader2, CheckCircle2, RefreshCw, Pencil, Trash2, Plus, ArrowUp, ArrowDown, Shield, BookOpen, Upload } from "lucide-react";
import { toast } from "sonner";
import { setClientCaseload } from "@/lib/scheduler/setup.functions";

type Training = {
  id: string;
  title: string;
  content: CSTContent;
  goals: CSTGoal[] | null;
  review_questions: CSTReviewQuestion[] | null;
  attestation_statement: string;
  status: "draft" | "published";
  version: number;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
};

export function ClientSpecificTrainingCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const getFn = useServerFn(getClientSpecificTraining);
  const draftFn = useServerFn(draftClientSpecificTrainingWithNectar);
  const draftBlankFn = useServerFn(draftClientSpecificTrainingBlank);
  const attachDocFn = useServerFn(attachClientSpecificTrainingDocument);
  const updateFn = useServerFn(updateClientSpecificTraining);
  const publishFn = useServerFn(publishClientSpecificTraining);
  const extractGoalsFn = useServerFn(extractPcspGoalsForTraining);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showPcspPrompt, setShowPcspPrompt] = useState(false);

  const queryKey = ["client-specific-training", clientId];

  const { data: hasPcsp } = useQuery({
    queryKey: ["client-has-pcsp", clientId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("client_documents")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("document_type", "pcsp");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    staleTime: 30_000,
  });
  const pcspReady = hasPcsp === true;

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getFn({ data: { clientId } }),
  });
  const training = (data?.training ?? null) as Training | null;

  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState<CSTContent | null>(null);
  const [draftTitle, setDraftTitle] = useState<string>("");
  const [editingGoals, setEditingGoals] = useState(false);
  const [draftGoals, setDraftGoals] = useState<CSTGoal[] | null>(null);
  const [editingQuestions, setEditingQuestions] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);

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

  const blankMut = useMutation({
    mutationFn: () => draftBlankFn({ data: { clientId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Blank draft created — start writing.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleFileUpload(file: File) {
    if (!orgId) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${orgId}/${clientId}/person-specific/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      await attachDocFn({ data: { clientId, fileName: file.name, storagePath: path } });
      qc.invalidateQueries({ queryKey });
      toast.success("Document attached.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const updateMut = useMutation({
    mutationFn: (payload: { id: string; title?: string; content?: CSTContent }) => updateFn({ data: payload }),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success("Saved."); setEditing(false); setDraftContent(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveGoalsMut = useMutation({
    mutationFn: (payload: { id: string; goals: CSTGoal[] }) => updateFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Goals saved.");
      setEditingGoals(false);
      setDraftGoals(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const extractGoalsMut = useMutation({
    mutationFn: () => extractGoalsFn({ data: { clientId } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.reason);
        return;
      }
      qc.invalidateQueries({ queryKey });
      toast.success(`Extracted ${res.goalCount} goal${res.goalCount === 1 ? "" : "s"} — review below.`);
    },
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

  function startEditGoals() {
    if (!training) return;
    setDraftGoals(structuredClone(training.goals ?? []));
    setEditingGoals(true);
  }
  function cancelEditGoals() { setEditingGoals(false); setDraftGoals(null); }
  function saveGoals() {
    if (!training || draftGoals === null) return;
    saveGoalsMut.mutate({ id: training.id, goals: draftGoals });
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground"><Loader2 className="inline h-3.5 w-3.5 animate-spin mr-1.5" />Loading…</div>;
  }

  const pcspDialog = (
    <Dialog open={showPcspPrompt} onOpenChange={setShowPcspPrompt}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Upload the PCSP first</DialogTitle>
          <DialogDescription>
            This client has no PCSP on file. Support strategies and client-specific training are built from the PCSP, so you'll need to upload it before drafting. Add it under the client's Files tab.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowPcspPrompt(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!training) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
          No client-specific training yet. NECTAR will assemble a draft from this client's own authoritative data (intake, PCSP goals, billing codes, active meds, BSP status & published behaviors, rights summary, documents). NECTAR <strong>presents verbatim</strong> — it does not author care guidance.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => pcspReady ? draftMut.mutate(false) : setShowPcspPrompt(true)} disabled={draftMut.isPending}>
            {draftMut.isPending
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />}
            Build from PCSP goals (NECTAR)
          </Button>
          <Button size="sm" variant="outline" onClick={() => pcspReady ? blankMut.mutate() : setShowPcspPrompt(true)} disabled={blankMut.isPending}>
            {blankMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Write manually
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => pcspReady ? fileInputRef.current?.click() : setShowPcspPrompt(true)}
            disabled={uploading || !orgId}
          >
            {uploading
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            Upload document
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.txt,.doc"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file);
              e.target.value = "";
            }}
          />
        </div>
        {pcspDialog}
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
              <Button variant="outline" size="sm" onClick={() => pcspReady ? startEdit() : setShowPcspPrompt(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
              <Button variant="outline" size="sm" onClick={() => pcspReady ? draftMut.mutate(true) : setShowPcspPrompt(true)} disabled={draftMut.isPending}>
                {draftMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                Rebuild with NECTAR
              </Button>
              {training.status !== "published" && (
                <Button size="sm" onClick={() => pcspReady ? setShowPublishDialog(true) : setShowPcspPrompt(true)} disabled={publishMut.isPending}>
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

      {!pcspReady && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
          Upload a PCSP to get started — this training is built from the PCSP. Publishing and editing are disabled until a PCSP is on file (add it from the client's Files tab).
        </div>
      )}

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

      {/* PCSP Goals editor */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">PCSP Goals (in-depth, verbatim)</h4>
          <span className="text-xs text-muted-foreground">
            {(training.goals ?? []).length} goal{(training.goals ?? []).length === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {!editingGoals && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => extractGoalsMut.mutate()}
                  disabled={extractGoalsMut.isPending}
                >
                  {extractGoalsMut.isPending
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <BookOpen className="mr-1.5 h-3.5 w-3.5" />}
                  Extract goals from PCSP (NECTAR)
                </Button>
                {(training.goals ?? []).length > 0 && (
                  <Button variant="outline" size="sm" onClick={startEditGoals}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />Edit goals
                  </Button>
                )}
              </>
            )}
            {editingGoals && (
              <>
                <Button variant="ghost" size="sm" onClick={cancelEditGoals}>Cancel</Button>
                <Button size="sm" onClick={saveGoals} disabled={saveGoalsMut.isPending}>
                  {saveGoalsMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Save goals
                </Button>
              </>
            )}
          </div>
        </div>

        {editingGoals && draftGoals !== null ? (
          <GoalsEditor goals={draftGoals} onChange={setDraftGoals} />
        ) : (training.goals ?? []).length > 0 ? (
          <GoalsView goals={training.goals ?? []} />
        ) : (
          <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
            No in-depth goals yet. Click "Extract goals from PCSP (NECTAR)" to pull them from the uploaded PCSP document, or add them manually after clicking "Edit goals."
          </div>
        )}
      </div>

      {/* Review questions */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">Review questions</h4>
          <span className="text-xs text-muted-foreground">
            {(training.review_questions ?? []).length} question{(training.review_questions ?? []).length === 1 ? "" : "s"}
          </span>
          <div className="ml-auto">
            {!editingQuestions ? (
              <Button variant="outline" size="sm" onClick={() => setEditingQuestions(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                {(training.review_questions ?? []).length > 0 ? "Edit questions" : "Add questions"}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setEditingQuestions(false)}>Cancel</Button>
            )}
          </div>
        </div>
        {editingQuestions ? (
          <ReviewQuestionsEditor
            trainingId={training.id}
            questions={(training.review_questions ?? []) as CSTReviewQuestion[]}
            defaultTab="pcsp_goals"
            onSaved={() => { setEditingQuestions(false); qc.invalidateQueries({ queryKey }); }}
          />
        ) : (training.review_questions ?? []).length > 0 ? (
          <div className="space-y-1">
            {((training.review_questions ?? []) as CSTReviewQuestion[]).map((q, i) => (
              <div key={q.id} className="rounded border border-border/40 px-2 py-1 text-sm text-muted-foreground">
                <span className="font-mono text-[10px] text-accent mr-2">{q.tab}</span>
                {q.prompt}
                <span className="ml-1 text-xs text-muted-foreground/50">Q{i + 1}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
            No review questions yet. Add applied-reasoning prompts to require staff to reflect on what they've read.
          </div>
        )}
      </div>

      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Competency attestation (fixed)</div>
        <div className="italic">"{training.attestation_statement}"</div>
      </div>
      {pcspDialog}
      <PublishConfirmDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
        clientId={clientId}
        orgId={orgId}
        kindLabel="training"
        isPublishing={publishMut.isPending}
        publishAsync={() => publishMut.mutateAsync(training.id)}
      />
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

// ── Goals read-only view ────────────────────────────────────────────────────
export function GoalsView({ goals }: { goals: CSTGoal[] }) {
  return (
    <div className="space-y-3">
      {goals.map((g) => (
        <div key={g.id} className="rounded-lg border border-border/60 bg-card p-3 space-y-2">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-0.5">Goal</div>
            <p className="text-sm whitespace-pre-wrap">{g.goal || <span className="italic text-muted-foreground">(empty)</span>}</p>
          </div>
          {g.supports && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-0.5">Supports</div>
              <p className="text-sm whitespace-pre-wrap">{g.supports}</p>
            </div>
          )}
          {g.details && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-0.5">Details</div>
              <p className="text-sm whitespace-pre-wrap">{g.details}</p>
            </div>
          )}
          {g.job_codes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {g.job_codes.map((c) => (
                <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{c}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// ── Goals editor ─────────────────────────────────────────────────────────────
export function GoalsEditor({ goals, onChange }: { goals: CSTGoal[]; onChange: (next: CSTGoal[]) => void }) {
  function addGoal() {
    onChange([...goals, {
      id: `s_${Math.random().toString(36).slice(2, 10)}`,
      goal: "", supports: "", details: "", job_codes: [],
    }]);
  }
  function removeGoal(idx: number) { onChange(goals.filter((_, i) => i !== idx)); }
  function patchGoal(idx: number, patch: Partial<CSTGoal>) {
    const next = [...goals];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {goals.map((g, idx) => (
        <div key={g.id} className="rounded-lg border border-border/60 bg-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Goal {idx + 1}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeGoal(idx)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Goal</label>
            <Textarea
              value={g.goal}
              rows={3}
              onChange={(e) => patchGoal(idx, { goal: e.target.value })}
              placeholder="Verbatim goal/objective statement from PCSP"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Supports (what staff do)</label>
            <Textarea
              value={g.supports}
              rows={2}
              onChange={(e) => patchGoal(idx, { supports: e.target.value })}
              placeholder="Support strategy text (verbatim)"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Objective / measure</label>
            <Textarea
              value={g.details}
              rows={2}
              onChange={(e) => patchGoal(idx, { details: e.target.value })}
              placeholder="Measures, frequency, target, timeline (verbatim)"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Service codes</label>
            <Input
              value={g.job_codes.join(", ")}
              onChange={(e) => patchGoal(idx, {
                job_codes: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
              })}
              placeholder="e.g. SLN, DSI"
            />
            <p className="text-[11px] text-muted-foreground">
              Staff only see this goal during shifts clocked under one of these codes.
            </p>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addGoal}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />Add goal
      </Button>
    </div>
  );
}

// ── Review questions editor ───────────────────────────────────────────────────
export function ReviewQuestionsEditor({
  trainingId,
  questions,
  defaultTab,
  onSaved,
}: {
  trainingId: string;
  questions: CSTReviewQuestion[];
  defaultTab?: string;
  onSaved: () => void;
}) {
  const saveQFn = useServerFn(saveReviewQuestions);
  const [draft, setDraft] = useState<CSTReviewQuestion[]>(() => structuredClone(questions));
  const [saving, setSaving] = useState(false);

  function addQ() {
    setDraft((prev) => [...prev, { id: `q_${Math.random().toString(36).slice(2, 10)}`, tab: defaultTab ?? "pcsp_goals", prompt: "" }]);
  }
  function removeQ(idx: number) { setDraft((prev) => prev.filter((_, i) => i !== idx)); }
  function patchQ(idx: number, patch: Partial<CSTReviewQuestion>) {
    setDraft((prev) => { const next = [...prev]; next[idx] = { ...next[idx], ...patch }; return next; });
  }

  async function save() {
    setSaving(true);
    try {
      await saveQFn({ data: { id: trainingId, review_questions: draft } });
      onSaved();
      toast.success("Review questions saved.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Ask staff to apply the information — e.g. "What will you do on shift to support this goal?" — not simple recall.
        The tab label maps to the content tab the question relates to.
      </p>
      {draft.map((q, idx) => (
        <div key={q.id} className="rounded-lg border border-border/60 bg-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Question {idx + 1}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeQ(idx)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Tab label</label>
            <Input
              value={q.tab}
              onChange={(e) => patchQ(idx, { tab: e.target.value })}
              placeholder="e.g. pcsp_goals, medications, safety, support_strategies"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Question prompt</label>
            <Textarea
              value={q.prompt}
              rows={2}
              onChange={(e) => patchQ(idx, { prompt: e.target.value })}
              placeholder="Applied-reasoning question for staff"
            />
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addQ}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />Add question
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Save questions
        </Button>
      </div>
    </div>
  );
}

// ── Publish confirmation dialog ────────────────────────────────────────────
// Shown when admin clicks "Approve & Publish" on a draft training. Confirms
// who currently receives the training (= assigned caseload) and optionally
// assigns additional staff before publishing. Assignment remains the single
// source of truth for access.
export function PublishConfirmDialog({
  open, onOpenChange, clientId, orgId, kindLabel, isPublishing, publishAsync, questions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  orgId?: string;
  kindLabel: string;
  isPublishing: boolean;
  publishAsync: () => Promise<unknown>;
  questions?: Array<{ id: string; prompt: string }>;
}) {

  const qc = useQueryClient();
  const setCaseloadFn = useServerFn(setClientCaseload);
  const [stagedAdds, setStagedAdds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const staffQ = useQuery({
    enabled: !!orgId && open,
    queryKey: ["caseload-editor-staff", orgId],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data: members, error: mErr } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId!)
        .eq("active", true);
      if (mErr) throw mErr;
      const ids = (members ?? [])
        .map((m) => (m as { user_id: string | null }).user_id)
        .filter((x): x is string => !!x);
      if (ids.length === 0) return [];
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, full_name, is_active")
        .in("id", ids);
      if (pErr) throw pErr;
      return ((profs ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null;
        full_name: string | null; is_active: boolean | null;
      }>)
        .filter((p) => p.is_active !== false)
        .map((p) => ({
          id: p.id,
          name:
            (p.full_name?.trim()) ||
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
            "Staff",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const currentQ = useQuery({
    enabled: !!orgId && !!clientId && open,
    queryKey: ["caseload-editor-current", orgId, clientId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("staff_assignments")
        .select("staff_id")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId);
      if (error) throw error;
      return (data ?? []).map((r) => (r as { staff_id: string }).staff_id);
    },
  });

  const staff = staffQ.data ?? [];
  const currentIds = currentQ.data ?? [];
  const currentSet = new Set(currentIds);
  const assignedStaff = staff.filter((s) => currentSet.has(s.id));
  const availableStaff = staff.filter((s) => !currentSet.has(s.id));
  const totalAfter = currentIds.length + stagedAdds.size;
  const zeroWarn = totalAfter === 0;
  const loading = staffQ.isLoading || currentQ.isLoading;

  async function handleConfirm() {
    if (!orgId) return;
    setBusy(true);
    try {
      const adds = Array.from(stagedAdds);
      if (adds.length > 0) {
        await setCaseloadFn({
          data: {
            organization_id: orgId,
            client_id: clientId,
            staff_ids: [...currentIds, ...adds],
          },
        });
        qc.invalidateQueries({ queryKey: ["caseload-editor-current"] });
        qc.invalidateQueries({ queryKey: ["caseload"] });
        qc.invalidateQueries({ queryKey: ["my-assignments"] });
        qc.invalidateQueries({ queryKey: ["scheduler-data"] });
      }
      await publishAsync();
      const total = currentIds.length + adds.length;
      toast.success(`Published — ${total} assigned staff will receive it.`);
      setStagedAdds(new Set());
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy && !isPublishing) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approve &amp; publish — who will get this?</DialogTitle>
          <DialogDescription>
            Staff assigned to this client automatically receive this {kindLabel} when published.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {questions && questions.length > 0 && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Questions staff will complete with the client ({questions.length})
              </p>
              <ol className="list-decimal pl-5 space-y-2.5 text-sm leading-relaxed marker:text-muted-foreground">
                {questions.map((q) => (
                  <li key={q.id} className="pl-1">{q.prompt}</li>
                ))}
              </ol>
              <p className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                Staff complete these together with the person and attest the responses reflect the individual's own perspective.
              </p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Currently assigned
            </p>

            {loading ? (
              <p className="text-sm text-muted-foreground"><Loader2 className="inline h-3.5 w-3.5 animate-spin mr-1.5" />Loading…</p>
            ) : assignedStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No staff assigned yet.</p>
            ) : (
              <ul className="space-y-1">
                {assignedStaff.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm rounded border border-border/60 bg-muted/30 px-2 py-1">
                    <span>{s.name}</span>
                    <span className="text-xs text-muted-foreground">will receive automatically</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Add more staff (assigns them to this client)
            </p>
            {loading ? null : availableStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">All active staff are already assigned.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto rounded border p-2">
                {availableStaff.map((s) => {
                  const checked = stagedAdds.has(s.id);
                  return (
                    <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-muted">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setStagedAdds((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(s.id); else next.delete(s.id);
                            return next;
                          });
                        }}
                      />
                      <span>{s.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {zeroWarn && !loading && (
            <div className="rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
              No staff are assigned to this client yet. You can publish now — staff will receive this {kindLabel} automatically once you assign them. Publish anyway?
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy || isPublishing}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={busy || isPublishing || loading || !orgId}>
            {(busy || isPublishing)
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
            Approve &amp; publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
