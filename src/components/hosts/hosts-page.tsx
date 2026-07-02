import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Home, Plus, UserCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createHhpCueCard,
  getHhpCueCard,
  HHP_STATUSES,
  HHP_STATUS_LABEL,
  listHhpCueCards,
  updateHhpCueCard,
  type HhpCueCard,
  type HhpStatus,
} from "@/lib/hhp-cue-cards.functions";
import { HostCertificationPanel, HostCertBadge } from "./host-home-certification-dialog";

type StaffOpt = { id: string; name: string };

function useOrgStaffOptions(orgId: string | undefined) {
  return useQuery({
    enabled: !!orgId,
    queryKey: ["hosts-staff-options", orgId],
    queryFn: async (): Promise<StaffOpt[]> => {
      const { data: members, error: mErr } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId!)
        .eq("active", true);
      if (mErr) throw mErr;
      const ids = (members ?? [])
        .map((m) => (m as { user_id: string | null }).user_id)
        .filter((x): x is string => !!x);
      if (ids.length === 0) return [];
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, full_name, is_active")
        .in("id", ids);
      if (pErr) throw pErr;
      return ((profs ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null;
        full_name: string | null; is_active: boolean | null;
      }>)
        .filter((p) => p.is_active !== false)
        .map((p) => ({
          id: p.id,
          name:
            (p.full_name?.trim()) ||
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
            "Staff",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

function splitList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function statusVariant(s: HhpStatus): "secondary" | "default" | "outline" {
  if (s === "ready") return "default";
  if (s === "placed") return "outline";
  return "secondary";
}

export function HostsPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const { can } = usePermissions();
  const canManage = can("manage_referrals");

  const listFn = useServerFn(listHhpCueCards);
  const [detailId, setDetailId] = useState<string | null>(null);

  const cards = useQuery({
    enabled: !!orgId,
    queryKey: ["hhp-cue-cards", orgId],
    queryFn: () => listFn({ data: { organization_id: orgId! } }),
  });

  const grouped = useMemo(() => {
    const out: Record<HhpStatus, HhpCueCard[]> = {
      onboarding: [],
      ready: [],
      placed: [],
    };
    (cards.data ?? []).forEach((c) => out[c.status].push(c));
    return out;
  }, [cards.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Host Home Providers</h2>
          <p className="text-sm text-muted-foreground">
            HHP cue cards — host-side matching input. Hosts are not staff and
            never appear in scheduling or EVV. Submitting a Host Home
            Questionnaire auto-creates a card.
          </p>
        </div>
        {orgId && canManage && <NewHostDialog organizationId={orgId} />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {(HHP_STATUSES as readonly HhpStatus[]).map((s) => {
          const rows = grouped[s];
          return (
            <section
              key={s}
              className="min-w-0 rounded-md border border-border bg-card p-3"
            >
              <header className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{HHP_STATUS_LABEL[s]}</h3>
                <Badge variant="secondary">{rows.length}</Badge>
              </header>
              {cards.isLoading ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No hosts in this state.
                </p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((c) => {
                    const loc = [c.location_city, c.location_county]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setDetailId(c.id)}
                          className="w-full rounded-md border border-border bg-background p-3 text-left text-sm transition-colors hover:border-foreground/30"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="truncate font-medium">{c.name}</span>
                            </div>
                            <Badge variant={statusVariant(c.status)} className="text-[10px]">
                              {HHP_STATUS_LABEL[c.status]}
                            </Badge>
                          </div>
                          {loc && (
                            <div className="mt-1 truncate text-xs text-muted-foreground">{loc}</div>
                          )}
                          {c.independence_levels_accepted?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {c.independence_levels_accepted.slice(0, 6).map((lv) => (
                                <Badge key={lv} variant="secondary" className="text-[10px]">
                                  {lv}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {canManage && orgId && (
                              <HostCertBadge orgId={orgId} hostCardId={c.id} />
                            )}
                            {c.wheelchair_accessible && (
                              <Badge variant="outline" className="text-[10px]">
                                Wheelchair
                              </Badge>
                            )}
                            {c.sign_language && (
                              <Badge variant="outline" className="text-[10px]">
                                Sign language
                              </Badge>
                            )}
                            {c.source === "questionnaire" && (
                              <Badge variant="outline" className="text-[10px]">
                                Questionnaire
                              </Badge>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {orgId && (
        <HostDetailDialog
          organizationId={orgId}
          cardId={detailId}
          open={!!detailId}
          onOpenChange={(o) => !o && setDetailId(null)}
          canManage={canManage}
        />
      )}
    </div>
  );
}

// ─── New host dialog (manual create) ──────────────────────────

function NewHostDialog({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const createFn = useServerFn(createHhpCueCard);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [address, setAddress] = useState("");
  const [pets, setPets] = useState("");
  const [wheelchair, setWheelchair] = useState(false);
  const [sign, setSign] = useState(false);
  const [crim, setCrim] = useState(false);
  const [experience, setExperience] = useState("");
  const [behavior, setBehavior] = useState("");
  const [comm, setComm] = useState("");
  const [medical, setMedical] = useState("");
  const [levels, setLevels] = useState("");
  const [schedule, setSchedule] = useState("");
  const [commit, setCommit] = useState("");

  const reset = () => {
    setName(""); setPhone(""); setEmail(""); setCity(""); setCounty("");
    setAddress(""); setPets(""); setWheelchair(false); setSign(false);
    setCrim(false); setExperience(""); setBehavior(""); setComm("");
    setMedical(""); setLevels(""); setSchedule(""); setCommit("");
  };

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          organization_id: organizationId,
          name: name.trim(),
          phone: phone || null,
          email: email || null,
          address: address || null,
          location_city: city || null,
          location_county: county || null,
          household_members: [],
          pets: pets || null,
          wheelchair_accessible: wheelchair,
          sign_language: sign,
          criminal_history_flag: crim,
          experience_summary: experience || null,
          behavioral_comfort: behavior || null,
          communication_abilities: comm || null,
          medical_comfort: splitList(medical),
          independence_levels_accepted: splitList(levels).map((s) => s.toUpperCase()),
          schedule_availability: schedule || null,
          commitment_length: commit || null,
        },
      }),
    onSuccess: () => {
      toast.success("Host cue card created");
      qc.invalidateQueries({ queryKey: ["hhp-cue-cards", organizationId] });
      reset();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> New host
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New host cue card</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="h-name">Name *</Label>
            <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div><Label htmlFor="h-phone">Phone</Label><Input id="h-phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label htmlFor="h-email">Email</Label><Input id="h-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="md:col-span-2"><Label htmlFor="h-addr">Address</Label><Input id="h-addr" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div><Label htmlFor="h-city">City</Label><Input id="h-city" value={city} onChange={(e) => setCity(e.target.value)} /></div>
          <div><Label htmlFor="h-county">County</Label><Input id="h-county" value={county} onChange={(e) => setCounty(e.target.value)} /></div>
          <div className="md:col-span-2"><Label htmlFor="h-pets">Pets</Label><Input id="h-pets" value={pets} onChange={(e) => setPets(e.target.value)} placeholder="2 dogs, 1 cat" /></div>
          <div className="flex items-center gap-2"><Checkbox id="h-wheel" checked={wheelchair} onCheckedChange={(v) => setWheelchair(!!v)} /><Label htmlFor="h-wheel" className="cursor-pointer">Wheelchair accessible</Label></div>
          <div className="flex items-center gap-2"><Checkbox id="h-sign" checked={sign} onCheckedChange={(v) => setSign(!!v)} /><Label htmlFor="h-sign" className="cursor-pointer">Sign language</Label></div>
          <div className="flex items-center gap-2 md:col-span-2"><Checkbox id="h-crim" checked={crim} onCheckedChange={(v) => setCrim(!!v)} /><Label htmlFor="h-crim" className="cursor-pointer">Criminal history flag</Label></div>
          <div className="md:col-span-2"><Label htmlFor="h-exp">Experience summary</Label><Textarea id="h-exp" rows={2} value={experience} onChange={(e) => setExperience(e.target.value)} /></div>
          <div className="md:col-span-2"><Label htmlFor="h-beh">Behavioral comfort</Label><Textarea id="h-beh" rows={2} value={behavior} onChange={(e) => setBehavior(e.target.value)} placeholder="e.g. behaviors ok but not high aggression" /></div>
          <div className="md:col-span-2"><Label htmlFor="h-comm">Communication abilities</Label><Textarea id="h-comm" rows={2} value={comm} onChange={(e) => setComm(e.target.value)} /></div>
          <div><Label htmlFor="h-med">Medical comfort (comma)</Label><Input id="h-med" value={medical} onChange={(e) => setMedical(e.target.value)} placeholder="meds, seizures, aging" /></div>
          <div><Label htmlFor="h-lv">Independence levels (comma)</Label><Input id="h-lv" value={levels} onChange={(e) => setLevels(e.target.value)} placeholder="T1, T2, T3" /></div>
          <div className="md:col-span-2"><Label htmlFor="h-sched">Schedule availability</Label><Textarea id="h-sched" rows={2} value={schedule} onChange={(e) => setSchedule(e.target.value)} /></div>
          <div className="md:col-span-2"><Label htmlFor="h-cmt">Commitment length</Label><Input id="h-cmt" value={commit} onChange={(e) => setCommit(e.target.value)} placeholder="e.g. 12 months" /></div>
        </div>
        <DialogFooter>
          <Button size="sm" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create host"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail / edit dialog ─────────────────────────────────────

function HostDetailDialog({
  organizationId,
  cardId,
  open,
  onOpenChange,
  canManage,
}: {
  organizationId: string;
  cardId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getHhpCueCard);
  const updateFn = useServerFn(updateHhpCueCard);

  const q = useQuery({
    enabled: !!cardId && open,
    queryKey: ["hhp-cue-card", cardId],
    queryFn: () =>
      getFn({ data: { organization_id: organizationId, id: cardId! } }),
  });

  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<HhpStatus>("onboarding");

  useEffect(() => {
    if (q.data) {
      setNotes(q.data.provider_notes ?? "");
      setStatus(q.data.status);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          organization_id: organizationId,
          id: cardId!,
          provider_notes: notes,
          status,
        },
      }),
    onSuccess: () => {
      toast.success("Host card updated");
      qc.invalidateQueries({ queryKey: ["hhp-cue-cards", organizationId] });
      qc.invalidateQueries({ queryKey: ["hhp-cue-card", cardId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = q.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{c?.name ?? "Host"}</DialogTitle>
        </DialogHeader>
        {q.isLoading || !c ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <section className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm md:grid-cols-2">
              <KV label="Phone" value={c.phone} />
              <KV label="Email" value={c.email} />
              <KV label="Address" value={c.address} className="md:col-span-2" />
              <KV label="City" value={c.location_city} />
              <KV label="County" value={c.location_county} />
              <KV label="Pets" value={c.pets} />
              <KV label="Commitment" value={c.commitment_length} />
              <KV
                label="Schedule availability"
                value={c.schedule_availability}
                className="md:col-span-2"
              />
              <KV
                label="Experience"
                value={c.experience_summary}
                className="md:col-span-2"
              />
              <KV
                label="Behavioral comfort"
                value={c.behavioral_comfort}
                className="md:col-span-2"
              />
              <KV
                label="Communication"
                value={c.communication_abilities}
                className="md:col-span-2"
              />
              <KV
                label="Medical comfort"
                value={c.medical_comfort?.join(", ") || "—"}
              />
              <KV
                label="Independence levels"
                value={c.independence_levels_accepted?.join(", ") || "—"}
              />
              <div className="md:col-span-2 flex flex-wrap gap-1">
                {c.wheelchair_accessible && <Badge variant="outline">Wheelchair accessible</Badge>}
                {c.sign_language && <Badge variant="outline">Sign language</Badge>}
                {c.criminal_history_flag && (
                  <Badge variant="destructive">Criminal history flag</Badge>
                )}
                <Badge variant="secondary">Source: {c.source}</Badge>
              </div>
            </section>

            <section className="space-y-3 rounded-md border border-border bg-card p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Provider section
              </div>
              <div>
                <Label htmlFor="h-status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as HhpStatus)}
                  disabled={!canManage}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HHP_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {HHP_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="h-notes">Provider notes</Label>
                <Textarea
                  id="h-notes"
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canManage}
                  placeholder="Onboarding notes, training status, observations — fills out as the card solidifies."
                />
              </div>
              {canManage && (
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                    {save.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              )}
              {!canManage && (
                <p className="text-xs text-muted-foreground">
                  Read-only — requires Manage referrals.
                </p>
              )}
            </section>

            {canManage && (
              <HostCertificationPanel
                orgId={organizationId}
                hostCardId={c.id}
                hostName={c.name}
                defaultAddress={c.address ?? ""}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KV({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}
