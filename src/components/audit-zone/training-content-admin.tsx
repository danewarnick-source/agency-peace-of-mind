import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Sparkles,
  Upload,
  ClipboardPaste,
  FileText,
  Users,
  Trash2,
  Loader2,
  CheckCircle2,
  Pencil,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type Kind = "policies" | "person";
type Status = "draft" | "published";

type NectarStep =
  | {
      type: "lesson";
      kicker?: string;
      title?: string;
      lead?: string;
      callout?: { v?: string; t?: string; b?: string };
      facts?: { t?: string; b?: string }[];
      dropHeading?: string;
      drops?: [string, string][];
    }
  | {
      type: "check";
      kicker?: string;
      stem?: string;
      options?: { k?: string; t?: string; correct?: boolean; fb?: string }[];
    };

type NectarModule = {
  title: string;
  intro: string;
  estMin: number;
  steps: NectarStep[];
  attest: string;
};

type ProviderModule = {
  id: string;
  organization_id: string;
  kind: Kind;
  client_id: string | null;
  person_label: string | null;
  title: string;
  intro: string | null;
  est_min: number;
  steps: NectarStep[];
  attestation_statement: string;
  status: Status;
  source_doc_name: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type Client = { id: string; first_name: string | null; last_name: string | null };

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function fullClientName(c: Client) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

async function readUploadedText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".txt") || file.type.startsWith("text/")) {
    return await file.text();
  }
  // Best-effort: try reading; PDF/Word will be binary. We surface a friendly message.
  throw new Error(
    "Only plain-text uploads are supported for direct extraction. For PDF or Word, please paste the content into the text box.",
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                     */
/* ------------------------------------------------------------------ */

export function TrainingContentAdmin() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const [composer, setComposer] = useState<null | { kind: Kind; existingId?: string }>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Training Content</h2>
        <p className="text-xs text-muted-foreground">
          Upload your own policies & person-specific support information. Nectar formats them into
          staff-facing training modules and publishes them into the existing training experience.
        </p>
      </div>

      <Section
        title="Policies & Procedures"
        description={"Fills the staff topic \u201CP \u00B7 The agency\u2019s policies & procedures\u201D."}
        icon={<FileText className="h-4 w-4" />}
        orgId={orgId}
        kind="policies"
        onOpenComposer={(args) => setComposer(args)}
      />

      <Section
        title="Person-Specific Training"
        description='Each module appears as a card under "Person-Specific Training" for assigned staff only.'
        icon={<Users className="h-4 w-4" />}
        orgId={orgId}
        kind="person"
        onOpenComposer={(args) => setComposer(args)}
      />

      {composer && orgId && (
        <ComposerDialog
          orgId={orgId}
          kind={composer.kind}
          existingId={composer.existingId}
          onClose={() => setComposer(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section list                                                       */
/* ------------------------------------------------------------------ */

function Section({
  title,
  description,
  icon,
  kind,
  orgId,
  onOpenComposer,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  kind: Kind;
  orgId: string | null;
  onOpenComposer: (args: { kind: Kind; existingId?: string }) => void;
}) {
  const qc = useQueryClient();
  const { data: modules, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["provider-training-modules", orgId, kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_training_modules")
        .select(
          "id, organization_id, kind, client_id, person_label, title, intro, est_min, steps, attestation_statement, status, source_doc_name, version, created_at, updated_at",
        )
        .eq("organization_id", orgId!)
        .eq("kind", kind)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProviderModule[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("provider_training_modules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["provider-training-modules", orgId, kind] });
      toast.success("Module deleted.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const empty = !isLoading && (modules?.length ?? 0) === 0;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            {icon}
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button onClick={() => onOpenComposer({ kind })} size="sm">
          <Sparkles className="mr-1 h-4 w-4" />
          {kind === "person" ? "New person module" : "New policies module"}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {empty && (
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {kind === "policies"
              ? "Upload or paste your policies and procedures, and Nectar will format them into a staff training module."
              : "Upload or paste a person's support information, and Nectar will format it into a training module for the staff who support them."}
          </div>
        )}
        {(modules ?? []).map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between rounded-md border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{m.title}</p>
                <Badge variant={m.status === "published" ? "default" : "secondary"}>
                  {m.status}
                </Badge>
                <Badge variant="outline">v{m.version}</Badge>
                {kind === "person" && m.person_label && (
                  <Badge variant="outline">{m.person_label}</Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {m.steps?.length ?? 0} steps · ~{m.est_min} min · updated{" "}
                {new Date(m.updated_at).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenComposer({ kind, existingId: m.id })}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm("Delete this module? Staff completions remain on record.")) {
                    deleteMut.mutate(m.id);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Composer + review dialog                                           */
/* ------------------------------------------------------------------ */

type ComposerStage = "input" | "review";

function ComposerDialog({
  orgId,
  kind,
  existingId,
  onClose,
}: {
  orgId: string;
  kind: Kind;
  existingId?: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [stage, setStage] = useState<ComposerStage>(existingId ? "review" : "input");
  const [sourceText, setSourceText] = useState("");
  const [sourceDocName, setSourceDocName] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const [personLabel, setPersonLabel] = useState<string>("");
  const [draft, setDraft] = useState<NectarModule | null>(null);
  const [formatting, setFormatting] = useState(false);

  // For person modules: pick a client
  const { data: clients } = useQuery({
    enabled: kind === "person",
    queryKey: ["provider-training-clients", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId)
        .order("last_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  // Load existing module if editing
  const { data: existing } = useQuery({
    enabled: !!existingId,
    queryKey: ["provider-training-module", existingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_training_modules")
        .select("*")
        .eq("id", existingId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ProviderModule | null;
    },
  });

  // Seed editor when existing arrives
  useMemo(() => {
    if (!existing) return;
    setDraft({
      title: existing.title,
      intro: existing.intro ?? "",
      estMin: existing.est_min,
      steps: existing.steps ?? [],
      attest: existing.attestation_statement,
    });
    setClientId(existing.client_id ?? "");
    setPersonLabel(existing.person_label ?? "");
    setSourceDocName(existing.source_doc_name);
  }, [existing]);

  const formatWithNectar = async () => {
    if (sourceText.trim().length < 30) {
      toast.error("Please add more source content (at least a few sentences).");
      return;
    }
    if (kind === "person" && !clientId) {
      toast.error("Pick the person this module is about first.");
      return;
    }
    setFormatting(true);
    try {
      const { data, error } = await supabase.functions.invoke("format-training-content", {
        body: {
          kind,
          personLabel: kind === "person" ? personLabel || undefined : undefined,
          sourceText,
        },
      });
      if (error) throw error;
      if (!data?.module) throw new Error("Nectar did not return a module.");
      setDraft(data.module as NectarModule);
      setStage("review");
    } catch (e) {
      toast.error((e as Error).message || "Failed to format content.");
    } finally {
      setFormatting(false);
    }
  };

  const savePublishMut = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      if (!draft) throw new Error("No draft to save.");
      if (kind === "person" && !clientId) throw new Error("Select a person first.");
      const base = {
        organization_id: orgId,
        kind,
        client_id: kind === "person" ? clientId : null,
        person_label: kind === "person" ? personLabel || null : null,
        title: draft.title.trim() || "Training Module",
        intro: draft.intro?.trim() || null,
        est_min: draft.estMin,
        steps: draft.steps as unknown as any,
        attestation_statement:
          draft.attest?.trim() ||
          "I attest that I have read and understood this training material and will apply it in my role.",
        source_doc_name: sourceDocName,
        status: (publish ? "published" : "draft") as Status,
        created_by: user?.id ?? null,
      };
      if (existingId) {
        const { error } = await supabase
          .from("provider_training_modules")
          .update({ ...base, version: (existing?.version ?? 1) + (publish ? 1 : 0) })
          .eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("provider_training_modules").insert(base);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["provider-training-modules", orgId, kind] });
      toast.success(vars.publish ? "Published — visible to staff now." : "Saved as draft.");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    try {
      const txt = await readUploadedText(file);
      setSourceText(txt);
      setSourceDocName(file.name);
      toast.success(`Loaded ${file.name}.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existingId ? "Edit" : "New"}{" "}
            {kind === "policies" ? "Policies & Procedures" : "Person-Specific"} Module
          </DialogTitle>
        </DialogHeader>

        {/* PERSON: select client */}
        {kind === "person" && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Person</Label>
              <Select value={clientId} onValueChange={setClientId} disabled={!!existingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a person" />
                </SelectTrigger>
                <SelectContent>
                  {(clients ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {fullClientName(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Person label shown to staff</Label>
              <Input
                value={personLabel}
                onChange={(e) => setPersonLabel(e.target.value)}
                placeholder="e.g. Sample Client (test persona)"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                ⚠ Until the HIPAA backend is enabled, use fake/sample personas only — real
                client PHI must not be entered here.
              </p>
            </div>
          </div>
        )}

        {stage === "input" && (
          <div className="space-y-3">
            <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-sm">
              {kind === "policies"
                ? "Upload or paste your policies and procedures, and Nectar will format them into a staff training module."
                : "Upload or paste this person's support information, and Nectar will format it into a training module for the staff who support them."}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex">
                <input
                  type="file"
                  className="hidden"
                  accept=".txt,text/plain,.pdf,.doc,.docx,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted">
                  <Upload className="h-4 w-4" /> Upload file
                </span>
              </label>
              <span className="text-xs text-muted-foreground">
                <ClipboardPaste className="mr-1 inline h-3.5 w-3.5" />
                or paste below
              </span>
              {sourceDocName && (
                <Badge variant="outline" className="text-[11px]">
                  {sourceDocName}
                </Badge>
              )}
            </div>

            <Textarea
              rows={12}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder={
                kind === "policies"
                  ? "Paste your full policies & procedures document here…"
                  : "Paste this person's support plan, routines, communication tips, medical notes, etc…"
              }
            />

            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={formatWithNectar} disabled={formatting}>
                {formatting ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                Format with Nectar
              </Button>
            </DialogFooter>
          </div>
        )}

        {stage === "review" && draft && (
          <ReviewEditor
            draft={draft}
            onChange={setDraft}
            onBack={() => setStage("input")}
            onSaveDraft={() => savePublishMut.mutate({ publish: false })}
            onPublish={() => savePublishMut.mutate({ publish: true })}
            saving={savePublishMut.isPending}
            allowBack={!existingId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Review editor                                                      */
/* ------------------------------------------------------------------ */

function ReviewEditor({
  draft,
  onChange,
  onBack,
  onSaveDraft,
  onPublish,
  saving,
  allowBack,
}: {
  draft: NectarModule;
  onChange: (m: NectarModule) => void;
  onBack: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  saving: boolean;
  allowBack: boolean;
}) {
  const update = (patch: Partial<NectarModule>) => onChange({ ...draft, ...patch });
  const updateStep = (idx: number, patch: Partial<NectarStep>) => {
    const next = draft.steps.slice();
    next[idx] = { ...(next[idx] as any), ...patch } as NectarStep;
    onChange({ ...draft, steps: next });
  };
  const removeStep = (idx: number) => {
    const next = draft.steps.slice();
    next.splice(idx, 1);
    onChange({ ...draft, steps: next });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr,140px]">
        <div>
          <Label>Module title</Label>
          <Input value={draft.title} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <div>
          <Label>Estimated minutes</Label>
          <Input
            type="number"
            min={3}
            max={60}
            value={draft.estMin}
            onChange={(e) => update({ estMin: Math.max(3, Math.min(60, Number(e.target.value) || 10)) })}
          />
        </div>
      </div>

      <div>
        <Label>Intro</Label>
        <Textarea
          rows={2}
          value={draft.intro}
          onChange={(e) => update({ intro: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Steps ({draft.steps.length})</Label>
        {draft.steps.map((s, i) => (
          <Card key={i} className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <Badge variant={s.type === "check" ? "default" : "secondary"}>
                {s.type === "check" ? "Knowledge check" : "Lesson section"}
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => removeStep(i)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
            {s.type === "lesson" ? (
              <div className="space-y-2">
                <Input
                  value={s.title ?? ""}
                  onChange={(e) => updateStep(i, { title: e.target.value } as any)}
                  placeholder="Section title"
                />
                <Textarea
                  rows={2}
                  value={s.lead ?? ""}
                  onChange={(e) => updateStep(i, { lead: e.target.value } as any)}
                  placeholder="Plain-language summary"
                />
                <p className="text-[11px] text-muted-foreground">
                  Full source text is preserved in the "Go further" dropdowns ({s.drops?.length ?? 0}{" "}
                  item{(s.drops?.length ?? 0) === 1 ? "" : "s"}).
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Textarea
                  rows={2}
                  value={s.stem ?? ""}
                  onChange={(e) => updateStep(i, { stem: e.target.value } as any)}
                  placeholder="Question stem"
                />
                <p className="text-[11px] text-muted-foreground">
                  {(s.options?.length ?? 0)} options · correct:{" "}
                  {s.options?.find((o) => o.correct)?.k ?? "—"}
                </p>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div>
        <Label>Attestation</Label>
        <Textarea
          rows={3}
          value={draft.attest}
          onChange={(e) => update({ attest: e.target.value })}
        />
      </div>

      <DialogFooter className="gap-2">
        {allowBack && (
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        )}
        <Button variant="outline" onClick={onSaveDraft} disabled={saving}>
          Save draft
        </Button>
        <Button onClick={onPublish} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
          Publish
        </Button>
      </DialogFooter>
    </div>
  );
}
