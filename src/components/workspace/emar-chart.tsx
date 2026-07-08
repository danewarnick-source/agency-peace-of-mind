import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle, ShieldCheck, Pill, Lock, Info, Pencil, Check, X,
  AlertCircle, Package, Stethoscope,
} from "lucide-react";
import { toast } from "sonner";

/** Permanent legal/scope banner shown at the top of every eMAR surface.
 *  Deep-navy band with amber warning icon — matches the self-administration
 *  disclaimer in the eMAR design spec. */
export function EmarLegalBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="rounded-lg px-4 py-3 text-[12px] leading-relaxed text-primary-foreground"
      style={{ background: "var(--primary)" }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent-2)" }} />
        <p>
          <span className="font-semibold">Self-Directed Administration Support Interface.</span>{" "}
          {!compact && (
            <span className="opacity-90">
              Per Utah DOPL regulations and DHHS Scope of Work (b) &amp; (d), staff are
              limited to mechanical assistance, instruction, and direct observation of the
              Person's independent self-administration — this is not professional nursing
              administration (PM1/PM2).
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

type ClientSafety = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  authorized_dspd_codes: string[] | null;
  allergies: string[];
  dysphagia: boolean;
  swallowing_alerts: string[];
  self_admin_med_support: boolean;
};

/** Fetch the clinical-safety fields we need for the eMAR header & gate. */
export function useClientSafety(clientId: string) {
  const { data: org } = useCurrentOrg();
  return useQuery({
    enabled: !!clientId && !!org,
    queryKey: ["client-safety", clientId],
    queryFn: async (): Promise<ClientSafety> => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, authorized_dspd_codes, allergies, dysphagia, swallowing_alerts, self_admin_med_support")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data as ClientSafety;
    },
  });
}

/** Clinical safety header — name + service chip + DOB on left, allergies pills
 *  on right, then amber alert lines for swallowing/crushed-med policy. */
export function ClinicalSafetyHeader({ client }: { client: ClientSafety }) {
  const services = (client.authorized_dspd_codes ?? []).filter(Boolean);
  const primaryService = services[0];
  const allergies = client.allergies ?? [];
  const alerts = client.swallowing_alerts ?? [];
  const dob = client.date_of_birth
    ? new Date(client.date_of_birth + "T00:00:00").toLocaleDateString(undefined, {
        year: "numeric", month: "2-digit", day: "2-digit",
      })
    : null;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Stethoscope className="h-5 w-5" style={{ color: "var(--accent-2)" }} />
          <h3 className="text-lg font-semibold leading-tight">
            {client.first_name} {client.last_name}
          </h3>
          {primaryService && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {primaryService} active
            </span>
          )}
          {dob && (
            <span className="text-xs text-muted-foreground">DOB {dob}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allergies.length > 0 && (
            <span className="text-xs text-muted-foreground">Allergies:</span>
          )}
          {allergies.length === 0 ? (
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              No known allergies
            </Badge>
          ) : (
            allergies.map((a) => (
              <span
                key={a}
                className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
              >
                {a}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Amber alert lines — one per safety concern */}
      {(client.dysphagia || alerts.length > 0) && (
        <div className="mt-3 space-y-1.5">
          {client.dysphagia && (
            <>
              <p className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  Choking / swallow-reflex risk — confirm upright posture for every oral med
                </span>
              </p>
              <p className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  Crushed-med policy per care plan — verify which meds may be crushed
                </span>
              </p>
            </>
          )}
          {alerts.map((a) => (
            <p key={a} className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>{a}</span>
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Admin-only mini editor for client safety + self-admin flag.
 *  Exported so it can be surfaced BOTH from the eligibility gate (to turn
 *  self-admin ON) and from inside the enabled eMAR (to turn it OFF again). */
export function ClientSafetyEditor({
  client,
  onSaved,
}: {
  client: ClientSafety;
  /** Called after a successful save — used by the header dialog to close itself. */
  onSaved?: (next: { self_admin_med_support: boolean }) => void;
}) {
  const qc = useQueryClient();
  const [allergiesText, setAllergiesText] = useState((client.allergies ?? []).join(", "));
  const [dysphagia, setDysphagia] = useState(client.dysphagia);
  const [alertsText, setAlertsText] = useState((client.swallowing_alerts ?? []).join("\n"));
  const [selfAdmin, setSelfAdmin] = useState(client.self_admin_med_support);
  const [confirmOff, setConfirmOff] = useState(false);

  // Count active meds so we can warn (but never delete) when disabling.
  const { data: activeMedsCount = 0 } = useQuery({
    queryKey: ["client-safety-active-meds-count", client.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("client_medications")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const allergies = allergiesText.split(",").map((s) => s.trim()).filter(Boolean);
      const swallowing_alerts = alertsText.split("\n").map((s) => s.trim()).filter(Boolean);
      const { error } = await (supabase as any).from("clients").update({
        allergies, dysphagia, swallowing_alerts, self_admin_med_support: selfAdmin,
      }).eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Safety profile saved.");
      qc.invalidateQueries({ queryKey: ["client-safety", client.id] });
      setConfirmOff(false);
      onSaved?.({ self_admin_med_support: selfAdmin });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const turningOff = client.self_admin_med_support && !selfAdmin;
  const needsConfirm = turningOff && activeMedsCount > 0;

  function handleSaveClick() {
    if (needsConfirm) {
      setConfirmOff(true);
      return;
    }
    saveMut.mutate();
  }

  return (
    <>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Pencil className="h-3.5 w-3.5" /> Admin — edit clinical safety profile
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Allergies (comma-separated)</Label>
            <Input
              value={allergiesText}
              onChange={(e) => setAllergiesText(e.target.value)}
              placeholder="Penicillin, Sulfa drugs"
            />
          </div>
          <label className="flex cursor-pointer items-center justify-between rounded-md border p-2 text-sm">
            <span>Dysphagia / swallowing risk</span>
            <Switch checked={dysphagia} onCheckedChange={setDysphagia} />
          </label>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-xs">Swallowing alerts (one per line)</Label>
            <Textarea
              rows={2}
              value={alertsText}
              onChange={(e) => setAlertsText(e.target.value)}
              placeholder="Confirm upright posture for every oral med"
            />
          </div>
          <label className="flex cursor-pointer items-center justify-between rounded-md border-2 border-primary/40 bg-primary/5 p-2 text-sm sm:col-span-2">
            <span>
              <span className="font-semibold">Self-directed self-administration support</span>
              <span className="block text-[11px] text-muted-foreground">
                Turn ON only if this client self-administers their own prescription medication with staff observing/assisting.
                Clients requiring a nurse to administer medication should be OFF. Turning OFF returns this client
                to the eligibility gate and hides the eMAR — medication records are kept, not deleted.
              </span>
            </span>
            <Switch checked={selfAdmin} onCheckedChange={setSelfAdmin} />
          </label>
          {turningOff && (
            <div className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              You are about to <span className="font-semibold">disable</span> the eMAR for this client.
              {activeMedsCount > 0 ? (
                <> {activeMedsCount} active medication{activeMedsCount === 1 ? "" : "s"} on file will be
                <span className="font-semibold"> preserved</span> — nothing is deleted — but staff will not
                be able to log passes until self-admin support is turned back on.</>
              ) : (
                <> No active medications are on file. The client will return to the eligibility gate.</>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={handleSaveClick} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : "Save safety profile"}
          </Button>
        </div>
      </Card>

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Disable eMAR for {client.first_name} {client.last_name}?
            </DialogTitle>
            <DialogDescription>
              This client has <span className="font-semibold">{activeMedsCount} active
              medication{activeMedsCount === 1 ? "" : "s"}</span> on file. Turning self-directed
              self-administration support <span className="font-semibold">OFF</span> will hide the
              eMAR and return this client to the eligibility gate. Medication records are
              <span className="font-semibold"> preserved</span> — nothing is deleted — but no new
              passes can be logged until self-admin support is turned back on.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOff(false)} disabled={saveMut.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? "Disabling…" : "Disable eMAR"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


/** Eligibility gate — rendered when the client is NOT flagged for self-admin support. */
export function EmarEligibilityGate({ client }: { client: ClientSafety }) {
  const { role } = usePermissions();
  const isAdmin = role === "admin" || role === "manager" || role === "super_admin";
  return (
    <div className="space-y-4">
      <EmarLegalBanner />
      <Card className="border-2 border-dashed p-6 text-center">
        <Lock className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-semibold">
          eMAR is not enabled for {client.first_name} {client.last_name}
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          This client is not flagged as being on a self-directed self-administration support plan.
          The eMAR is only used when the Person administers their own prescriptions and staff
          observe/assist. Use the nurse-administered medication workflow for clients who require
          a nurse to administer their medication.
        </p>
      </Card>
      {isAdmin && <ClientSafetyEditor client={client} />}
    </div>
  );
}

/** Single medication profile card with completeness flag for missing required fields. */
type ProfileMed = {
  id: string;
  medication_name: string;
  dosage: string | null;
  route: string | null;
  scheduled_times: string[];
  prescriber: string | null;
  pharmacy: string | null;
  rx_number: string | null;
  pill_count_current: number | null;
  is_prn: boolean;
  prn_instructions: string | null;
  is_controlled: boolean;
  purpose: string | null;
  adverse_effects: string | null;
  side_effects: string | null;
  packaging: string | null;
  choking_risk: boolean;
  choking_risk_details: string | null;
  contributes_to_swallowing_difficulty: boolean;
};

function missingFields(m: ProfileMed): string[] {
  const missing: string[] = [];
  if (!m.purpose?.trim()) missing.push("clinical purpose");
  if (!m.route?.trim()) missing.push("route");
  if (!m.dosage?.trim()) missing.push("dosage");
  if (!m.adverse_effects?.trim()) missing.push("adverse-reaction signs");
  if (!m.packaging?.trim()) missing.push("pharmacy packaging");
  if (m.scheduled_times.length === 0 && !m.is_prn) missing.push("schedule");
  return missing;
}

export function MedicationProfileCard({
  med, onEdit,
}: { med: ProfileMed; onEdit?: (id: string) => void }) {
  const missing = missingFields(med);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h4 className="text-base font-semibold leading-tight">{med.medication_name}</h4>
            {med.dosage && <span className="text-sm text-muted-foreground">{med.dosage}</span>}
            {med.is_prn && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">PRN</Badge>
            )}
            {med.is_controlled && (
              <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 text-[10px]">Controlled</Badge>
            )}
          </div>
          {med.purpose ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{med.purpose}</p>
          ) : (
            <p className="mt-0.5 text-xs italic text-amber-700">Clinical purpose missing — admin to complete</p>
          )}
        </div>
        {onEdit && (
          <Button size="sm" variant="outline" onClick={() => onEdit(med.id)}>
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
        )}
      </div>

      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <Field label="Route" value={med.route} />
        <Field
          label="Schedule"
          value={med.scheduled_times.length ? med.scheduled_times.join(" · ") : med.is_prn ? "PRN — as needed" : null}
        />
        <Field label="Prescriber" value={med.prescriber} />
        <Field
          label="Packaging"
          icon={<Package className="h-3 w-3" />}
          value={med.packaging}
        />
        <Field label="Pharmacy" value={[med.pharmacy, med.rx_number && `Rx ${med.rx_number}`].filter(Boolean).join(" · ") || null} />
        <Field label="On hand" value={typeof med.pill_count_current === "number" ? `${med.pill_count_current}` : null} />
      </div>

      {med.is_prn && med.prn_instructions && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="font-semibold">PRN use:</span> {med.prn_instructions}
        </div>
      )}

      <div className="mt-3 grid gap-2 text-xs">
        <Block
          icon={<Stethoscope className="h-3.5 w-3.5" />}
          label="Adverse-reaction signs"
          body={med.adverse_effects}
          missing="No adverse-reaction signs documented — admin to complete"
        />
        {med.side_effects && (
          <Block
            icon={<Info className="h-3.5 w-3.5" />}
            label="Everyday side effects"
            body={med.side_effects}
          />
        )}
        {(med.choking_risk || med.contributes_to_swallowing_difficulty) && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-rose-900 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-100">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" />
              Swallowing / choking risk
            </p>
            {med.choking_risk_details && <p className="mt-0.5">{med.choking_risk_details}</p>}
            <p className="mt-0.5 text-[11px]">
              Confirm upright posture; verify whether this med may be crushed per care plan.
            </p>
          </div>
        )}
      </div>

      {missing.length > 0 && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="h-3 w-3" />
          Incomplete — admin to complete: {missing.join(", ")}
        </div>
      )}
    </Card>
  );
}

function Field({ label, value, icon }: { label: string; value: string | null; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </p>
      {value ? (
        <p className="font-medium">{value}</p>
      ) : (
        <p className="italic text-amber-700">missing</p>
      )}
    </div>
  );
}

function Block({
  icon, label, body, missing,
}: { icon: React.ReactNode; label: string; body: string | null; missing?: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </p>
      {body ? (
        <p className="mt-0.5 whitespace-pre-wrap text-xs">{body}</p>
      ) : (
        missing && <p className="mt-0.5 text-xs italic text-amber-700">{missing}</p>
      )}
    </div>
  );
}

/** Full chart view: per-med profile list. */
export function MedicationChart({
  clientId, onEditMed,
}: { clientId: string; onEditMed?: (id: string) => void }) {
  const { data: org } = useCurrentOrg();
  const { data: meds = [], isLoading } = useQuery({
    enabled: !!clientId && !!org,
    queryKey: ["mar-chart", clientId, org?.organization_id],
    queryFn: async (): Promise<ProfileMed[]> => {
      const { data, error } = await (supabase as any)
        .from("client_medications")
        .select(`id, medication_name, dosage, route, scheduled_times, prescriber,
          pharmacy, rx_number, pill_count_current, is_prn, prn_instructions, is_controlled,
          purpose, adverse_effects, side_effects, packaging,
          choking_risk, choking_risk_details, contributes_to_swallowing_difficulty`)
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("medication_name");
      if (error) throw error;
      return (data ?? []) as ProfileMed[];
    },
  });

  const incompleteCount = useMemo(
    () => meds.filter((m) => missingFields(m).length > 0).length,
    [meds],
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading medication chart…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Medication chart</h3>
          <p className="text-xs text-muted-foreground">
            {meds.length} active medication{meds.length === 1 ? "" : "s"}
            {incompleteCount > 0 && (
              <> · <span className="font-medium text-amber-700">{incompleteCount} incomplete</span></>
            )}
          </p>
        </div>
      </div>
      {meds.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          <Pill className="mx-auto mb-2 h-6 w-6 opacity-30" />
          No active medications on file. Add medications from the chart manager.
        </Card>
      ) : (
        <div className="grid gap-3">
          {meds.map((m) => (
            <MedicationProfileCard key={m.id} med={m} onEdit={onEditMed} />
          ))}
        </div>
      )}
    </div>
  );
}

export type { ClientSafety, ProfileMed };
