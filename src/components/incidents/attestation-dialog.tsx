import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export type AttestationSignature = {
  attested: true;
  signed_name: string;
  signed_title: string;
  attestation_text: string;
};

export function AttestationDialog({
  open,
  onClose,
  title,
  intro,
  attestationText,
  children,
  submitLabel = "Sign & save",
  onSubmit,
  pending,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro?: React.ReactNode;
  attestationText: string;
  /** Extra action-specific inputs (e.g. method, notes). */
  children?: React.ReactNode;
  submitLabel?: string;
  onSubmit: (sig: AttestationSignature) => void;
  pending?: boolean;
  disabled?: boolean;
}) {
  const [name, setName] = useState("");
  const [titleVal, setTitleVal] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setTitleVal("");
      setChecked(false);
    }
  }, [open]);

  const canSubmit =
    !pending && !disabled && checked && name.trim().length >= 2 && titleVal.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          {intro}
          {children}
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:bg-amber-950/30 dark:border-amber-800">
            <p className="font-semibold text-amber-900 dark:text-amber-100">Attestation</p>
            <p className="mt-1 whitespace-pre-wrap text-amber-950 dark:text-amber-50">{attestationText}</p>
            <label className="mt-2 flex items-start gap-2 text-amber-950 dark:text-amber-50">
              <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} />
              <span>I confirm the above attestation is true and accurate.</span>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold">Your full name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label className="text-xs font-semibold">Your title *</Label>
              <Input value={titleVal} onChange={(e) => setTitleVal(e.target.value)} maxLength={120} placeholder="e.g. Program Director" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Signing at: {new Date().toLocaleString()}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            disabled={!canSubmit}
            onClick={() => onSubmit({
              attested: true,
              signed_name: name.trim(),
              signed_title: titleVal.trim(),
              attestation_text: attestationText,
            })}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
