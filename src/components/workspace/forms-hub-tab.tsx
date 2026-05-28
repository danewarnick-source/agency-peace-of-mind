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
import {
  Activity,
  AlertOctagon,
  Loader2,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";

type FormType = "incident" | "medical" | "behavior" | "summary" | "inventory" | "drill" | "transfer";

const CARDS: {
  type: FormType;
  title: string;
  desc: string;
  accent: string;
}[] = [
  {
    type: "incident",
    title: "🚨 Critical Incident Report",
    desc: "INTERNAL intake for admin review — injury, behavior crisis, medication error, abuse, neglect.",
    accent: "border-rose-200 hover:border-rose-400 bg-rose-50/40 dark:bg-rose-950/10",
  },
  {
    type: "medical",
    title: "🩺 Medical & Specialist Appointment Log",
    desc: "Record an appointment visit, physician orders, and follow-up.",
    accent: "border-blue-200 hover:border-blue-400 bg-blue-50/40 dark:bg-blue-950/10",
  },
  {
    type: "behavior",
    title: "🧠 Behavior / Seizure Data Sheet",
    desc: "Antecedent, behavior, consequence + seizure type, duration, and recovery.",
    accent: "border-violet-200 hover:border-violet-400 bg-violet-50/40 dark:bg-violet-950/10",
  },
  {
    type: "summary",
    title: "📈 Comprehensive Monthly Review Summary",
    desc: "Monthly PCSP narrative and community outings.",
    accent: "border-teal-200 hover:border-teal-400 bg-teal-50/40 dark:bg-teal-950/10",
  },
  {
    type: "inventory",
    title: "💎 $50+ Valuables Inventory",
    desc: "Register or remove client high-value belongings.",
    accent: "border-amber-200 hover:border-amber-400 bg-amber-50/40 dark:bg-amber-950/10",
  },
  {
    type: "drill",
    title: "🔥 Quarterly Evacuation Drill Record",
    desc: "Log fire, earthquake, or severe weather drills.",
    accent: "border-orange-200 hover:border-orange-400 bg-orange-50/40 dark:bg-orange-950/10",
  },
  {
    type: "transfer",
    title: "🔄 Cross-Agency Transfer Log",
    desc: "Communication log to school, day program, or respite.",
    accent: "border-slate-200 hover:border-slate-400 bg-slate-50/40 dark:bg-slate-950/10",
  },
];

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
                <Label htmlFor="prov">Provider / clinic</Label>
                <Input
                  id="prov"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="bp">Blood pressure</Label>
                  <Input
                    id="bp"
                    value={bp}
                    onChange={(e) => setBp(e.target.value)}
                    placeholder="120/80"
                    maxLength={20}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pulse">Pulse (bpm)</Label>
                  <Input
                    id="pulse"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    inputMode="numeric"
                    maxLength={5}
                  />
                </div>
              </div>
            </>
          )}

          {type === "behavior" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="kind">Kind</Label>
                <select
                  id="kind"
                  value={behaviorKind}
                  onChange={(e) => setBehaviorKind(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="behavior">Behavior</option>
                  <option value="seizure">Seizure</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dur">Duration (min)</Label>
                <Input
                  id="dur"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  inputMode="decimal"
                  maxLength={6}
                />
              </div>
            </div>
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
