import { useState } from "react";
import { ShieldAlert, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  recordAttestation,
  REDUCED_LIABILITY_NOTICE,
} from "@/lib/authoritative-sources.functions";

type Scope =
  | "document_upload"
  | "requirement_verify"
  | "audit_packet"
  | "form_submission"
  | "billing_520"
  | "generic";

/**
 * Reduced-liability attestation banner. Always-visible amber nudge. Inline
 * checkbox + Confirm button logs an immutable attestation row.
 *
 * - `mode="nudge"`: just the review-recommended copy (no button).
 * - `mode="confirm"`: shows checkbox + Confirm button and writes to
 *   `nectar_attestations` on click.
 */
export function AttestationBanner({
  organizationId,
  scope = "generic",
  scopeRefId,
  scopeRefType,
  statement,
  contextJson,
  mode = "nudge",
  className,
  onConfirmed,
  compact = false,
}: {
  organizationId: string;
  scope?: Scope;
  scopeRefId?: string | null;
  scopeRefType?: string | null;
  statement?: string;
  contextJson?: Record<string, unknown>;
  mode?: "nudge" | "confirm";
  className?: string;
  onConfirmed?: () => void;
  compact?: boolean;
}) {
  const finalStatement = statement ?? REDUCED_LIABILITY_NOTICE;
  const [agreed, setAgreed] = useState(false);
  const fn = useServerFn(recordAttestation);

  const mutation = useMutation({
    mutationFn: () =>
      fn({
        data: {
          organizationId,
          scope,
          scopeRefId: scopeRefId ?? null,
          scopeRefType: scopeRefType ?? null,
          statement: finalStatement,
          contextJson,
        },
      }),
    onSuccess: () => {
      toast.success("Attestation logged.");
      onConfirmed?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-300/70 bg-amber-50/70 px-4 py-3 text-amber-900 backdrop-blur",
        "dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
        compact && "px-3 py-2 text-sm",
        className,
      )}
      role="note"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1 space-y-2">
          <p className={cn("leading-relaxed", compact ? "text-[12px]" : "text-sm")}>
            {finalStatement}
          </p>
          {mode === "confirm" && (
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={agreed}
                  onCheckedChange={(c) => setAgreed(c === true)}
                />
                I have reviewed this information and confirm its accuracy.
              </label>
              <Button
                size="sm"
                className="bg-amber-500 text-amber-950 hover:bg-amber-400"
                disabled={!agreed || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                {mutation.isPending ? "Logging…" : "Confirm & log attestation"}
              </Button>
            </div>
          )}
          {mode === "nudge" && (
            <p className="text-[11px] uppercase tracking-wide opacity-80">
              Review recommended before relying on or submitting.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
