import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Loader2, Crosshair, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type ApprovedLocation = {
  id: string;
  client_id: string;
  organization_id: string;
  label: string;
  address: string | null;
  latitude: number;
  longitude: number;
  geofence_radius_feet: number;
};

const MAX_LOCATIONS = 5;
const RADIUS_OPTS = [
  { v: 250, l: "250 ft (tight)" },
  { v: 500, l: "500 ft (typical site)" },
  { v: 1000, l: "1,000 ft (campus)" },
  { v: 2000, l: "2,000 ft (large facility)" },
  { v: 5000, l: "5,000 ft (community area)" },
];

type Draft = {
  id?: string;
  label: string;
  address: string;
  latitude: string;
  longitude: string;
  geofence_radius_feet: number;
};

const emptyDraft: Draft = {
  label: "",
  address: "",
  latitude: "",
  longitude: "",
  geofence_radius_feet: 500,
};

interface Props {
  clientId: string;
  organizationId: string;
  canEdit: boolean;
}

export function ApprovedLocationsEditor({ clientId, organizationId, canEdit }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [acquiring, setAcquiring] = useState(false);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["client-approved-locations", clientId],
    queryFn: async (): Promise<ApprovedLocation[]> => {
      const { data, error } = await supabase
        .from("client_approved_locations")
        .select("id, client_id, organization_id, label, address, latitude, longitude, geofence_radius_feet")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
      })) as ApprovedLocation[];
    },
  });

  const upsertMut = useMutation({
    mutationFn: async (d: Draft) => {
      const lat = Number(d.latitude);
      const lng = Number(d.longitude);
      if (!d.label.trim()) throw new Error("Label is required.");
      if (!isFinite(lat) || lat < -90 || lat > 90) throw new Error("Latitude must be between -90 and 90.");
      if (!isFinite(lng) || lng < -180 || lng > 180) throw new Error("Longitude must be between -180 and 180.");
      const payload = {
        organization_id: organizationId,
        client_id: clientId,
        label: d.label.trim(),
        address: d.address.trim() || null,
        latitude: lat,
        longitude: lng,
        geofence_radius_feet: d.geofence_radius_feet,
      };
      if (d.id) {
        const { error } = await supabase
          .from("client_approved_locations")
          .update(payload)
          .eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("client_approved_locations")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Approved location saved");
      qc.invalidateQueries({ queryKey: ["client-approved-locations", clientId] });
      setOpen(false);
      setDraft(emptyDraft);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save location"),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_approved_locations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Approved location removed");
      qc.invalidateQueries({ queryKey: ["client-approved-locations", clientId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove"),
  });

  function startAdd() {
    setDraft(emptyDraft);
    setOpen(true);
  }
  function startEdit(loc: ApprovedLocation) {
    setDraft({
      id: loc.id,
      label: loc.label,
      address: loc.address ?? "",
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      geofence_radius_feet: loc.geofence_radius_feet,
    });
    setOpen(true);
  }

  function useCurrentLocation() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      toast.error("Geolocation is not available on this device.");
      return;
    }
    setAcquiring(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setDraft((d) => ({
          ...d,
          latitude: p.coords.latitude.toFixed(6),
          longitude: p.coords.longitude.toFixed(6),
        }));
        setAcquiring(false);
        toast.success("Pinned current location");
      },
      (err) => {
        setAcquiring(false);
        toast.error(err.message || "Could not read current location");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const atCap = locations.length >= MAX_LOCATIONS;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">Approved Locations</Label>
        <span className="text-[11px] text-muted-foreground">
          {locations.length}/{MAX_LOCATIONS}
        </span>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : locations.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          No approved locations yet. Add legitimate community service sites
          (job, day program, regular community site) so caregivers aren't
          asked for a variance when clocking in there.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {locations.map((loc) => (
            <li
              key={loc.id}
              className="flex items-start justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate text-sm font-semibold">{loc.label}</span>
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-mono">
                    {loc.geofence_radius_feet} ft
                  </span>
                </div>
                {loc.address && (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {loc.address}
                  </p>
                )}
                <p className="font-mono text-[10px] text-muted-foreground">
                  {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => startEdit(loc)}
                    aria-label={`Edit ${loc.label}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Remove "${loc.label}"?`)) removeMut.mutate(loc.id);
                    }}
                    aria-label={`Remove ${loc.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={startAdd}
          disabled={atCap}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {atCap ? "Maximum 5 approved locations" : "Add approved location"}
        </Button>
      )}

      <p className="text-[11px] text-muted-foreground">
        Clock-ins inside an approved location's geofence are treated as valid
        and skip the variance prompt. EVV still records actual GPS for every
        punch — approved locations only change variance flagging, never EVV
        capture.
      </p>

      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); setDraft(emptyDraft); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit approved location" : "Add approved location"}</DialogTitle>
            <DialogDescription>
              Approving a location is logged to the audit trail with your
              user and the time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="loc-label">Label *</Label>
              <Input
                id="loc-label"
                placeholder="Job, Day Program, Grandma's…"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                maxLength={60}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="loc-address">Address (optional)</Label>
              <Input
                id="loc-address"
                placeholder="123 Main St, Salt Lake City"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="loc-lat">Latitude *</Label>
                <Input
                  id="loc-lat"
                  inputMode="decimal"
                  placeholder="40.76078"
                  value={draft.latitude}
                  onChange={(e) => setDraft({ ...draft, latitude: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="loc-lng">Longitude *</Label>
                <Input
                  id="loc-lng"
                  inputMode="decimal"
                  placeholder="-111.89105"
                  value={draft.longitude}
                  onChange={(e) => setDraft({ ...draft, longitude: e.target.value })}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={useCurrentLocation}
              disabled={acquiring}
            >
              {acquiring ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Crosshair className="mr-1 h-3.5 w-3.5" />
              )}
              Use my current location
            </Button>
            <div className="space-y-1">
              <Label>Geofence radius</Label>
              <Select
                value={String(draft.geofence_radius_feet)}
                onValueChange={(v) => setDraft({ ...draft, geofence_radius_feet: Number(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RADIUS_OPTS.map((o) => (
                    <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => upsertMut.mutate(draft)}
              disabled={upsertMut.isPending}
            >
              {upsertMut.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {draft.id ? "Save changes" : "Add location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
