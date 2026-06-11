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
import { postOpenShift } from "@/lib/scheduling/open-shifts.functions";
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
  // Recurrence: weekday checkboxes (0=Sun..6=Sat) + end-on (inclusive) date.
  const [recurDays, setRecurDays] = useState<Set<number>>(new Set());
  const [recurUntil, setRecurUntil] = useState<string>("");

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
      setRecurDays(new Set());
      setRecurUntil("");
      const base = initialDay ? new Date(initialDay) : new Date();
      base.setHours(9, 0, 0, 0);
      const end = new Date(base); end.setHours(base.getHours() + 4);
      setStartPicker(toLocalIso(base));
      setEndPicker(toLocalIso(end));
    }
  }, [open, initialClientId, initialDay, locationId]);

  const createCall = useServerFn(createShift);
  const postOpenCall = useServerFn(postOpenShift);

  async function handleCreateOpen() {
    if (!clientId || !code) return;
    setSubmitting(true);
    const occurrences = expandOccurrences();
    let created = 0;
    try {
      for (const occ of occurrences) {
        try {
          await postOpenCall({
            data: {
              organizationId,
              clientId,
              serviceCode: code,
              startsAtIso: occ.start.toISOString(),
              endsAtIso: occ.end.toISOString(),
              locationId: effectiveLocationId ?? undefined,
            },
          });
          created++;
        } catch (err) { console.warn(err); }
      }
      if (created > 0) {
        toast.success(`Posted ${created} open shift${created === 1 ? "" : "s"}`);
        onCreated?.();
        onOpenChange(false);
      } else {
        toast.error("Could not post open shift");
      }
    } finally {
      setSubmitting(false);
    }
  }
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

  // Build the list of (start, end) pairs to create. The base pair is the
  // first; if recurrence is set, we add one occurrence per matching weekday
  // up to and including recurUntil. We keep the same wall-clock start/end
  // and just shift the date.
  function expandOccurrences(): Array<{ start: Date; end: Date }> {
    const baseStart = new Date(startPicker);
    const baseEnd = new Date(endPicker);
    const out: Array<{ start: Date; end: Date }> = [{ start: baseStart, end: baseEnd }];
    if (recurDays.size === 0 || !recurUntil) return out;
    const until = new Date(recurUntil); until.setHours(23, 59, 59, 999);
    const seen = new Set<string>([baseStart.toISOString()]);
    const cur = new Date(baseStart); cur.setDate(cur.getDate() + 1);
    const durationMs = baseEnd.getTime() - baseStart.getTime();
    while (cur <= until) {
      if (recurDays.has(cur.getDay())) {
        const s = new Date(cur);
        s.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
        const e = new Date(s.getTime() + durationMs);
        const key = s.toISOString();
        if (!seen.has(key)) { out.push({ start: s, end: e }); seen.add(key); }
      }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  async function handleCreate() {
    if (!clientId || !code || !staffId) return;
    setSubmitting(true);
    const occurrences = expandOccurrences();
    let created = 0;
    let failed = 0;
    try {
      for (const occ of occurrences) {
        try {
          await createCall({
            data: {
              organizationId,
              clientId,
              serviceCode: code,
              staffId,
              startsAtIso: occ.start.toISOString(),
              endsAtIso: occ.end.toISOString(),
              locationId: effectiveLocationId,
              isAwakeOvernight: awake,
              status: "draft",
              createdFrom: "manual",
              overrideReason: override.trim() || undefined,
            },
          });
          created++;
        } catch (err) {
          failed++;
          console.warn("recurrence occurrence failed", err);
        }
      }
      if (created > 0) {
        toast.success(occurrences.length === 1
          ? "Shift created"
          : `Created ${created} of ${occurrences.length} shifts${failed ? ` (${failed} skipped)` : ""}`);
        onCreated?.();
        onOpenChange(false);
      } else {
        toast.error("Could not create any shifts");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-md:h-dvh max-md:max-h-dvh max-md:rounded-none max-md:content-start">
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
                    "block w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors max-md:flex max-md:min-h-11 max-md:items-center",
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
                        "rounded-md border p-2 text-left text-sm transition-colors max-md:min-h-14",
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
            <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
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
            <div>
              <Label className="text-xs">Location</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => setPickedLocationId(null)}
                  className={cn(
                    "min-h-[36px] rounded-md border px-2 text-xs font-semibold",
                    effectiveLocationId === null ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                  )}
                >
                  None
                </button>
                {(locsQ.data ?? []).filter((l) => l.active !== false).map((l) => {
                  const on = effectiveLocationId === l.id;
                  return (
                    <button
                      type="button"
                      key={l.id}
                      onClick={() => setPickedLocationId(l.id)}
                      className={cn(
                        "min-h-[36px] rounded-md border px-2 text-xs font-semibold",
                        on ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                      )}
                    >
                      {l.name}
                      {l.type === "host_home" && <span className="ml-1 opacity-60">(host)</span>}
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Picking a host home location excludes its host staff from the picker.
              </div>
            </div>

            <div className="rounded-md border p-2 space-y-2">
              <Label className="text-xs">Repeat weekly (optional)</Label>
              <div className="flex flex-wrap gap-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, idx) => {
                  const on = recurDays.has(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const next = new Set(recurDays);
                        if (on) next.delete(idx); else next.add(idx);
                        setRecurDays(next);
                      }}
                      className={cn(
                        "min-w-[44px] min-h-[36px] rounded-md border px-2 text-xs font-semibold",
                        on ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <Label className="text-[11px]">Until (inclusive)</Label>
                  <Input
                    type="date"
                    value={recurUntil}
                    onChange={(e) => setRecurUntil(e.target.value)}
                    min={startPicker.slice(0, 10)}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {recurDays.size === 0 || !recurUntil
                    ? "One-off — pick weekdays + an end date to repeat."
                    : (() => {
                      const n = expandOccurrences().length;
                      return `${n} shift${n === 1 ? "" : "s"} will be created.`;
                    })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "staff" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Eligible staff</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateOpen}
                disabled={submitting || !clientId || !code}
                title="Post this as an open shift — staff can claim it"
              >
                Post as open shift
              </Button>
            </div>
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
                      "block w-full text-left px-3 py-2 text-sm transition-colors max-md:min-h-12",
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

        <DialogFooter className="gap-2 max-md:sticky max-md:bottom-0 max-md:-mx-6 max-md:mt-auto max-md:border-t max-md:bg-background max-md:px-6 max-md:py-3 max-md:[&_button]:min-h-12 max-md:[&_button]:flex-1">
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
