import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Hexagon, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  detectAndOfferActions,
  proposeStaffChecklistFromDocument,
} from "@/lib/nectar-document-actions.functions";
import { markAsAuthoritativeSource } from "@/lib/authoritative-sources.functions";

/**
 * Curated post-upload offer. The actions shown here are produced entirely by
 * the server-side capability registry (live + applies-to-type only). The UI
 * itself dispatches only to known live handlers; dormant actions cannot
 * reach this dialog by construction.
 *
 * Every action PROPOSES — it never acts on provider data unilaterally.
 */
export function NectarDocumentActionsDialog({
  documentId,
  open,
  onOpenChange,
}: {
  documentId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const detect = useServerFn(detectAndOfferActions);
  const propose = useServerFn(proposeStaffChecklistFromDocument);
  const markAuth = useServerFn(markAsAuthoritativeSource);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const offer = useQuery({
    queryKey: ["nectar-doc-offer", documentId],
    queryFn: () => detect({ data: { documentId: documentId! } }),
    enabled: open && !!documentId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) setBusyKey(null);
  }, [open]);

  const run = useMutation({
    mutationFn: async (handler: string) => {
      if (!documentId) return;
      setBusyKey(handler);
      if (handler === "add_to_authoritative_sources") {
        await markAuth({
          data: {
            documentId,
            authoritativeKind: "other",
            isAuthoritative: true,
          },
        });
        return { msg: "Added to your authoritative sources." };
      }
      if (handler === "propose_staff_checklist_from_document") {
        const r = (await propose({ data: { documentId } })) as { message: string };
        return { msg: r.message };
      }
      throw new Error("Unknown handler");
    },
    onSuccess: (r) => {
      if (r?.msg) toast.success(r.msg);
      setBusyKey(null);
    },
    onError: (e) => {
      toast.error((e as Error).message);
      setBusyKey(null);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-700,#b45309)]">
            <Sparkles className="h-3.5 w-3.5" /> NECTAR
          </div>
          <DialogTitle className="text-base">
            {offer.isLoading ? "Reading your document…" : "What I can do with this"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {offer.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Detecting document type…
            </div>
          ) : offer.error ? (
            <p className="text-sm text-rose-700">
              Couldn't read this document right now. You can still find it in your
              documents list.
            </p>
          ) : offer.data ? (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                <Hexagon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--amber-600,#d97706)]" />
                <div className="space-y-1">
                  <div className="text-foreground">{offer.data.prompt}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      detected: {offer.data.detectedTypeLabel}
                    </Badge>
                    {typeof offer.data.confidence === "number" && (
                      <span>
                        confidence {Math.round(offer.data.confidence * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {offer.data.actions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing specialized right now — your document is saved and
                  searchable.
                </p>
              ) : (
                <ul className="space-y-2">
                  {offer.data.actions.map((a) => (
                    <li key={a.action_key}>
                      <button
                        type="button"
                        disabled={run.isPending}
                        onClick={() => run.mutate(a.handler)}
                        className="flex w-full flex-col items-start gap-1 rounded-xl border border-border/60 bg-card p-3 text-left text-sm transition hover:border-[color:var(--amber-400,#f4a93a)] hover:bg-[color:var(--amber-50,#fffbeb)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          {busyKey === a.handler && run.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5 text-[color:var(--amber-600,#d97706)]" />
                          )}
                          {a.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {a.helper}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={run.isPending}
          >
            Nothing right now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
