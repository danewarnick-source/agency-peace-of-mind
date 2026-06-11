import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { classesForCode, familyForCode, isDailyCode, maxRecommendedHours, minStaffAgeForCode } from "@/lib/scheduling/code-colors";
import { listClientAuthorizedCodes } from "@/lib/scheduling/client-codes.functions";
import { rankStaffForShift } from "@/lib/scheduling/eligibility.functions";
import { createShift } from "@/lib/scheduling/shifts.functions";
import { listLocations } from "@/lib/scheduling/locations.functions";

type Step = "client" | "code" | "time" | "staff";

interface ClientOpt { id: string; name: string }
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  clients: ClientOpt[];
  initialClientId?: string | null;
  initialDay?: Date | null;
  locationId?: string | null;
  onCreated?: () => void;
}

function toLocalIso(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function pickerToIso(picker: string) {
  return new Date(picker).toISOString();
}
function durationHours(startsPicker: string, endsPicker: string) {
  const a = new Date(startsPicker).getTime();
  const b = new Date(endsPicker).getTime();
  return Math.max(0, (b - a) / 3600000);
}

export function ShiftCreateDialog({
  open, onOpenChange, organizationId, clients, initialClientId, initialDay, locationId, onCreated,
}: Props) {
  const [step, setStep] = useState<Step>("client");
  const [clientId, setClientId] = useState<string | null>(initialClientId ?? null);
  const [clientFilter, setClientFilter] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [startPicker, setStartPicker] = useState<string>("");
  const [endPicker, setEndPicker] = useState<string>("");
  const [awake, setAwake] = useState(false);
  const [pickedLocationId, setPickedLocationId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [override, setOverride] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(initialClientId ? "code" : "client");
      setClientId(initialClientId ?? null);
      setCode(null);
      setStaffId(null);
      setOverride("");
      setAwake(false);
      setPickedLocationId(locationId ?? null);
      const base = initialDay ? new Date(initialDay) : new Date();
      base.setHours(9, 0, 0, 0);
      const end = new Date(base); end.setHours(base.getHours() + 4);
      setStartPicker(toLocalIso(base));
      setEndPicker(toLocalIso(end));
    }
  }, [open, initialClientId, initialDay, locationId]);

  const createCall = useServerFn(createShift);
  const rankCall = useServerFn(rankStaffForShift);
  const listCodesCall = useServerFn(listClientAuthorizedCodes);
  const listLocCall = useServerFn(listLocations);

  const codesQ = useQuery({
    enabled: open && !!clientId,
    queryKey: ["client-auth-codes", organizationId, clientId],
    queryFn: () => listCodesCall({ data: { organizationId, clientId: clientId! } }),
  });

  const locsQ = useQuery({
    enabled: open,
    queryKey: ["locations", organizationId],
    queryFn: () => listLocCall({ data: { organizationId } }),
  });

  const effectiveLocationId = pickedLocationId ?? locationId ?? null;

  const rankQ = useQuery({
    enabled: open && step === "staff" && !!clientId && !!code && !!startPicker && !!endPicker,
    queryKey: ["rank-staff", organizationId, clientId, code, startPicker, endPicker, effectiveLocationId],
    queryFn: () => rankCall({
      data: {
        organizationId,
        clientId: clientId!,
        serviceCode: code!,
        startsAtIso: pickerToIso(startPicker),
        endsAtIso: pickerToIso(endPicker),
        locationId: effectiveLocationId,
      },
    }),
  });

  const filteredClients = useMemo(() => {
    const f = clientFilter.trim().toLowerCase();
    return f ? clients.filter((c) => c.name.toLowerCase().includes(f)) : clients;
  }, [clients, clientFilter]);

  const codeFamily = code ? familyForCode(code) : null;
  const familyClasses = code ? classesForCode(code) : null;
  const hrs = useMemo(() => durationHours(startPicker, endPicker), [startPicker, endPicker]);
  const maxRec = code ? maxRecommendedHours(code) : null;
  const daily = code ? isDailyCode(code) : false;
  const durationWarn = !!maxRec && hrs > maxRec;

  function canNext(): boolean {
    if (step === "client") return !!clientId;
    if (step === "code") return !!code;
    if (step === "time") return hrs > 0;
    return false;
  }

  async function handleCreate() {
    if (!clientId || !code || !staffId) return;
    setSubmitting(true);
    try {
      await createCall({
        data: {
          organizationId,
          clientId,
          serviceCode: code,
          staffId,
          startsAtIso: pickerToIso(startPicker),
          endsAtIso: pickerToIso(endPicker),
          locationId: locationId ?? null,
          isAwakeOvernight: awake,
          status: "draft",
          createdFrom: "manual",
          overrideReason: override.trim() || undefined,
        },
      });
      toast.success("Shift created");
      onCreated?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create shift");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New shift</DialogTitle>
          <DialogDescription>
            Every shift is one client + service code + staff + time window.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {(["client", "code", "time", "staff"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5", step === s ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {i + 1}. {s}
              </span>
              {i < 3 && <span className="text-muted-foreground/40">→</span>}
            </div>
          ))}
        </div>

        {step === "client" && (
          <div className="space-y-2">
            <Label>Client</Label>
            <Input placeholder="Search clients…" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} />
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {filteredClients.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">No clients</div>
              ) : filteredClients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setClientId(c.id)}
                  className={cn(
                    "block w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors",
                    clientId === c.id && "bg-primary/10 font-semibold",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "code" && (
          <div className="space-y-2">
            <Label>Service code</Label>
            {codesQ.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading authorized codes…</div>
            ) : !codesQ.data || codesQ.data.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No active billing authorizations for this client. Add one in Billing first.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {codesQ.data.map((row: { id: string; service_code: string; unit_type: string | null; rate_per_unit: number | null }) => {
                  const c = row.service_code;
                  const fc = classesForCode(c);
                  const on = code === c;
                  return (
                    <button
                      key={row.id}
                      onClick={() => setCode(c)}
                      className={cn(
                        "rounded-md border p-2 text-left text-sm transition-colors",
                        on ? `${fc.border} ${fc.bgSoft} ring-2 ${fc.ring}` : "border-border hover:bg-muted",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{c}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {isDailyCode(c) ? "daily" : "hourly"}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 capitalize">{familyForCode(c).replace("_", " ")}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === "time" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start</Label>
                <Input type="datetime-local" value={startPicker} onChange={(e) => setStartPicker(e.target.value)} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="datetime-local" value={endPicker} onChange={(e) => setEndPicker(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Duration</span>
              <span className={cn("font-semibold tabular-nums", durationWarn && "text-amber-600")}>
                {hrs.toFixed(2)} h {daily ? "(daily unit)" : ""}
              </span>
            </div>
            {durationWarn && (
              <div className="text-xs text-amber-600">
                Unusual duration — recommended max for {code} is {maxRec}h.
              </div>
            )}
            {codeFamily === "residential" && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={awake} onCheckedChange={(v) => setAwake(!!v)} />
                Awake overnight
              </label>
            )}
            {code === "HHS" && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-[12px] text-amber-800">
                HHS requires staff aged ≥{minStaffAgeForCode(code)}. Host home staff are excluded from the picker.
              </div>
            )}
          </div>
        )}

        {step === "staff" && (
          <div className="space-y-2">
            <Label>Eligible staff</Label>
            {rankQ.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Ranking staff…</div>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                {(rankQ.data ?? []).map((r) => (
                  <button
                    key={r.staffId}
                    onClick={() => setStaffId(r.staffId)}
                    disabled={r.blocked}
                    className={cn(
                      "block w-full text-left px-3 py-2 text-sm transition-colors",
                      staffId === r.staffId && "bg-primary/10",
                      r.blocked ? "opacity-50 cursor-not-allowed" : "hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{r.staffName}</span>
                      <div className="flex items-center gap-1">
                        {r.blocked && <Badge variant="destructive" className="text-[10px]">blocked</Badge>}
                        {!r.blocked && r.warnings.length > 0 && <Badge variant="secondary" className="text-[10px]">{r.warnings.length} warn</Badge>}
                        <Badge variant="outline" className="text-[10px] tabular-nums">{Math.round(r.rank * 100)}</Badge>
                      </div>
                    </div>
                    {(r.warnings.length > 0 || r.blockers.length > 0) && (
                      <div className="mt-1 text-[11px] text-muted-foreground space-x-1">
                        {r.warnings.map((w: string, i: number) => (
                          <span key={`w${i}`} className="inline-block">⚠ {w}</span>
                        ))}
                        {r.blockers.slice(0, 1).map((w: string, i: number) => (
                          <span key={`b${i}`} className="inline-block">· {w}</span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {staffId && rankQ.data?.find((r) => r.staffId === staffId)?.warnings.length ? (
              <div>
                <Label className="text-xs">Override reason (optional)</Label>
                <Input value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Why are you overriding warnings?" />
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step !== "client" && (
            <Button
              variant="outline"
              onClick={() =>
                setStep(step === "code" ? "client" : step === "time" ? "code" : "time")
              }
              disabled={submitting}
            >
              Back
            </Button>
          )}
          {step !== "staff" ? (
            <Button
              disabled={!canNext()}
              onClick={() =>
                setStep(step === "client" ? "code" : step === "code" ? "time" : "staff")
              }
            >
              Next
            </Button>
          ) : (
            <Button disabled={!staffId || submitting} onClick={handleCreate}>
              {submitting ? "Creating…" : "Create shift"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
