import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormCardGrid } from "./FormCardGrid";
import type { FormType } from "./shared-form-cards";

export function FormsHubTab({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [active, setActive] = useState<FormType | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => {
          return (
            <button
              key={c.type}
              type="button"
              onClick={() => setActive(c.type)}
              className={`group flex min-h-[44px] flex-col rounded-2xl border-2 p-5 text-left shadow-sm transition hover:shadow-md ${c.accent}`}
            >
              <p className="font-semibold leading-tight">{c.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
            </button>
          );
        })}
      </div>
      <FormDialog
        type={active}
        clientId={clientId}
        clientName={clientName}
        onClose={() => setActive(null)}
      />
    </>
  );
}

function FormDialog({
  type,
  clientId,
  clientName,
  onClose,
}: {
  type: FormType | null;
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [narrative, setNarrative] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  // type-specific
  const [severity, setSeverity] = useState("low");
  const [provider, setProvider] = useState("");
  const [bp, setBp] = useState("");
  const [pulse, setPulse] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [ordersChanges, setOrdersChanges] = useState("");
  const [behaviorKind, setBehaviorKind] = useState("behavior");
  const [antecedent, setAntecedent] = useState("");
  const [consequence, setConsequence] = useState("");
  const [duration, setDuration] = useState("");
  const [targetMonth, setTargetMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [communityOutings, setCommunityOutings] = useState("");
  const [assetDescription, setAssetDescription] = useState("");
  const [assetValue, setAssetValue] = useState("");
  const [drillType, setDrillType] = useState("Fire");
  const [evacuationDuration, setEvacuationDuration] = useState("");
  const [receivingParty, setReceivingParty] = useState("");
  const [partyType, setPartyType] = useState("School");

  useEffect(() => {
    if (!type) return;
    setTitle("");
    setNarrative("");
    setSeverity("low");
    setProvider(""); setBp(""); setPulse(""); setFollowUpDate(""); setOrdersChanges("");
    setBehaviorKind("behavior"); setAntecedent(""); setConsequence(""); setDuration("");
    setTargetMonth(new Date().toISOString().slice(0, 7));
    setCommunityOutings(""); setAssetDescription(""); setAssetValue("");
    setDrillType("Fire"); setEvacuationDuration("");
    setReceivingParty(""); setPartyType("School");
    setOccurredAt(new Date().toISOString().slice(0, 16));
  }, [type]);

  const headings: Record<FormType, string> = {
    incident: "🚨 Critical Incident Report",
    medical: "🩺 Medical & Specialist Appointment Log",
    behavior: "🧠 Behavior / Seizure Data Sheet",
    summary: "📈 Comprehensive Monthly Review Summary",
    inventory: "💎 $50+ Valuables Inventory",
    drill: "🔥 Quarterly Evacuation Drill Record",
    transfer: "🔄 Cross-Agency Transfer Log",
  };

  async function submit() {
    if (!user || !org || !type) return;
    if (!title.trim() || !narrative.trim()) {
      toast.error("Title and narrative are required.");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      if (type === "incident") payload.severity = severity;
      if (type === "medical") {
        payload.provider = provider;
        payload.bp = bp;
        payload.pulse = pulse;
        payload.follow_up_date = followUpDate || null;
        payload.orders_changes = ordersChanges || null;
      }
      if (type === "behavior") {
        payload.kind = behaviorKind;
        payload.antecedent = antecedent;
        payload.consequence = consequence;
        payload.duration_minutes = parseFloat(duration) || 0;
      }
      if (type === "summary") {
        payload.target_month = targetMonth;
        payload.community_outings = communityOutings
          ? communityOutings.split("\n").filter(Boolean)
          : [];
      }
      if (type === "inventory") {
        payload.asset_description = assetDescription;
        payload.estimated_value = parseFloat(assetValue) || 0;
      }
      if (type === "drill") {
        payload.simulation_type = drillType;
        payload.evacuation_duration_seconds = parseInt(evacuationDuration) || 0;
      }
      if (type === "transfer") {
        payload.receiving_party = receivingParty;
        payload.party_type = partyType;
      }
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("submitted_forms" as any)
        .insert({
          organization_id: org.organization_id,
          user_id: user.id, // active caregiver auto-attached
          client_id: clientId, // active individual auto-attached
          form_type: type,
          title: title.trim(),
          narrative: narrative.trim(),
          payload,
          occurred_at: new Date(occurredAt).toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      if (error) throw error;
      toast.success(`Submitted to ${clientName}'s record`);
      qc.invalidateQueries({ queryKey: ["client-timeline"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{type ? headings[type] : ""}</DialogTitle>
          <DialogDescription>{clientName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="title">Title / summary</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="when">When did this occur?</Label>
            <Input
              id="when"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>

          {type === "incident" && (
            <div className="grid gap-1.5">
              <Label htmlFor="sev">Severity</Label>
              <select
                id="sev"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="low">Non-critical · Low</option>
                <option value="moderate">Non-critical · Moderate</option>
                <option value="high">Critical · High</option>
                <option value="critical">Critical · Reportable</option>
              </select>
            </div>
          )}

          {type === "medical" && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="prov">Provider / Clinic</Label>
                <Input id="prov" value={provider} onChange={(e) => setProvider(e.target.value)} maxLength={120} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="bp">Blood Pressure</Label>
                  <Input id="bp" value={bp} onChange={(e) => setBp(e.target.value)} placeholder="120/80" maxLength={20} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pulse">Pulse (bpm)</Label>
                  <Input id="pulse" value={pulse} onChange={(e) => setPulse(e.target.value)} inputMode="numeric" maxLength={5} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="orders">Physician Orders / Care Plan Changes</Label>
                <Textarea id="orders" rows={3} value={ordersChanges} onChange={(e) => setOrdersChanges(e.target.value)} placeholder="Note any new orders, medication changes, or care plan updates from this visit." />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="followup">Follow-Up Date</Label>
                <Input id="followup" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
              </div>
            </>
          )}

          {type === "behavior" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="kind">Type</Label>
                  <select id="kind" value={behaviorKind} onChange={(e) => setBehaviorKind(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="behavior">Behavioral Episode</option>
                    <option value="seizure">Seizure</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="dur">Duration (minutes)</Label>
                  <Input id="dur" value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="decimal" maxLength={6} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ante">Antecedent — What happened before?</Label>
                <Textarea id="ante" rows={2} value={antecedent} onChange={(e) => setAntecedent(e.target.value)} placeholder="Environment, triggers, preceding activity…" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="consq">Consequence — What happened after / how was it resolved?</Label>
                <Textarea id="consq" rows={2} value={consequence} onChange={(e) => setConsequence(e.target.value)} placeholder="Staff response, de-escalation steps, outcome…" />
              </div>
            </>
          )}

          {type === "summary" && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="month">Target Month</Label>
                <Input id="month" type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="outings">Community Outings (one per line)</Label>
                <Textarea id="outings" rows={3} value={communityOutings} onChange={(e) => setCommunityOutings(e.target.value)} placeholder={"Grocery store visit — May 3\nLibrary outing — May 10\nPark walk — May 15"} />
              </div>
            </>
          )}

          {type === "inventory" && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="asset">Asset Description</Label>
                <Input id="asset" value={assetDescription} onChange={(e) => setAssetDescription(e.target.value)} placeholder="e.g., iPad Pro 12.9-inch, silver case" maxLength={200} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="val">Estimated Value (USD)</Label>
                <Input id="val" type="number" step="0.01" min="50" value={assetValue} onChange={(e) => setAssetValue(e.target.value)} placeholder="0.00" />
              </div>
            </>
          )}

          {type === "drill" && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="drilltype">Drill Type</Label>
                <select id="drilltype" value={drillType} onChange={(e) => setDrillType(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="Fire">Fire</option>
                  <option value="Earthquake">Earthquake</option>
                  <option value="Severe Weather">Severe Weather</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="evactime">Total Evacuation Duration (seconds)</Label>
                <Input id="evactime" type="number" min="0" value={evacuationDuration} onChange={(e) => setEvacuationDuration(e.target.value)} placeholder="e.g., 90" />
              </div>
            </>
          )}

          {type === "transfer" && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="party">Receiving Party Name</Label>
                <Input id="party" value={receivingParty} onChange={(e) => setReceivingParty(e.target.value)} placeholder="e.g., Valley Day Program" maxLength={150} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="partytype">Party Type</Label>
                <select id="partytype" value={partyType} onChange={(e) => setPartyType(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="School">School</option>
                  <option value="Day Program">Day Program</option>
                  <option value="Respite">Respite</option>
                  <option value="Medical Transport">Medical Transport</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="narr">Narrative / details</Label>
            <Textarea
              id="narr"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={5}
              maxLength={5000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
