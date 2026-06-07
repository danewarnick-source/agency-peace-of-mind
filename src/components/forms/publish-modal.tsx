import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { nectarDraftNotification, publishForm } from "@/lib/forms.functions";
import { toast } from "sonner";
import type { FormField, Frequency, Schedule } from "@/lib/forms-utils";

export function PublishModal({
  open, onOpenChange, formId, formMeta, onPublished,
}: {
  open: boolean; onOpenChange: (b: boolean) => void;
  formId: string;
  formMeta: { name: string; description?: string; frequency: Frequency; schedule: Schedule; fields: FormField[] };
  onPublished: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const draft = useServerFn(nectarDraftNotification);
  const publish = useServerFn(publishForm);

  useEffect(() => {
    if (!open) return;
    setTitle(""); setBody("");
    (async () => {
      setDrafting(true);
      try {
        const out = await draft({ data: formMeta });
        setTitle(out.draft.title);
        setBody(out.draft.body);
      } catch (e) {
        setTitle(`New form assigned: ${formMeta.name}`);
        setBody(`A new form has been assigned to you. Open Forms in your left nav to complete it. (${(e as Error).message})`);
      } finally {
        setDrafting(false);
      }
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    if (!title.trim() || !body.trim()) return toast.error("Notification needs a title and message.");
    setPublishing(true);
    try {
      const out = await publish({ data: { formId, title: title.trim(), body: body.trim() } });
      toast.success(`Published. Notified ${out.delivered} staff.`);
      onOpenChange(false);
      onPublished();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" /> Publish &amp; notify staff</DialogTitle>
          <DialogDescription>Nectar drafted this from your form. Edit anything, then confirm — every assigned staff member will see it.</DialogDescription>
        </DialogHeader>
        {drafting ? (
          <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Notification title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={4000} />
            </div>
            <p className="text-xs text-muted-foreground">
              Submissions will land in <strong>Records → Forms</strong> and stay reachable under the category you chose.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={go} disabled={publishing || drafting}>{publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Publish &amp; notify</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
