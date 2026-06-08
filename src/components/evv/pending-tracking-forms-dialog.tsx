import { Link } from "@tanstack/react-router";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, ExternalLink } from "lucide-react";
import { useState } from "react";

export type PendingForm = {
  formId: string;
  formName: string;
  clientId: string;
  shiftId: string;
};

type Mode = "clockout" | "clockin";

/**
 * Front-of-punch dialog listing unfinished REQUIRED tracking forms.
 * - mode="clockout": offers "Skip with reason" (caller writes a
 *   shift_completeness_flags row + proceeds). Never traps the caregiver.
 * - mode="clockin":  no skip path for regular staff; the only exits are
 *   "Complete now" or "Cancel" (cancel = don't start the shift).
 *
 * "Complete now" opens the form runner in a NEW TAB so this dialog and
 * the punch state stay intact for the caregiver to come back to.
 */
export function PendingTrackingFormsDialog({
  open,
  mode,
  pending,
  onClose,
  onSkipWithReason,
  onProceedAfterRecheck,
  busy,
}: {
  open: boolean;
  mode: Mode;
  pending: PendingForm[];
  onClose: () => void;
  /** Clock-out only: caller persists the flag and continues clock-out. */
  onSkipWithReason?: (reason: string) => void | Promise<void>;
  /** Caller may re-run the lookup; if cleared, proceed. */
  onProceedAfterRecheck?: () => void | Promise<void>;
  busy?: boolean;
}) {
  const [reason, setReason] = useState("");
  const title =
    mode === "clockout"
      ? "Tracking form(s) required before clock-out"
      : "Finish required tracking form(s) before starting a new shift";
  const description =
    mode === "clockout"
      ? "These forms are required before ending this shift. You can complete them now, or skip with a reason — your shift will still clock out."
      : "These forms were marked required from a prior shift. Please complete them before starting a new shift.";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {pending.map((p) => (
            <li
              key={`${p.formId}:${p.shiftId}`}
              className="flex items-start gap-2 rounded-md border border-border bg-card p-2.5"
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#137182]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{p.formName}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-1 min-h-[44px]">
                <Link
                  to="/dashboard/forms/$formId/fill"
                  params={{ formId: p.formId }}
                  search={{ clientId: p.clientId }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Complete now <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>

        {mode === "clockout" && (
          <div className="space-y-1.5">
            <Label htmlFor="track-skip-reason" className="text-xs">
              Skip reason (required to clock out without completing)
            </Label>
            <Textarea
              id="track-skip-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Briefly explain why these forms aren't being completed now…"
              rows={2}
              className="text-sm"
            />
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          {onProceedAfterRecheck && (
            <Button
              variant="secondary"
              onClick={() => onProceedAfterRecheck()}
              disabled={busy}
              className="min-h-[44px]"
            >
              I've completed them — re-check
            </Button>
          )}
          {mode === "clockout" && onSkipWithReason && (
            <Button
              onClick={() => onSkipWithReason(reason.trim())}
              disabled={busy || reason.trim().length < 5}
              className="min-h-[44px]"
            >
              Skip & clock out
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
