// Hard-delete a form. Tiered confirmation:
// - No ties: simple confirm.
// - Has ties: warning with real server-side counts + type-the-name to enable confirm.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, AlertTriangle } from "lucide-react";
import { deleteForm, getFormDeleteImpact } from "@/lib/forms.functions";
import { toast } from "sonner";

export function DeleteFormDialog({
  open, onOpenChange, formId, formName, onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  formId: string;
  formName: string;
  onDeleted?: () => void;
}) {
  const fetchImpact = useServerFn(getFormDeleteImpact);
  const doDelete = useServerFn(deleteForm);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: impact, isLoading } = useQuery({
    queryKey: ["form-delete-impact", formId, open],
    queryFn: () => fetchImpact({ data: { formId } }),
    enabled: open,
  });

  const hasTies =
    !!impact && ((impact.submissionCount ?? 0) > 0 || impact.hasLinkedChecklistItem);
  const nameMatches = typed.trim() === (impact?.formName ?? formName).trim();
  const canConfirm = !!impact && (!hasTies || nameMatches) && !busy;

  async function confirm() {
    setBusy(true);
    try {
      const res = await doDelete({
        data: { formId, confirmName: hasTies ? typed : undefined },
      });
      const parts: string[] = ["Form deleted"];
      if (res.deleted.submissionCount > 0) parts.push(`${res.deleted.submissionCount} submission${res.deleted.submissionCount === 1 ? "" : "s"} removed`);
      if (res.deleted.removedChecklistItem) parts.push("checklist item removed");
      toast.success(parts.join(" · "));
      onOpenChange(false);
      setTyped("");
      onDeleted?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) setTyped(""); onOpenChange(o); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {hasTies ? <AlertTriangle className="h-5 w-5 text-rose-600" /> : <Trash2 className="h-5 w-5" />}
            {hasTies ? "Permanently delete form and attached records?" : "Delete this form permanently?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {isLoading ? (
                <p>Checking what's attached…</p>
              ) : !impact ? (
                <p>Unable to check ties. Try again.</p>
              ) : !hasTies ? (
                <p>
                  This form has no submissions and no linked checklist item.
                  This action cannot be undone.
                </p>
              ) : (
                <>
                  <p>
                    <strong>"{impact.formName}"</strong> has the following attached records.
                    Permanently deleting it will also delete them. <strong>This cannot be undone.</strong>
                  </p>
                  <ul className="ml-4 list-disc text-sm">
                    {impact.submissionCount > 0 && (
                      <li>
                        {impact.submissionCount} submission{impact.submissionCount === 1 ? "" : "s"}
                        {impact.hasClientSubmissions ? " (some tied to clients)" : ""}
                      </li>
                    )}
                    {impact.hasLinkedChecklistItem && (
                      <li>
                        Linked company-required intake checklist item
                        {impact.linkedChecklistItemTitle ? `: "${impact.linkedChecklistItemTitle}"` : ""}
                        {impact.intakeCompletionCount > 0
                          ? ` (${impact.intakeCompletionCount} client completion record${impact.intakeCompletionCount === 1 ? "" : "s"} cleared)`
                          : ""}
                      </li>
                    )}
                  </ul>
                  <div className="grid gap-1.5 pt-2">
                    <Label className="text-xs">
                      Type the form name to confirm: <span className="font-mono">{impact.formName}</span>
                    </Label>
                    <Input
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder={impact.formName}
                      autoFocus
                    />
                  </div>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={confirm}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {busy ? "Deleting…" : hasTies ? "Permanently delete everything" : "Delete form"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
