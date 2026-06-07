import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { nectarDraftForm } from "@/lib/forms.functions";
import { toast } from "sonner";
import { defaultFieldFor, type FormField } from "@/lib/forms-utils";

export function NectarDraftModal({
  open, onOpenChange, onApply,
}: {
  open: boolean; onOpenChange: (b: boolean) => void;
  onApply: (draft: { name: string; description: string; category: string; frequency: string; fields: FormField[] }) => void;
}) {
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = useServerFn(nectarDraftForm);

  async function run() {
    if (description.trim().length < 5) return toast.error("Tell Nectar what to build.");
    setBusy(true);
    try {
      const out = await draft({ data: { description: description.trim() } });
      // Fill in IDs and ensure each field has the right defaults
      const fields = out.draft.fields.map((f) => ({ ...defaultFieldFor(f.type), ...f }));
      onApply({ ...out.draft, fields });
      onOpenChange(false);
      toast.success("Draft loaded — review and edit before publishing.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" /> Build with Nectar</DialogTitle>
          <DialogDescription>
            Describe the form in plain language, or paste an example. Nectar generates a draft you can review and edit before publishing — it is never auto-published.
          </DialogDescription>
        </DialogHeader>
        <Textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={`E.g. "Weekly van inspection: check tire pressure, mileage, interior cleanliness, any damage, and require a tech signature."`}
          maxLength={8000} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={run} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Generate draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
