// NECTAR-driven ask. The resolution UI is type-driven — not uniformly
// three-path. Only data-rich gaps show an upload option; confident
// suggestions show Confirm/Edit; simple booleans show Yes/None.
//
// Upload behavior is HONEST in this prompt: the file is attached to the
// client profile (storage + client_documents row). It does NOT pretend
// NECTAR read the file — no auto-prefill, no "NECTAR found" banner. The
// extraction wiring lands in a later prompt.
import { useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Upload, Loader2, Paperclip, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { attachClientDocument } from "@/lib/import-checklist.functions";

export type NectarAskKind = "confident_suggestion" | "data_rich_gap" | "simple_yes_no";

export type NectarAskProps = {
  question: string;
  /** Plain-text summary of NECTAR's finding/suggestion, when present. */
  finding?: string | null;
  kind: NectarAskKind;
  /** Required when kind === "data_rich_gap" and Upload is offered. */
  clientId?: string;
  /** Storage document_type when uploading (e.g. "bsp", "immunizations"). */
  uploadDocumentType?: string;
  /** Suggested value to use when user clicks "Confirm" on a confident suggestion. */
  onConfirm?: () => Promise<void> | void;
  /** Yes handler for simple_yes_no kind. */
  onYes?: () => Promise<void> | void;
  /** "No / none" handler (all kinds where rejection makes sense). */
  onNone?: () => Promise<void> | void;
  /** Manual form revealed when "Fill in myself" / "Edit" is clicked. */
  manualForm?: ReactNode;
  /** Optional extra context line (e.g. extraction snippet). */
  context?: string | null;
  /** When set, ask renders in "answered" mode with this summary. */
  answeredSummary?: string | null;
};

export function NectarAsk({
  question,
  finding,
  kind,
  clientId,
  uploadDocumentType,
  onConfirm,
  onYes,
  onNone,
  manualForm,
  context,
  answeredSummary,
}: NectarAskProps) {
  const [mode, setMode] = useState<"choose" | "manual">("choose");
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachFn = useServerFn(attachClientDocument);

  if (answeredSummary) {
    return (
      <div className="rounded-md border border-emerald-300/60 bg-emerald-50/30 p-3 text-sm dark:bg-emerald-950/10">
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">{question}</div>
            <div className="mt-0.5 font-medium">{answeredSummary}</div>
            {attachedFile && (
              <div className="mt-1 text-xs text-muted-foreground">
                <Paperclip className="mr-1 inline h-3 w-3" />
                {attachedFile} · attached to profile
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className="text-xs text-primary hover:underline"
          >
            <Pencil className="mr-1 inline h-3 w-3" />Edit
          </button>
        </div>
        {mode === "manual" && manualForm && (
          <div className="mt-3 border-t border-emerald-300/40 pt-3">{manualForm}</div>
        )}
      </div>
    );
  }

  const wrap = async (label: string, fn?: () => Promise<void> | void) => {
    if (!fn) return;
    try {
      setBusy(label);
      await fn();
    } catch (e) {
      toast.error((e as Error).message ?? "Failed");
    } finally {
      setBusy(null);
    }
  };

  const onUpload: React.ChangeEventHandler<HTMLInputElement> = async (ev) => {
    const f = ev.target.files?.[0];
    if (!f || !clientId || !uploadDocumentType) return;
    try {
      setBusy("upload");
      const path = `${clientId}/${uploadDocumentType}/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage
        .from("client-documents")
        .upload(path, f, { upsert: false, contentType: f.type });
      if (error) throw error;
      await attachFn({
        data: {
          clientId,
          documentType: uploadDocumentType,
          fileName: f.name,
          storagePath: path,
        },
      });
      setAttachedFile(f.name);
      toast.success(`${f.name} attached to profile.`);
      // Honest: open the manual form blank after attaching — NECTAR has NOT
      // read the file in this prompt.
      setMode("manual");
    } catch (e) {
      toast.error((e as Error).message ?? "Upload failed");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-md border border-amber-300/60 bg-amber-50/20 p-3 text-sm dark:bg-amber-950/10">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
        <div className="flex-1 space-y-1">
          <div className="font-medium">{question}</div>
          {finding && (
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-primary">NECTAR:</span> {finding}
            </div>
          )}
          {context && <div className="text-xs text-muted-foreground">{context}</div>}
        </div>
      </div>

      {mode === "choose" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {kind === "confident_suggestion" && (
            <>
              <Button size="sm" disabled={!!busy} onClick={() => wrap("confirm", onConfirm)}>
                {busy === "confirm" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                Confirm
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setMode("manual")}>
                <Pencil className="mr-1 h-3 w-3" />Edit
              </Button>
            </>
          )}

          {kind === "data_rich_gap" && (
            <>
              <Button size="sm" disabled={!!busy} onClick={() => setMode("manual")}>
                Fill in myself
              </Button>
              {clientId && uploadDocumentType && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    {busy === "upload" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                    Upload document
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={onUpload}
                  />
                </>
              )}
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => wrap("none", onNone)}>
                {busy === "none" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                No / none
              </Button>
            </>
          )}

          {kind === "simple_yes_no" && (
            <>
              <Button size="sm" disabled={!!busy} onClick={() => wrap("yes", onYes)}>
                {busy === "yes" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Yes
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => wrap("none", onNone)}>
                {busy === "none" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                No / none
              </Button>
            </>
          )}
        </div>
      )}

      {attachedFile && mode === "manual" && (
        <div className="mt-2 inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs">
          <Paperclip className="h-3 w-3" /> {attachedFile} · attached
          <Badge variant="outline" className="ml-1 text-[10px]">NECTAR has not read this yet</Badge>
        </div>
      )}

      {mode === "manual" && manualForm && (
        <div className="mt-3 border-t border-amber-300/40 pt-3">{manualForm}</div>
      )}
    </div>
  );
}
