import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, FileText, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  getSowDischargeProcedure,
  recordClientDischarge,
  type SowDischargeProcedure,
} from "@/lib/discharge.functions";

type Props = {
  organizationId: string;
  clientId: string;
  clientName: string;
  trigger?: React.ReactNode;
  onDischarged?: () => void;
};

const SECTION_HEADERS: Array<{
  key: "summary_any" | "residential_additions" | "contractor_initiated" | "person_initiated";
  label: string;
  hint: string;
}> = [
  { key: "summary_any", label: "§1.22(a) — Discharge summary (required for every discharge)", hint: "Confirm the discharge summary you'll submit to the Support Coordinator includes every item the SOW lists below." },
  { key: "residential_additions", label: "§1.22(b) — Additional contents (HHS / RHS / PPS / SLQ only)", hint: "Required when discharging from any residential or Supported Living Quarter-Hour service. Skip the checkbox if it doesn't apply to this client." },
  { key: "contractor_initiated", label: "§1.22(c) — Contractor-initiated discharge timeline", hint: "30-day verbal+written notice to the Person AND Support Coordinator; possible +90 days if DSPD Director directs; discharge summary to SC two weeks prior." },
  { key: "person_initiated", label: "§1.22(d) — Person-initiated discharge", hint: "No prior notification may be required from the Person. Submit the discharge summary to the SC at the time of discharge." },
];

export function ClientDischargeDialog({
  organizationId,
  clientId,
  clientName,
  trigger,
  onDischarged,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const sowFn = useServerFn(getSowDischargeProcedure);
  const recordFn = useServerFn(recordClientDischarge);

  const sow = useQuery<SowDischargeProcedure>({
    queryKey: ["sow-discharge", organizationId],
    queryFn: () => sowFn({ data: { organization_id: organizationId } }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const today = new Date().toISOString().slice(0, 10);
  const [dischargeDate, setDischargeDate] = useState<string>(today);
  const [dischargeReason, setDischargeReason] = useState("");
  const [initiatedBy, setInitiatedBy] = useState<"contractor" | "person">("contractor");
  const [attested, setAttested] = useState<Record<string, boolean>>({});
  const [additionalNotes, setAdditionalNotes] = useState("");

  const reset = () => {
    setDischargeDate(today);
    setDischargeReason("");
    setInitiatedBy("contractor");
    setAttested({});
    setAdditionalNotes("");
  };

  const record = useMutation({
    mutationFn: async () => {
      if (!sow.data || !sow.data.found) throw new Error("SOW discharge section not loaded");
      // Require attestation for (a) always, and (c) when contractor-initiated /
      // (d) when person-initiated. (b) is conditional, provider decides.
      const requiredKeys = ["summary_any", initiatedBy === "contractor" ? "contractor_initiated" : "person_initiated"];
      for (const k of requiredKeys) {
        if (!attested[k]) throw new Error(`Confirm the SOW section you'll follow before saving`);
      }
      return await recordFn({
        data: {
          organization_id: organizationId,
          client_id: clientId,
          discharge_date: dischargeDate,
          discharge_reason: dischargeReason.trim(),
          initiated_by: initiatedBy,
          attested_items: attested,
          source_document_id: sow.data.source_document_id,
          source_citation: sow.data.source_citation,
          source_excerpt: sow.data.full_section_text.slice(0, 20000),
          additional_notes: additionalNotes.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success(`${clientName} discharged. Audit entry recorded.`);
      qc.invalidateQueries({ queryKey: ["clients", organizationId] });
      qc.invalidateQueries({ queryKey: ["whiteboard-clients", organizationId] });
      qc.invalidateQueries({ queryKey: ["whiteboard"] });
      reset();
      setOpen(false);
      onDischarged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-1">
            <ShieldAlert className="h-3.5 w-3.5" /> Discharge…
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Discharge {clientName}</DialogTitle>
        </DialogHeader>

        {sow.isLoading && (
          <p className="py-6 text-sm text-muted-foreground">Loading SOW discharge procedure…</p>
        )}

        {sow.data && !sow.data.found && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>SOW discharge section not found</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{sow.data.reason}</p>
              {sow.data.searched_documents.length > 0 && (
                <div className="text-xs">
                  Searched: {sow.data.searched_documents.map((d) => d.title).join(" · ")}
                </div>
              )}
              <p className="text-xs">
                NECTAR will not generate discharge steps from anything other than your
                authoritative sources. Upload the SOW or provider contract, then come back.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {sow.data && sow.data.found && (
          <>
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertTitle className="flex flex-wrap items-center gap-2">
                Source
                <Badge variant="secondary" className="text-[10px]">
                  {sow.data.source_kind}
                </Badge>
              </AlertTitle>
              <AlertDescription className="text-xs">
                {sow.data.source_citation}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="dc-date">Discharge date <span className="text-destructive">*</span></Label>
                <Input
                  id="dc-date"
                  type="date"
                  value={dischargeDate}
                  onChange={(e) => setDischargeDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label>Who initiated the discharge? <span className="text-destructive">*</span></Label>
                <RadioGroup
                  value={initiatedBy}
                  onValueChange={(v) => setInitiatedBy(v as "contractor" | "person")}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="ib-contractor" value="contractor" />
                    <Label htmlFor="ib-contractor" className="text-xs font-normal">
                      Contractor (§1.22(c))
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="ib-person" value="person" />
                    <Label htmlFor="ib-person" className="text-xs font-normal">
                      Person (§1.22(d))
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="grid gap-1 md:col-span-2">
                <Label htmlFor="dc-reason">Discharge reason <span className="text-destructive">*</span></Label>
                <Textarea
                  id="dc-reason"
                  rows={3}
                  value={dischargeReason}
                  onChange={(e) => setDischargeReason(e.target.value)}
                  placeholder="Required per §1.22(a)(1). State the reason for discharge."
                />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">SOW process — review and attest</h3>
              <p className="text-xs text-muted-foreground">
                The following text is sliced verbatim from your authoritative source.
                NECTAR is presenting the SOW process — you must complete it and confirm.
              </p>

              {SECTION_HEADERS.map(({ key, label, hint }) => {
                const text = sow.data.found ? sow.data.subsections[key] : null;
                if (!text) return null;
                const required =
                  key === "summary_any" ||
                  (key === "contractor_initiated" && initiatedBy === "contractor") ||
                  (key === "person_initiated" && initiatedBy === "person");
                return (
                  <div key={key} className="rounded-md border border-border bg-card p-3">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id={`att-${key}`}
                        checked={!!attested[key]}
                        onCheckedChange={(c) =>
                          setAttested((prev) => ({ ...prev, [key]: c === true }))
                        }
                      />
                      <div className="grid gap-1">
                        <Label htmlFor={`att-${key}`} className="text-xs font-semibold">
                          {label}{" "}
                          {required ? (
                            <span className="text-destructive">*</span>
                          ) : (
                            <span className="text-muted-foreground">(if applicable)</span>
                          )}
                        </Label>
                        <p className="text-[11px] text-muted-foreground">{hint}</p>
                      </div>
                    </div>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px] leading-relaxed text-foreground/90">
                      {text}
                    </pre>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-1">
              <Label htmlFor="dc-notes">Additional notes (optional)</Label>
              <Textarea
                id="dc-notes"
                rows={2}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Anything else the audit log should capture."
              />
            </div>

            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>NECTAR is advisory</AlertTitle>
              <AlertDescription className="text-xs">
                NECTAR presents the SOW process — it does not auto-discharge. On save,
                the client's status flips to <strong>discharged</strong>, the home/team
                placement is cleared, and an immutable record is appended to the
                discharge log with the full SOW excerpt you just saw.
              </AlertDescription>
            </Alert>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={
              !sow.data ||
              !sow.data.found ||
              record.isPending ||
              !dischargeReason.trim() ||
              !dischargeDate
            }
            onClick={() => record.mutate()}
          >
            Record discharge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
