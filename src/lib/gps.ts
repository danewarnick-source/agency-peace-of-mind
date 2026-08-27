// Browser GPS capture for punch pad + admin home-pin correction.
// High-accuracy only — never fall back to a coarse / IP location.

import {
  isGpsFixConfident,
  pickBetterGpsFix,
  type GpsFix,
} from "@/lib/geo";

export const HIGH_ACCURACY_GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
};

export function gpsFixFromPosition(p: GeolocationPosition): GpsFix {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    acc: p.coords.accuracy,
  };
}

/**
 * Watch high-accuracy GPS until a confident fix arrives or `timeoutMs` elapses.
 * Rejects if geolocation is missing, permission is denied, or the best reading
 * is still too coarse. Does not start a low-accuracy watch.
 */
export function waitForHighAccuracyPosition(
  timeoutMs = 20_000,
): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Geolocation is not available on this device."));
      return;
    }
    let best: GpsFix | null = null;
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      if (best && isGpsFixConfident(best)) resolve(best);
      else reject(err ?? new Error("GPS accuracy is too coarse. Wait a few seconds and retry."));
    };

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        best = pickBetterGpsFix(best, gpsFixFromPosition(p));
        if (best && isGpsFixConfident(best)) finish();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          finish(new Error("Location is blocked. Enable location for this site in device Settings."));
        }
        // TIMEOUT / UNAVAILABLE: keep watching until our own timer.
      },
      HIGH_ACCURACY_GPS_OPTIONS,
    );

    const timer = window.setTimeout(() => {
      finish(new Error("Could not get a high-accuracy GPS fix. Step outside if you can, then retry."));
    }, timeoutMs);
  });
}
