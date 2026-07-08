/**
 * DocumentEffectiveDatingDialog
 *
 * Post-upload dialog that (a) asks the provider whether the just-uploaded
 * document is replacing an existing current document of the same type on
 * the same subject, and (b) captures effective dates.
 *
 * Provider-owns-it framing:
 *   - The provider sets/confirms effective dates. HIVE prompts; it does not
 *     decide.
 *   - Three effective_to modes: fixed date, ongoing, until replaced.
 *   - When a replacement is confirmed, the old doc is auto-outdated and its
 *     open-ended range is closed to the day before the new effective_from.
 *
 * Pass 2: NECTAR proposes candidate dates + a source snippet + confidence.
 * The provider ALWAYS confirms. If they change any proposed date, we record
 * date_source=provider_entered; if they accept as-is, from_document.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  detectEffectiveDates,
  findCurrentSibling,
  setEffectiveDates,
  replaceDocument,
  type DocKind,
} from "@/lib/document-effective-dating.functions";

type Mode = "fixed_date" | "ongoing" | "until_replaced";

export function DocumentEffectiveDatingDialog({
  open,
  onOpenChange,
  organizationId,
  kind,
  documentId,
  documentType,
  documentTypeLabel,
  clientId,
  staffId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string | undefined;
  kind: DocKind;
  documentId: string | null;
  documentType: string;
  documentTypeLabel?: string;
  clientId?: string | null;
  staffId?: string | null;
  onDone?: () => void;
}) {
  const detectFn = useServerFn(detectEffectiveDates);
  const siblingFn = useServerFn(findCurrentSibling);
  const setDatesFn = useServerFn(setEffectiveDates);
  const replaceFn = useServerFn(replaceDocument);

  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [mode, setMode] = useState<Mode>("until_replaced");
  const [to, setTo] = useState("");
  const [replacing, setReplacing] = useState<"unknown" | "yes" | "no">("unknown");
  // Track what NECTAR originally proposed so we can decide date_source at save.
  const [proposed, setProposed] = useState<{
    from: string | null;
    to: string | null;
    mode: Mode | null;
  }>({ from: null, to: null, mode: null });
  const label = documentTypeLabel || documentType.replace(/_/g, " ");

  // Reset on open
  useEffect(() => {
    if (open) {
      setFrom(today);
      setMode("until_replaced");
      setTo("");
      setReplacing("unknown");
      setProposed({ from: null, to: null, mode: null });
    }
  }, [open, today]);

  const siblingQ = useQuery({
    enabled: open && !!organizationId && !!documentId,
    queryKey: ["doc-sibling", organizationId, kind, documentId, documentType, clientId ?? null, staffId ?? null],
    queryFn: async () => {
      const [detect, sib] = await Promise.all([
        detectFn({
          data: { organization_id: organizationId!, kind, document_id: documentId! },
        }),
        siblingFn({
          data: {
            organization_id: organizationId!,
            kind,
            document_type: documentType,
            exclude_document_id: documentId!,
            client_id: clientId ?? null,
            staff_id: staffId ?? null,
          },
        }),
      ]);
      return { detect, sibling: sib.sibling };
    },
  });

  // Prefill fields from NECTAR's proposal (provider still confirms/edits).
  useEffect(() => {
    const d = siblingQ.data?.detect;
    if (!d || !d.detected) return;
    const nextMode: Mode = (d.effective_to_mode as Mode | null) ?? (d.effective_to ? "fixed_date" : "until_replaced");
    setFrom(d.effective_from ?? today);
    setMode(nextMode);
    setTo(nextMode === "fixed_date" ? (d.effective_to ?? "") : "");
    setProposed({
      from: d.effective_from ?? null,
      to: d.effective_to ?? null,
      mode: nextMode,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siblingQ.data]);

  const detect = siblingQ.data?.detect;
  const detected = !!detect?.detected;
  const sibling = siblingQ.data?.sibling ?? null;
  const confidence = (detect?.confidence ?? "low") as "low" | "medium" | "high";
  const snippet = detect?.source_snippet ?? null;

  // date_source = from_document only when the provider accepts NECTAR's
  // proposal verbatim; any edit flips to provider_entered.
  const dateSource: "from_document" | "provider_entered" = useMemo(() => {
    if (!detected) return "provider_entered";
    const currentTo = mode === "fixed_date" ? to : null;
    const proposedTo = proposed.mode === "fixed_date" ? (proposed.to ?? null) : null;
    const same = proposed.from === from && proposed.mode === mode && currentTo === proposedTo;
    return same ? "from_document" : "provider_entered";
  }, [detected, proposed, from, mode, to]);

  const disabledSave = useMemo(() => {
    if (!from) return true;
    if (mode === "fixed_date" && !to) return true;
    if (sibling && replacing === "unknown") return true;
    return false;
  }, [from, mode, to, sibling, replacing]);

  const save = useMutation({
    mutationFn: async () => {
      if (!organizationId || !documentId) throw new Error("Missing doc");
      await setDatesFn({
        data: {
          organization_id: organizationId,
          kind,
          document_id: documentId,
          effective_from: from,
          effective_to_mode: mode,
          effective_to: mode === "fixed_date" ? to : null,
          date_source: dateSource,
        },
      });
      if (sibling && replacing === "yes") {
        await replaceFn({
          data: {
            organization_id: organizationId,
            kind,
            old_document_id: sibling.id,
            new_document_id: documentId,
            new_effective_from: from,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success(
        sibling && replacing === "yes"
          ? `Filed. Previous ${label} moved to outdated.`
          : "Effective dates saved.",
      );
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!save.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Effective dates for this {label}</DialogTitle>
        </DialogHeader>

        {siblingQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> NECTAR is reading the file…
          </div>
        ) : (
          <div className="space-y-4">
            {sibling && (
              <div className="rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  A current {label} is already on file
                  {sibling.file_name ? ` (${sibling.file_name})` : ""}.
                </div>
                <div className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
                  Is this new upload replacing it?
                </div>
                <RadioGroup
                  value={replacing}
                  onValueChange={(v) => setReplacing(v as "yes" | "no")}
                  className="mt-2 flex flex-col gap-1.5 text-sm"
                >
                  <label className="flex items-center gap-2">
                    <RadioGroupItem value="yes" id="rep-yes" />
                    Yes — replace the current {label}. Mark the old one outdated.
                  </label>
                  <label className="flex items-center gap-2">
                    <RadioGroupItem value="no" id="rep-no" />
                    No — keep both (different document).
                  </label>
                </RadioGroup>
              </div>
            )}

            {detected && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium">
                    <Sparkles className="h-4 w-4 text-primary" />
                    NECTAR proposed dates from the file
                  </div>
                  <Badge
                    variant={confidence === "high" ? "default" : confidence === "medium" ? "secondary" : "outline"}
                    className="text-[10px] uppercase tracking-wide"
                  >
                    {confidence} confidence
                  </Badge>
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">{proposed.from ?? "—"}</span>
                  {" → "}
                  <span className="font-medium">
                    {proposed.mode === "fixed_date" ? (proposed.to ?? "—") : (proposed.mode ?? "—").replace("_", " ")}
                  </span>
                </div>
                {snippet && (
                  <blockquote className="mt-2 border-l-2 border-primary/40 pl-2 text-xs italic text-muted-foreground">
                    “{snippet}”
                  </blockquote>
                )}
                {confidence === "low" && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
                    Low confidence — please verify against the file before saving.
                  </div>
                )}
                <div className="mt-2 text-xs text-muted-foreground">
                  Confirm, edit, or override below. Nothing saves until you press Save.
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Effective from</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Effective to</Label>
                <Input
                  type="date"
                  value={to}
                  disabled={mode !== "fixed_date"}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder={mode === "fixed_date" ? "" : "—"}
                />
              </div>
            </div>

            <div>
              <Label className="mb-1 block">How does this document end?</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as Mode)}
                className="grid gap-1.5 text-sm"
              >
                <label className="flex items-start gap-2">
                  <RadioGroupItem value="fixed_date" id="m-fx" className="mt-0.5" />
                  <span>
                    <span className="font-medium">Fixed date</span> — I have a real end date.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <RadioGroupItem value="ongoing" id="m-og" className="mt-0.5" />
                  <span>
                    <span className="font-medium">Ongoing</span> — stays active indefinitely.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <RadioGroupItem value="until_replaced" id="m-ur" className="mt-0.5" />
                  <span>
                    <span className="font-medium">Until replaced</span> — active until a newer version is uploaded.
                  </span>
                </label>
              </RadioGroup>
            </div>

            <p className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground">
              You confirm and are responsible for the accuracy of these effective dates. HIVE surfaces
              and prompts — it does not decide dates or keep files current for you.
              {detected
                ? ` Saving as: ${dateSource === "from_document" ? "accepted NECTAR's read" : "provider-entered (edited)"}.`
                : " No dates found in the file — please enter them."}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Skip for now
          </Button>
          <Button onClick={() => save.mutate()} disabled={disabledSave || save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Save dates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
