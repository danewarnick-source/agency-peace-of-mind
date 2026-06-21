// "Finish onboarding" wizard. Lists the human-only setup items that
// documents can't supply for a newly-imported client; each save writes to
// the real table and drops off the list. Skipped items enqueue a non-
// blocking notification reminder.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ListChecks, CheckCircle2, ChevronDown, ChevronRight, MapPin,
  DollarSign, Shield, ClipboardList, Users, HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CaseloadEditor } from "@/components/clients/caseload-editor";
import { AddCodesControl } from "@/components/clients/add-codes-control";
import {
  getClientOnboardingState,
  saveOnboardingClientPatch,
  saveOnboardingBillingRate,
  saveOnboardingCustomField,
  skipOnboardingItem,
} from "@/lib/finish-onboarding.functions";
import {
  getClientFieldStates,
  setFieldConfirmation,
} from "@/lib/field-confirmations.functions";
import { TRACKED_FIELDS } from "@/lib/field-confirmations";

type State = Awaited<ReturnType<typeof getClientOnboardingState>>;
type Rate = {
  id: string;
  service_code: string;
  rate_per_unit: number | null;
  annual_unit_authorization: number | null;
  unit_type: string | null;
};

export function FinishOnboardingCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const fetchState = useServerFn(getClientOnboardingState);
  const fetchStates = useServerFn(getClientFieldStates);

  const stateQ = useQuery({
    queryKey: ["finish-onboarding", clientId],
    queryFn: () => fetchState({ data: { clientId } }) as Promise<State>,
  });
  const fieldStatesQ = useQuery({
    queryKey: ["client-field-states", clientId],
    queryFn: () => fetchStates({ data: { clientId } }),
  });

  if (stateQ.isLoading || fieldStatesQ.isLoading) return null;
  if (stateQ.isError || !stateQ.data) return null;
  const s = stateQ.data;

  const items = buildItems(s);
  const open = items.filter((i) => !i.done && !i.skipped);
  const unknowns = fieldStatesQ.data
    ? TRACKED_FIELDS.filter((f) => fieldStatesQ.data!.states[f.key] === "unknown")
    : [];

  if (open.length === 0 && unknowns.length === 0) return null;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["finish-onboarding", clientId] });
    qc.invalidateQueries({ queryKey: ["client-field-states", clientId] });
    qc.invalidateQueries({ queryKey: ["client-readiness", clientId] });
    qc.invalidateQueries({ queryKey: ["client-profile"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
  }

  return (
    <Card className="border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-amber-600" />
          <CardTitle className="text-base">Finish onboarding</CardTitle>
        </div>
        <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
          {items.filter((i) => i.done).length}/{items.length} done · {unknowns.length} to confirm
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Documents can&apos;t supply these. Save each item below — finished
          items drop off the list, skipped items become a reminder.
        </p>

        {items.map((item) => (
          <StepRow
            key={item.key}
            item={item}
            clientId={clientId}
            state={s}
            onChanged={refresh}
          />
        ))}

        {unknowns.length > 0 && (
          <UnknownConfirmations
            clientId={clientId}
            unknowns={unknowns}
            onChanged={refresh}
          />
        )}
      </CardContent>
    </Card>
  );
}

type Item = {
  key: string;
  label: string;
  icon: React.ReactNode;
  done: boolean;
  skipped: boolean;
};

function buildItems(s: State): Item[] {
  const skipSet = new Set(s.skipped);
  return [
    {
      key: "staff",
      label: "Assign staff",
      icon: <Users className="h-4 w-4" />,
      done: s.doneFlags.staff,
      skipped: skipSet.has("staff"),
    },
    {
      key: "home",
      label: "Confirm home location & geofence",
      icon: <MapPin className="h-4 w-4" />,
      done: s.doneFlags.home,
      skipped: skipSet.has("home"),
    },
    {
      key: "rates",
      label: `Billing rates (${s.missingRates.length} missing)`,
      icon: <DollarSign className="h-4 w-4" />,
      done: s.doneFlags.rates,
      skipped: skipSet.has("rates"),
    },
    {
      key: "guardian",
      label: "Guardian",
      icon: <Shield className="h-4 w-4" />,
      done: s.doneFlags.guardian,
      skipped: skipSet.has("guardian"),
    },
    {
      key: "sow",
      label: "Required SOW fields",
      icon: <ClipboardList className="h-4 w-4" />,
      done: false, // each row tracks itself; surfaced when any value is missing
      skipped: skipSet.has("sow"),
    },
  ].filter((it) => {
    if (it.key === "sow") {
      const missing = sowMissing(s);
      return missing.length > 0;
    }
    return true;
  });
}

function sowMissing(s: State) {
  const c = s.client as Record<string, unknown>;
  const missing: Array<{ key: string; label: string }> = [];
  if (!c.emergency_contact_name) missing.push({ key: "emergency_contact_name", label: "Emergency contact name" });
  if (!c.emergency_contact_phone) missing.push({ key: "emergency_contact_phone", label: "Emergency contact phone" });
  if (!Array.isArray(c.allergies) || (c.allergies as unknown[]).length === 0)
    missing.push({ key: "allergies", label: "Allergies / clinical alert" });
  if (!c.special_directions) missing.push({ key: "special_directions", label: "Special directions" });
  for (const f of s.sowCustomFields) {
    const v = f.value;
    const has = f.type === "boolean" ? v?.value_boolean != null : !!v?.value_text?.trim();
    if (!has) missing.push({ key: f.key, label: f.label });
  }
  return missing;
}

function StepRow({
  item, clientId, state, onChanged,
}: { item: Item; clientId: string; state: State; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const skipFn = useServerFn(skipOnboardingItem);
  const skipM = useMutation({
    mutationFn: () => skipFn({ data: { clientId, item: item.key, label: item.label } }),
    onSuccess: () => {
      toast.message("Skipped — reminder queued.");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40 min-h-11"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {item.done ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <span className="inline-block h-4 w-4 rounded-full border-2 border-amber-500" />
          )}
          {item.icon}
          {item.label}
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          {item.key === "staff" && <CaseloadEditor clientId={clientId} />}
          {item.key === "home" && <HomeForm clientId={clientId} state={state} onSaved={onChanged} />}
          {item.key === "rates" && (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  Add more service codes
                </div>
                <AddCodesControl clientId={clientId} onChanged={onChanged} compact />
              </div>
              <RatesForm state={state} onSaved={onChanged} />
            </div>
          )}
          {item.key === "guardian" && <GuardianForm clientId={clientId} state={state} onSaved={onChanged} />}
          {item.key === "sow" && <SowForm clientId={clientId} state={state} onSaved={onChanged} />}
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => skipM.mutate()}
              disabled={skipM.isPending}
            >
              Skip for now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Home location & geofence ───────────────────────────────────────────────
function HomeForm({
  clientId, state, onSaved,
}: { clientId: string; state: State; onSaved: () => void }) {
  const c = state.client as { physical_address?: string | null; home_latitude?: number | null; home_longitude?: number | null; geofence_radius_feet?: number | null };
  const [address, setAddress] = useState(c.physical_address ?? "");
  const [radius, setRadius] = useState<string>(String(c.geofence_radius_feet ?? 300));
  const saveFn = useServerFn(saveOnboardingClientPatch);
  const m = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          clientId,
          patch: {
            physical_address: address.trim(),
            geofence_radius_feet: Number(radius) || 300,
          },
        },
      }),
    onSuccess: (r) => {
      toast.success(r.geocoded ? "Saved — home geocoded." : "Saved.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Current pin:{" "}
        {c.home_latitude != null && c.home_longitude != null
          ? `${c.home_latitude.toFixed(5)}, ${c.home_longitude.toFixed(5)}`
          : "not geocoded yet"}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="addr">Physical address</Label>
          <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="radius">Geofence radius (feet)</Label>
          <Input id="radius" type="number" min={50} value={radius} onChange={(e) => setRadius(e.target.value)} />
        </div>
      </div>
      <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || !address.trim()}>
        {m.isPending ? "Saving…" : "Save home location"}
      </Button>
    </div>
  );
}

// ── Billing rates / units ──────────────────────────────────────────────────
function RatesForm({
  state, onSaved,
}: { state: State; onSaved: () => void }) {
  if (state.missingRates.length === 0) {
    return <div className="text-xs text-muted-foreground">All rates set.</div>;
  }
  return (
    <div className="space-y-3">
      {(state.missingRates as Rate[]).map((row) => (
        <RateRow key={row.id} row={row} onSaved={onSaved} />
      ))}
    </div>
  );
}

function RateRow({
  row, onSaved,
}: { row: Rate; onSaved: () => void }) {
  const [rate, setRate] = useState(String(row.rate_per_unit ?? ""));
  const [units, setUnits] = useState(String(row.annual_unit_authorization ?? ""));
  const saveFn = useServerFn(saveOnboardingBillingRate);
  const m = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          codeId: row.id,
          rate_per_unit: Number(rate) || 0,
          annual_unit_authorization: Math.trunc(Number(units) || 0),
        },
      }),
    onSuccess: () => {
      toast.success(`Saved ${row.service_code} rate.`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded border border-border p-2">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <Badge variant="outline">{row.service_code}</Badge>
        <span className="text-xs text-muted-foreground">
          unit: {row.unit_type ?? "—"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <Label>Rate per unit ($)</Label>
          <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div>
          <Label>Annual unit authorization</Label>
          <Input type="number" min={0} value={units} onChange={(e) => setUnits(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || !rate || !units}>
            {m.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Guardian ───────────────────────────────────────────────────────────────
function GuardianForm({
  clientId, state, onSaved,
}: { clientId: string; state: State; onSaved: () => void }) {
  const c = state.client as { is_own_guardian?: boolean | null; guardian_name?: string | null; guardian_phone?: string | null; guardian_relationship?: string | null; guardian_email?: string | null };
  const [isOwn, setIsOwn] = useState(c.is_own_guardian ?? true);
  const [name, setName] = useState(c.guardian_name ?? "");
  const [phone, setPhone] = useState(c.guardian_phone ?? "");
  const [rel, setRel] = useState(c.guardian_relationship ?? "");
  const [email, setEmail] = useState(c.guardian_email ?? "");
  const saveFn = useServerFn(saveOnboardingClientPatch);
  const m = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          clientId,
          patch: isOwn
            ? {
                is_own_guardian: true,
                guardian_name: null, guardian_phone: null,
                guardian_relationship: null, guardian_email: null,
              }
            : {
                is_own_guardian: false,
                guardian_name: name.trim(),
                guardian_phone: phone.trim(),
                guardian_relationship: rel.trim() || null,
                guardian_email: email.trim() || null,
              },
        },
      }),
    onSuccess: () => { toast.success("Guardian saved."); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = isOwn || (!!name.trim() && !!phone.trim());

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Switch checked={isOwn} onCheckedChange={setIsOwn} id="own" />
        <Label htmlFor="own" className="text-sm">Client is their own guardian</Label>
      </div>
      {!isOwn && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label>Guardian name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Guardian phone *</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>Relationship</Label>
            <Input value={rel} onChange={(e) => setRel(e.target.value)} placeholder="parent, sibling…" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
      )}
      <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || !valid}>
        {m.isPending ? "Saving…" : "Save guardian"}
      </Button>
    </div>
  );
}

// ── Remaining SOW-required fields ──────────────────────────────────────────
function SowForm({
  clientId, state, onSaved,
}: { clientId: string; state: State; onSaved: () => void }) {
  const missing = sowMissing(state);
  if (missing.length === 0) return <div className="text-xs text-muted-foreground">All set.</div>;
  return (
    <div className="space-y-3">
      {missing.map((f) => (
        <SowField key={f.key} clientId={clientId} field={f} state={state} onSaved={onSaved} />
      ))}
    </div>
  );
}

function SowField({
  clientId, field, state, onSaved,
}: {
  clientId: string;
  field: { key: string; label: string };
  state: State;
  onSaved: () => void;
}) {
  const customDef = state.sowCustomFields.find((f) => f.key === field.key);
  const isCustom = !!customDef;
  const isBoolean = customDef?.type === "boolean";

  const c = state.client as Record<string, unknown>;
  const initial = isCustom
    ? (isBoolean
        ? customDef?.value?.value_boolean ?? false
        : customDef?.value?.value_text ?? "")
    : Array.isArray(c[field.key])
      ? ((c[field.key] as string[]) ?? []).join(", ")
      : ((c[field.key] as string | null) ?? "");
  const [val, setVal] = useState<string | boolean>(initial);

  const patchFn = useServerFn(saveOnboardingClientPatch);
  const cfFn = useServerFn(saveOnboardingCustomField);

  const m = useMutation({
    mutationFn: async () => {
      if (isCustom) {
        return cfFn({
          data: {
            clientId,
            field_key: field.key,
            field_label: customDef!.label,
            data_type: isBoolean ? "boolean" : "text",
            value_text: isBoolean ? null : String(val),
            value_boolean: isBoolean ? Boolean(val) : null,
          },
        });
      }
      const text = String(val).trim();
      const patch: Record<string, unknown> =
        field.key === "allergies"
          ? { allergies: text ? text.split(",").map((x) => x.trim()).filter(Boolean) : [] }
          : { [field.key]: text || null };
      return patchFn({ data: { clientId, patch } });
    },
    onSuccess: () => { toast.success(`${field.label} saved.`); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded border border-border p-2">
      <Label className="text-xs">{field.label}</Label>
      <div className="mt-1 flex items-center gap-2">
        {isBoolean ? (
          <Switch checked={Boolean(val)} onCheckedChange={(v) => setVal(v)} />
        ) : field.key === "special_directions" || field.key === "advanced_directives" ? (
          <Textarea value={String(val)} onChange={(e) => setVal(e.target.value)} className="min-h-20" />
        ) : (
          <Input value={String(val)} onChange={(e) => setVal(e.target.value)} />
        )}
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? "…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ── NECTAR confirmation questions (tri-state tracked fields) ───────────────
function UnknownConfirmations({
  clientId, unknowns, onChanged,
}: {
  clientId: string;
  unknowns: typeof TRACKED_FIELDS;
  onChanged: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <HelpCircle className="h-4 w-4 text-amber-600" />
        <div className="text-sm font-semibold">
          NECTAR has {unknowns.length} question{unknowns.length === 1 ? "" : "s"}
        </div>
      </div>
      <div className="divide-y divide-border">
        {unknowns.map((f) => (
          <ConfirmRow key={f.key} clientId={clientId} field={f} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function ConfirmRow({
  clientId, field, onChanged,
}: {
  clientId: string;
  field: (typeof TRACKED_FIELDS)[number];
  onChanged: () => void;
}) {
  const setFn = useServerFn(setFieldConfirmation);
  const m = useMutation({
    mutationFn: (value: "has" | "none") =>
      setFn({ data: { clientId, key: field.key, value } }),
    onSuccess: (_r, value) => {
      if (value === "none") {
        toast.success(`Recorded: ${field.positiveStatement}`);
      } else {
        toast.success(
          field.key === "medications"
            ? "Marked as having medications — add them on the MAR tab."
            : `Marked as having ${field.label.toLowerCase()} — add details on the profile.`,
        );
      }
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Where to send the admin to enter the data after answering Yes.
  const tab = field.key === "medications" ? "plan" : "overview";

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="text-sm">{field.question}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="default"
          disabled={m.isPending}
          onClick={() => m.mutate("has")}
          asChild={false}
        >
          Yes
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={m.isPending}
          onClick={() => m.mutate("none")}
        >
          No, none
        </Button>
        <Link
          to="/dashboard/clients/$clientId"
          params={{ clientId }}
          search={{ tab } as never}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Open profile →
        </Link>
      </div>
    </div>
  );
}
