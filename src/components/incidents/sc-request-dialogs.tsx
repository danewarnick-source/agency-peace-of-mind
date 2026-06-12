import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { logScRequest, respondScRequest } from "@/lib/incidents.functions";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LogScRequestDialog({
  incidentId,
  onClose,
}: {
  incidentId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(logScRequest);
  const [requestedAt, setRequestedAt] = useState(() => toLocalInput(new Date().toISOString()));
  const [summary, setSummary] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      if (!incidentId) return;
      return fn({
        data: {
          incident_id: incidentId,
          request_summary: summary.trim(),
          requested_at: new Date(requestedAt).toISOString(),
        },
      });
    },
    onSuccess: () => {
      toast.success("SC information request logged. 5-business-day response clock started.");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      setSummary("");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={!!incidentId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Log SC information request (§1.27(5))</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            The Support Coordinator has 5 business days to respond. The incident
            re-surfaces in the open queue — even if closed — until you log the response.
          </p>
          <div>
            <Label className="text-xs">Requested at</Label>
            <Input type="datetime-local" value={requestedAt} onChange={(e) => setRequestedAt(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">What did you ask the SC for? *</Label>
            <Textarea
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. updated PCSP behavior strategy; clarification on guardian contact preferences…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || summary.trim().length < 3}
          >
            {m.isPending ? "Logging…" : "Log request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RespondScRequestDialog({
  scRequestId,
  onClose,
}: {
  scRequestId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(respondScRequest);
  const [response, setResponse] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      if (!scRequestId) return;
      return fn({ data: { id: scRequestId, response_summary: response.trim() } });
    },
    onSuccess: () => {
      toast.success("SC response recorded — request closed.");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      setResponse("");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={!!scRequestId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Mark SC response received</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label className="text-xs">What did the SC say? *</Label>
            <Textarea
              rows={4}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Summarize the response, decisions made, or next steps."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || response.trim().length < 3}
          >
            {m.isPending ? "Saving…" : "Save & close request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
