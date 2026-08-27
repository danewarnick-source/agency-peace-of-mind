// Admin control to keep the EVV home pin aligned with the house on file.
// Punch pad geofence compares live GPS to clients.home_latitude / home_longitude.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Navigation, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  refreshClientHomePinFromAddress,
  saveClientHomePinFromGps,
} from "@/lib/home-pin.functions";
import { waitForHighAccuracyPosition } from "@/lib/gps";
import { MAX_GPS_ACCURACY_METERS } from "@/lib/geo";

export function HomePinCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const refreshFn = useServerFn(refreshClientHomePinFromAddress);
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
  const addr = address ?? q.data?.physical_address ?? "";
  const lat = q.data?.home_latitude;
  const lng = q.data?.home_longitude;
  const radius = q.data?.geofence_radius_feet ?? 1000;
  const hasPin = typeof lat === "number" && typeof lng === "number";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["client-home-pin", clientId] });
    qc.invalidateQueries({ queryKey: ["client-profile"] });
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
          ? "Address saved and home pin updated from that address."
          : r.geocoded
            ? "Address saved. Home pin already matches that address."
            : "Address saved. Could not resolve a street-level pin — use current GPS while standing at the house.",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reGeocode = useMutation({
    mutationFn: () => refreshFn({ data: { clientId } }),
    onSuccess: (r) => {
      toast.success(
        r.updated
          ? "Home pin refreshed from the address on file."
          : r.geocoded
            ? "Home pin already matches the address on file."
            : "Could not resolve a street-level pin from the address on file. Use current GPS while standing at the house.",
      );
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
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Home pin for clock-in</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Punch pad measures staff GPS against this pin (default {radius.toLocaleString()} ft).
          Saving the physical address updates the pin. Standing at the house, use your current
          location to correct a bad geocode. Accuracy must be within {MAX_GPS_ACCURACY_METERS} m.
        </p>
      </div>

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

      <p className="font-mono text-[11px] text-muted-foreground">
        {hasPin
          ? `Saved pin: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
          : "Saved pin: none — geofence cannot confirm staff are at the house until a pin exists."}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => saveAddr.mutate()}
          disabled={saveAddr.isPending || !addr.trim()}
        >
          {saveAddr.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <MapPin className="mr-1 h-3.5 w-3.5" />}
          Save address &amp; update pin
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fromGps.mutate()}
          disabled={fromGps.isPending}
        >
          {fromGps.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Navigation className="mr-1 h-3.5 w-3.5" />}
          Use my current location as home pin
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => reGeocode.mutate()}
          disabled={reGeocode.isPending || !addr.trim()}
        >
          {reGeocode.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          Re-geocode from address
        </Button>
      </div>
    </div>
  );
}
