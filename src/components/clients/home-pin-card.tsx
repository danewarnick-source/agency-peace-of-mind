// Admin Home location on the client profile.
// Punch pad geofence compares live GPS to clients.home_latitude / home_longitude
// using clients.geofence_radius_feet (default 1000).

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveClientGeofenceRadius,
  saveClientHomePin,
  saveClientPhysicalAddress,
} from "@/lib/home-pin.functions";
import {
  DEFAULT_GEOFENCE_RADIUS_FEET,
  isHomePinDraftDirty,
  resolveGeofenceRadiusFeet,
} from "@/lib/geo";
import "leaflet/dist/leaflet.css";

type HomePinMapProps = {
  lat: number | null;
  lng: number | null;
  radiusFeet: number;
  onPick: (lat: number, lng: number) => void;
};

type HomePinRow = {
  physical_address: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  geofence_radius_feet: number | null;
};

const RADIUS_PRESETS_FT = [100, 300, 1000, 1500] as const;

function radiusLabel(feet: number): string {
  const formatted = feet.toLocaleString();
  if (feet === DEFAULT_GEOFENCE_RADIUS_FEET) {
    return `${formatted} ft (default)`;
  }
  return `${formatted} ft`;
}

export function HomePinCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const savePinFn = useServerFn(saveClientHomePin);
  const saveRadiusFn = useServerFn(saveClientGeofenceRadius);
  const saveAddrFn = useServerFn(saveClientPhysicalAddress);

  const q = useQuery({
    queryKey: ["client-home-pin", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("physical_address, home_latitude, home_longitude, geofence_radius_feet")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as HomePinRow | null;
    },
  });

  const [address, setAddress] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [MapEl, setMapEl] = useState<ComponentType<HomePinMapProps> | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    void import("./home-pin-map")
      .then((m) => {
        if (!cancelled) setMapEl(() => m.default);
      })
      .catch((err: Error) => {
        if (!cancelled) setMapError(err.message || "Map failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addr = address ?? q.data?.physical_address ?? "";
  const savedLat = q.data?.home_latitude;
  const savedLng = q.data?.home_longitude;
  const radius = resolveGeofenceRadiusFeet(q.data?.geofence_radius_feet);
  const saved =
    typeof savedLat === "number" && typeof savedLng === "number"
      ? { lat: Number(savedLat), lng: Number(savedLng) }
      : null;
  const pin = draft ?? saved;
  const dirty = isHomePinDraftDirty(draft, saved);
  const addrDirty = address !== null && address.trim() !== (q.data?.physical_address ?? "").trim();

  const radiusOptions = useMemo(() => {
    const set = new Set<number>(RADIUS_PRESETS_FT);
    set.add(radius);
    return [...set].sort((a, b) => a - b);
  }, [radius]);

  useEffect(() => {
    setDraft(null);
  }, [savedLat, savedLng]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["client-home-pin", clientId] });
    qc.invalidateQueries({ queryKey: ["client-profile"] });
    qc.invalidateQueries({ queryKey: ["client-profile-tab"] });
    qc.invalidateQueries({ queryKey: ["caseload"] });
  };

  const saveAddr = useMutation({
    mutationFn: () =>
      saveAddrFn({
        data: { clientId, address: addr.trim() },
      }),
    onSuccess: (r) => {
      toast.success("Address saved.");
      setAddress(null);
      qc.setQueryData(["client-home-pin", clientId], (old: HomePinRow | null | undefined) =>
        old ? { ...old, physical_address: r.address } : old,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDraft = useMutation({
    mutationFn: () => {
      if (!pin) throw new Error("Drop a pin on the house first.");
      return savePinFn({
        data: {
          clientId,
          latitude: pin.lat,
          longitude: pin.lng,
          geofenceRadiusFeet: radius,
        },
      });
    },
    onSuccess: (r) => {
      toast.success("Home pin saved. Clock-in will use this house.");
      qc.setQueryData(["client-home-pin", clientId], (old: HomePinRow | null | undefined) =>
        old
          ? {
              ...old,
              home_latitude: r.latitude,
              home_longitude: r.longitude,
              geofence_radius_feet: r.geofenceRadiusFeet ?? old.geofence_radius_feet,
            }
          : old,
      );
      setDraft(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRadius = useMutation({
    mutationFn: (feet: number) =>
      saveRadiusFn({
        data: { clientId, geofenceRadiusFeet: feet },
      }),
    onSuccess: (r) => {
      toast.success(`Clock-in radius set to ${r.geofenceRadiusFeet.toLocaleString()} ft.`);
      qc.setQueryData(["client-home-pin", clientId], (old: HomePinRow | null | undefined) =>
        old ? { ...old, geofence_radius_feet: r.geofenceRadiusFeet } : old,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="overflow-hidden" data-testid="home-location-section" id="home-location">
      <CardContent className="p-0">
        <div className="flex items-start gap-2.5 border-b border-border/60 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-tight">Home location</h3>
          </div>
        </div>

        <div className="space-y-3 p-5">
          <div className="space-y-1">
            <Label htmlFor="home-pin-address" className="text-xs">Physical address</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="home-pin-address"
                value={addr}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, City, ST ZIP"
                disabled={q.isLoading}
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => saveAddr.mutate()}
                disabled={saveAddr.isPending || !addrDirty || !addr.trim()}
              >
                {saveAddr.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Save address
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="home-pin-radius" className="text-xs">
              Clock-in geofence radius (feet)
            </Label>
            <Select
              value={String(radius)}
              onValueChange={(v) => {
                const feet = Number(v);
                if (!Number.isFinite(feet) || feet === radius) return;
                saveRadius.mutate(feet);
              }}
              disabled={q.isLoading || saveRadius.isPending}
            >
              <SelectTrigger
                id="home-pin-radius"
                className="max-w-xs"
                data-testid="geofence-radius-feet"
              >
                <SelectValue placeholder={radiusLabel(DEFAULT_GEOFENCE_RADIUS_FEET)} />
              </SelectTrigger>
              <SelectContent>
                {radiusOptions.map((feet) => (
                  <SelectItem key={feet} value={String(feet)}>
                    {radiusLabel(feet)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {saveRadius.isPending ? (
              <p className="text-xs text-muted-foreground">Saving radius…</p>
            ) : null}
          </div>

          {mapError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Map could not load. {mapError}
            </div>
          ) : MapEl ? (
            <MapEl
              lat={pin?.lat ?? null}
              lng={pin?.lng ?? null}
              radiusFeet={radius}
              onPick={(nextLat, nextLng) => setDraft({ lat: nextLat, lng: nextLng })}
            />
          ) : (
            <div className="flex h-[320px] items-center justify-center rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground">
              Loading map…
            </div>
          )}

          {dirty ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 dark:bg-amber-950/30"
              data-testid="home-pin-moved-banner"
            >
              <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                The pin moved. Save it so clock-in uses this house.
              </p>
              <Button
                size="sm"
                onClick={() => saveDraft.mutate()}
                disabled={saveDraft.isPending}
                data-testid="save-home-pin"
              >
                {saveDraft.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Save this pin
              </Button>
            </div>
          ) : (
            <p className="font-mono text-[11px] text-muted-foreground">
              {pin
                ? `Saved pin: ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`
                : "No pin yet — tap the map, then save."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
