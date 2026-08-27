// Admin Home location on the client profile.
// Punch pad geofence compares live GPS to clients.home_latitude / home_longitude.
// Leaflet JS is loaded after mount so SSR never evaluates `window`.

import { useEffect, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Navigation, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  refreshClientHomePinFromAddress,
  saveClientHomePin,
  saveClientHomePinFromGps,
} from "@/lib/home-pin.functions";
import { waitForHighAccuracyPosition } from "@/lib/gps";
import "leaflet/dist/leaflet.css";

type HomePinMapProps = {
  lat: number | null;
  lng: number | null;
  radiusFeet: number;
  onPick: (lat: number, lng: number) => void;
};

function pinsDiffer(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | null,
): boolean {
  if (!a || !b) return a !== b;
  return Math.abs(a.lat - b.lat) > 1e-6 || Math.abs(a.lng - b.lng) > 1e-6;
}

export function HomePinCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const refreshFn = useServerFn(refreshClientHomePinFromAddress);
  const savePinFn = useServerFn(saveClientHomePin);
  const gpsPinFn = useServerFn(saveClientHomePinFromGps);

  const q = useQuery({
    queryKey: ["client-home-pin", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("physical_address, home_latitude, home_longitude, geofence_radius_feet")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        physical_address: string | null;
        home_latitude: number | null;
        home_longitude: number | null;
        geofence_radius_feet: number | null;
      } | null;
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
  const radius = q.data?.geofence_radius_feet ?? 1000;
  const saved =
    typeof savedLat === "number" && typeof savedLng === "number"
      ? { lat: Number(savedLat), lng: Number(savedLng) }
      : null;
  const pin = draft ?? saved;
  const dirty = pinsDiffer(draft, saved);

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
      refreshFn({
        data: { clientId, address: addr.trim() },
      }),
    onSuccess: (r) => {
      toast.success(
        r.updated
          ? "Address saved. A pin was dropped from that address — move it if this is the wrong house."
          : r.geocoded
            ? "Address saved. Home pin already matches that address — move it if the house is off."
            : "Address saved. Could not guess a street pin — drop one on the map or use current location at the house.",
      );
      setAddress(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reGeocode = useMutation({
    mutationFn: () => refreshFn({ data: { clientId } }),
    onSuccess: (r) => {
      toast.success(
        r.updated
          ? "Pin refreshed from the address. Move it if this is the wrong house."
          : r.geocoded
            ? "Pin already matches the address. Move it if the house is off."
            : "Could not guess a street pin from the address. Drop one on the map.",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDraft = useMutation({
    mutationFn: () => {
      if (!pin) throw new Error("Drop a pin on the house first.");
      return savePinFn({
        data: { clientId, latitude: pin.lat, longitude: pin.lng },
      });
    },
    onSuccess: () => {
      toast.success("Home pin saved. Clock-in will use this house.");
      setDraft(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fromGps = useMutation({
    mutationFn: async () => {
      const fix = await waitForHighAccuracyPosition(20_000);
      return gpsPinFn({
        data: {
          clientId,
          latitude: fix.lat,
          longitude: fix.lng,
          accuracyMeters: fix.acc,
        },
      });
    },
    onSuccess: () => {
      toast.success("Home pin set from your current GPS.");
      setDraft(null);
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
            <p className="mt-1 text-sm font-medium text-foreground">
              Move the pin if this is the wrong house.
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saving the address drops a first-guess pin. Drag the house pin (or tap the map)
              onto the actual house, then save. The green circle is the clock-in zone
              ({radius.toLocaleString()} ft). Staff GPS is checked against this pin — not a live state feed.
            </p>
          </div>
        </div>

        <div className="space-y-3 p-5">
          <div className="space-y-1">
            <Label htmlFor="home-pin-address" className="text-xs">Physical address</Label>
            <Input
              id="home-pin-address"
              value={addr}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, City, ST ZIP"
              disabled={q.isLoading}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveAddr.mutate()}
              disabled={saveAddr.isPending || !addr.trim()}
            >
              {saveAddr.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <MapPin className="mr-1 h-3.5 w-3.5" />}
              Save address &amp; drop pin
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => reGeocode.mutate()}
              disabled={reGeocode.isPending || !addr.trim()}
            >
              {reGeocode.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Guess pin from address
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fromGps.mutate()}
              disabled={fromGps.isPending}
            >
              {fromGps.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Navigation className="mr-1 h-3.5 w-3.5" />}
              Use my current location
            </Button>
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
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
                : "No pin yet — save the address, tap the map, or use current location at the house."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
