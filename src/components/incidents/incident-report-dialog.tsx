import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Skull } from "lucide-react";
import { createIncident } from "@/lib/incidents.functions";
import {
  INCIDENT_CATEGORIES,
  ABUSE_CATEGORY,
  FATALITY_CATEGORY,
  type IncidentCategory,
} from "./incident-categories";
import { useCaseload } from "@/hooks/use-caseload";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill the client — when omitted, the form shows a picker. */
  clientId?: string | null;
  /** Optional name to display when prefilled and the caseload isn't loaded yet. */
  clientName?: string;
  /** Default discovery time (ISO). Defaults to "now". Used by the punch-pad
   * and Nectar-trigger entry points so the §1.27 clock starts at the moment
   * the trigger fired. */
  defaultDiscoveredAt?: string;
  /** Optional link to the originating shift/note for the attestation trail. */
  triggeredByNoteId?: string | null;
  triggeredByNoteType?: string | null;
  onSubmitted?: (incidentId: string) => void;
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function IncidentReportDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  defaultDiscoveredAt,
  triggeredByNoteId,
  triggeredByNoteType,
  onSubmitted,
}: Props) {
  const qc = useQueryClient();
  const { data: caseload = [] } = useCaseload();
  const createFn = useServerFn(createIncident);

  const initialDiscovered = useMemo(
    () => toLocalInput(defaultDiscoveredAt ?? new Date().toISOString()),
    [defaultDiscoveredAt, open],
  );

  const [pickedClientId, setPickedClientId] = useState<string>(clientId ?? "");
  const [occurredAt, setOccurredAt] = useState<string>("");
  const [discoveredAt, setDiscoveredAt] = useState<string>(initialDiscovered);
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<IncidentCategory | "">("");
  const [description, setDescription] = useState("");
  const [peopleInvolved, setPeopleInvolved] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [injuries, setInjuries] = useState("");
  const [medicalAttention, setMedicalAttention] = useState("");
  const [immediateActions, setImmediateActions] = useState("");
  const [preventionStrategies, setPreventionStrategies] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Reset when the dialog opens with new props
  useEffect(() => {
    if (!open) return;
    setPickedClientId(clientId ?? "");
    setOccurredAt("");
    setDiscoveredAt(initialDiscovered);
    setLocation("");
    setCategory("");
    setDescription("");
    setPeopleInvolved("");
    setWitnesses("");
    setInjuries("");
    setMedicalAttention("");
    setImmediateActions("");
    setPreventionStrategies("");
    setSubmitted(false);
  }, [open, clientId, initialDiscovered]);

  const isAbuse = category === ABUSE_CATEGORY;
  const isFatality = category === FATALITY_CATEGORY;
  const resolvedClientName = useMemo(() => {
    if (clientName && pickedClientId === clientId) return clientName;
    const c = caseload.find((x) => x.id === pickedClientId);
    return c ? `${c.first_name} ${c.last_name}`.trim() : "";
  }, [caseload, pickedClientId, clientId, clientName]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!pickedClientId) throw new Error("Pick the individual involved.");
      if (!category) throw new Error("Pick an incident category.");
      if (description.trim().length < 10) throw new Error("Add a short description of what happened.");
      if (isAbuse && preventionStrategies.trim().length < 5) {
        throw new Error("Abuse / neglect / exploitation requires prevention strategies (§1.27(3)).");
      }
      const discoveredIso = new Date(discoveredAt).toISOString();
      const occurredIso = occurredAt ? new Date(occurredAt).toISOString() : null;
      return createFn({
        data: {
          client_id: pickedClientId,
          occurred_at: occurredIso,
          discovered_at: discoveredIso,
          location: location.trim() || null,
          category,
          description: description.trim(),
          people_involved: peopleInvolved.trim() || null,
          witnesses: witnesses.trim() || null,
          injuries: injuries.trim() || null,
          medical_attention: medicalAttention.trim() || null,
          immediate_actions: immediateActions.trim() || null,
          is_abuse_neglect: isAbuse,
          prevention_strategies: isAbuse ? preventionStrategies.trim() : null,
          is_fatality: isFatality,
          triggered_by_note_id: triggeredByNoteId ?? null,
          triggered_by_note_type: triggeredByNoteType ?? null,
        },
      });
    },
    onSuccess: (res) => {
      setSubmitted(true);
      qc.invalidateQueries({ queryKey: ["incidents"] });
      toast.success(`Incident filed (${res?.report_number ?? ""}). Your supervisor has been notified.`);
      onSubmitted?.(res!.id);
    },
    onError: (e) => toast.error((e as Error).message ?? "Could not file incident."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Incident Report
          </DialogTitle>
          <DialogDescription className="text-xs">
            Your supervisor is notified the moment this is submitted. After submit
            it becomes read-only — only an admin/manager edits or closes it.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 py-4 text-sm">
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
              <p className="font-semibold">Incident submitted.</p>
              <p className="mt-1 text-xs">
                Your supervisor has been notified. They will start the UPI entry
                (within 24 hours of discovery), notify the guardian, and complete
                the detailed UPI report within 5 business days.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {!clientId && (
              <div>
                <Label className="text-xs">Individual</Label>
                <Select value={pickedClientId} onValueChange={setPickedClientId}>
                  <SelectTrigger><SelectValue placeholder="Pick the individual…" /></SelectTrigger>
                  <SelectContent>
                    {caseload.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {clientId && resolvedClientName && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                Filing for <strong>{resolvedClientName}</strong>.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Date/time the incident occurred</Label>
                <Input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">Leave blank if unknown.</p>
              </div>
              <div>
                <Label className="text-xs">Date/time DISCOVERED *</Label>
                <Input
                  type="datetime-local"
                  value={discoveredAt}
                  onChange={(e) => setDiscoveredAt(e.target.value)}
                  required
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Drives the 24-hour UPI / guardian and 5-business-day completion clocks.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Location</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Where did it happen?"
                />
              </div>
              <div>
                <Label className="text-xs">Category *</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as IncidentCategory)}>
                  <SelectTrigger><SelectValue placeholder="Pick a category…" /></SelectTrigger>
                  <SelectContent>
                    {INCIDENT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isFatality && (
              <div className="flex items-start gap-2 rounded-md border-2 border-rose-500 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-100">
                <Skull className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Fatality — immediate DHHS / §1.26 notifications are required. After you
                  submit, contact the on-call administrator by phone now.
                </span>
              </div>
            )}

            <div>
              <Label className="text-xs">What happened *</Label>
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the incident in plain language — what led up to it, what happened, and the outcome."
              />
            </div>

            {isAbuse && (
              <div className="rounded-md border-2 border-amber-500 bg-amber-50 p-3 dark:bg-amber-950/40">
                <Label className="text-xs font-semibold text-amber-800 dark:text-amber-100">
                  Prevention strategies developed or planned *
                </Label>
                <p className="text-[10px] text-amber-700 dark:text-amber-200">
                  Required by §1.27(3) for abuse / neglect / exploitation incidents.
                </p>
                <Textarea
                  rows={3}
                  value={preventionStrategies}
                  onChange={(e) => setPreventionStrategies(e.target.value)}
                  className="mt-2"
                />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">People involved</Label>
                <Textarea rows={2} value={peopleInvolved} onChange={(e) => setPeopleInvolved(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Witnesses</Label>
                <Textarea rows={2} value={witnesses} onChange={(e) => setWitnesses(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Injuries</Label>
                <Textarea rows={2} value={injuries} onChange={(e) => setInjuries(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Medical attention received</Label>
                <Textarea rows={2} value={medicalAttention} onChange={(e) => setMedicalAttention(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-xs">Immediate actions taken</Label>
              <Textarea
                rows={3}
                value={immediateActions}
                onChange={(e) => setImmediateActions(e.target.value)}
                placeholder="What did you do in the moment to keep the person safe?"
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
                {submit.isPending ? "Submitting…" : "Submit incident report"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
