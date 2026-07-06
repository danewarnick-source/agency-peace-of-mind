import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Hexagon,
  Loader2,
  Sparkles,
  
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,

} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ingestDocument } from "@/lib/nectar-documents.functions";
import { markAsAuthoritativeSource } from "@/lib/authoritative-sources.functions";

const AUTH_KINDS = [
  { value: "state_sow", label: "State Scope of Work (SOW)" },
  { value: "provider_contract", label: "Provider contract" },
  { value: "dspd_requirement", label: "DSPD requirement doc" },
  { value: "dhs_requirement", label: "DHS requirement doc" },
  { value: "public_record", label: "Other public-record requirement" },
  { value: "other", label: "Other" },
] as const;

type AuthKind = (typeof AUTH_KINDS)[number]["value"];

const ACCEPT =
  ".pdf,.txt,.md,.html,.htm,.csv,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.heic,application/pdf,text/*,image/*";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

interface Draft {
  file: File;
  title: string;
  kind: AuthKind;
  fiscalYear: string;
  effectiveStart: string;
  effectiveEnd: string;
  issuingAuthority: string;
  notes: string;
  routeWarning: string | null;
  /** Hard block: this file type is always a client/staff record, never authoritative. */
  routeBlock: { label: string; reason: string } | null;
}

// Hard block: documents that are always client/staff records.
// Rule: if a document is about one named person, it's a Company Doc.
// PCSPs and 1056 budgets are the canonical straddlers — force them to Company Docs.
function detectRouteBlock(fileName: string): { label: string; reason: string } | null {
  const n = fileName.toLowerCase();
  if (/\bpcsp\b/.test(n)) {
    return {
      label: "PCSP",
      reason:
        "PCSPs are always client records. Upload to Company Docs — NECTAR will extract the authoritative billing data (service codes, rates, max units, plan start/end, financial eligibility) into the billing layer for that client, while the PCSP file itself lives with the client's records.",
    };
  }
  if (/1056|budget/.test(n)) {
    return {
      label: "1056 budget",
      reason:
        "1056 budgets are client-specific. Upload to Company Docs against the client — NECTAR pulls the billing-relevant figures into the billing layer automatically.",
    };
  }
  return null;
}

// Soft guardrail: looks like a client/staff record but not hard-blocked.
function detectRouteWarning(fileName: string): string | null {
  const n = fileName.toLowerCase();
  const clientyHits = [
    { re: /referral/, label: "referral" },
    { re: /\bintake\b/, label: "intake" },
    { re: /assessment/, label: "assessment" },
    { re: /incident/, label: "incident report" },
    { re: /\bmar\b|emar/, label: "MAR / eMAR" },
    { re: /timesheet|payroll/, label: "timesheet" },
  ];
  const staffyHits = [
    { re: /cert(ificate|ification)?/, label: "certification" },
    { re: /training/, label: "training record" },
    { re: /\bcpr\b|first.?aid|bbp|tb.?test/, label: "staff training/health record" },
  ];
  for (const h of [...clientyHits, ...staffyHits]) {
    if (h.re.test(n)) return h.label;
  }
  return null;
}

function guessKind(fileName: string): AuthKind {
  const n = fileName.toLowerCase();
  if (/\bsow\b|scope.?of.?work/.test(n)) return "state_sow";
  if (/contract|agreement|msa/.test(n)) return "provider_contract";
  if (/dspd/.test(n)) return "dspd_requirement";
  if (/dhs|licens/.test(n)) return "dhs_requirement";
  return "other";
}

function guessFiscalYear(fileName: string): string {
  const m = fileName.match(/FY\s?(\d{2,4})/i);
  if (m) return `FY${m[1].slice(-2)}`;
  const y = fileName.match(/20\d{2}/);
  return y ? y[0] : "";
}

function makeDraft(file: File): Draft {
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return {
    file,
    title: base.charAt(0).toUpperCase() + base.slice(1),
    kind: guessKind(file.name),
    fiscalYear: guessFiscalYear(file.name),
    effectiveStart: "",
    effectiveEnd: "",
    issuingAuthority: "",
    notes: "",
    routeWarning: detectRouteWarning(file.name),
    routeBlock: detectRouteBlock(file.name),
  };
}

export interface AuthoritativeSourceDropProps {
  orgId: string;
  onUploaded: () => void;
  children: ReactNode;
}

/**
 * Page-level drag-and-drop for Authoritative Sources. Wrap the page content;
 * dropping files anywhere opens a labeling stepper modal before save.
 */
export function AuthoritativeSourceDrop({
  orgId,
  onUploaded,
  children,
}: AuthoritativeSourceDropProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ingest = useServerFn(ingestDocument);
  const mark = useServerFn(markAsAuthoritativeSource);

  const acceptFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.size > 0);
    if (!arr.length) return;
    setDrafts(arr.map(makeDraft));
    setStepIndex(0);
    setOpen(true);
  }, []);

  // Window-level drag handlers so the user can drop anywhere on the page.
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      dragCounter.current += 1;
      setDragging(true);
    };
    const onDragLeave = () => {
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
      acceptFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [acceptFiles]);

  const current = drafts[stepIndex];

  const updateCurrent = (patch: Partial<Draft>) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === stepIndex ? { ...d, ...patch } : d)),
    );
  };

  const removeCurrent = () => {
    setDrafts((prev) => {
      const next = prev.filter((_, i) => i !== stepIndex);
      if (!next.length) setOpen(false);
      return next;
    });
    setStepIndex((i) => Math.max(0, Math.min(i, drafts.length - 2)));
  };

  const saveOne = useMutation({
    mutationFn: async (d: Draft) => {
      const base64 = await fileToBase64(d.file);
      const docType =
        d.kind === "state_sow"
          ? "sow"
          : d.kind === "provider_contract"
            ? "contract"
            : "other";
      const tags = [
        "authoritative-source",
        d.kind,
        d.issuingAuthority ? `issuer:${d.issuingAuthority.slice(0, 32)}` : "",
      ].filter(Boolean);
      const r = await ingest({
        data: {
          organizationId: orgId,
          ownerKind: "company",
          documentType: docType as "sow" | "contract" | "other",
          title: d.title.trim(),
          fileName: d.file.name,
          mimeType: d.file.type || "application/octet-stream",
          fileBase64: base64,
          fiscalYear: d.fiscalYear || null,
          effectiveStart: d.effectiveStart || null,
          effectiveEnd: d.effectiveEnd || null,
          tags,
          autoParse: true,
        },
      });
      const doc = (r as { document?: { id?: string } }).document;
      if (!doc?.id) throw new Error("Upload failed");
      await mark({
        data: {
          documentId: doc.id,
          authoritativeKind: d.kind,
          isAuthoritative: true,
        },
      });
      return doc.id;
    },
  });

  const handleSaveAndNext = async () => {
    if (!current) return;
    if (current.routeBlock) {
      toast.error(
        `${current.routeBlock.label} files route to Company Docs, not Authoritative Sources.`,
      );
      return;
    }
    if (!current.title.trim()) {
      toast.error("Title is required");
      return;
    }
    try {
      await saveOne.mutateAsync(current);
      toast.success(`Saved "${current.title}". NECTAR is parsing in the background.`);
      onUploaded();
      const remaining = drafts.length - 1;
      if (remaining === 0) {
        setDrafts([]);
        setOpen(false);
      } else {
        setDrafts((prev) => prev.filter((_, i) => i !== stepIndex));
        setStepIndex((i) => Math.min(i, remaining - 1));
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const overallProgress = useMemo(() => {
    if (!drafts.length) return "";
    return `${stepIndex + 1} of ${drafts.length}`;
  }, [drafts.length, stepIndex]);

  return (
    <div className="relative">
      {children}

      {/* Hidden file input retained for potential programmatic use */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) acceptFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[color:var(--navy-900,#0b1733)]/40 backdrop-blur-sm">
          <div className="m-4 flex max-w-lg flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[color:var(--amber-400,#f4a93a)] bg-white/85 p-8 text-center shadow-xl">
            <span
              className="inline-flex h-14 w-14 items-center justify-center rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, var(--amber-100, #fef3c7), var(--amber-200, #fde68a))",
              }}
            >
              <Hexagon className="h-7 w-7 text-[color:var(--amber-600,#d97706)]" />
            </span>
            <div className="text-lg font-semibold text-[color:var(--navy-900,#0b1733)]">
              Drop to add to Authoritative Sources
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Drop a PDF, scan, Word, or spreadsheet — NECTAR will read each
              document, propose a label, and add it to the source-of-truth set
              the rest of HIVE reads from.
            </p>
          </div>
        </div>
      )}

      {/* Labeling stepper modal */}
      <Dialog
        open={open && !!current}
        onOpenChange={(v) => {
          if (!v && !saveOne.isPending) {
            setOpen(false);
            setDrafts([]);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="border-b border-border/60 bg-gradient-to-br from-[color:var(--amber-50,#fffbeb)] to-white px-5 py-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-700,#b45309)]">
              <Sparkles className="h-3.5 w-3.5" /> NECTAR · Label authoritative source
            </div>
            <DialogTitle className="text-base">
              {current ? current.file.name : "Label source"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Label each uploaded document so NECTAR knows how to read it before saving into your authoritative sources.
            </DialogDescription>

            {drafts.length > 1 && (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">
                  {overallProgress}
                </Badge>
                <span>Label each file, then save it into the store.</span>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {current && (
              <>
                {current.routeBlock ? (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50/80 p-3 text-xs text-rose-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1.5">
                      <div className="font-semibold">
                        {current.routeBlock.label} files always route to Company Docs.
                      </div>
                      <p className="leading-relaxed">{current.routeBlock.reason}</p>
                      <p className="leading-relaxed text-rose-800/80">
                        Authoritative Sources is state/contract documents that
                        apply across clients (SOW, contracts, DSPD/DHS
                        requirements). Anything tied to a specific client or
                        staff member belongs in Company Docs.
                      </p>
                      <div className="pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 border-rose-300 text-xs text-rose-900 hover:bg-rose-100"
                          onClick={removeCurrent}
                        >
                          Remove — I'll upload to Company Docs
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : current.routeWarning ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-400/60 bg-amber-50/80 p-3 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <div className="font-semibold">
                        This looks like a {current.routeWarning} — not an authoritative source.
                      </div>
                      <p className="leading-relaxed">
                        Authoritative Sources is for state/contract documents
                        only. Client- and staff-specific files belong in
                        Company Docs. You can still upload here if it really is
                        an authoritative source.
                      </p>
                      <div className="pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={removeCurrent}
                        >
                          Skip — I'll upload to Company Docs
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{current.file.name}</span>
                  <span className="ml-auto shrink-0">
                    {(current.file.size / 1024).toFixed(0)} KB
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Document type</Label>
                  <Select
                    value={current.kind}
                    onValueChange={(v) => updateCurrent({ kind: v as AuthKind })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTH_KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-[color:var(--amber-600,#d97706)]" />
                    NECTAR proposed from filename — confirm or change.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Title</Label>
                  <Input
                    value={current.title}
                    onChange={(e) => updateCurrent({ title: e.target.value })}
                    placeholder="e.g. Utah DSPD SOW — FY26"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fiscal year</Label>
                    <Input
                      value={current.fiscalYear}
                      onChange={(e) =>
                        updateCurrent({ fiscalYear: e.target.value })
                      }
                      placeholder="FY26"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Issuing authority</Label>
                    <Input
                      value={current.issuingAuthority}
                      onChange={(e) =>
                        updateCurrent({ issuingAuthority: e.target.value })
                      }
                      placeholder="e.g. Utah DSPD"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Effective start</Label>
                    <Input
                      type="date"
                      value={current.effectiveStart}
                      onChange={(e) =>
                        updateCurrent({ effectiveStart: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Effective end</Label>
                    <Input
                      type="date"
                      value={current.effectiveEnd}
                      onChange={(e) =>
                        updateCurrent({ effectiveEnd: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea
                    rows={2}
                    value={current.notes}
                    onChange={(e) => updateCurrent({ notes: e.target.value })}
                    placeholder="Anything HIVE/NECTAR should know about this document."
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-border/60 bg-background/80 px-5 py-3 backdrop-blur sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={removeCurrent}
              disabled={saveOne.isPending}
              className="gap-1"
            >
              <X className="h-3.5 w-3.5" /> Skip this file
            </Button>
            <Button
              type="button"
              onClick={handleSaveAndNext}
              disabled={saveOne.isPending || !current?.title.trim() || !!current?.routeBlock}
              className="gap-1 bg-[color:var(--amber-500,#f4a93a)] text-amber-950 hover:bg-[color:var(--amber-400,#f6b94d)]"
            >
              {saveOne.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {drafts.length > 1 ? "Save & next" : "Save source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
