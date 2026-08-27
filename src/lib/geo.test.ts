import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateGeofence,
  haversineFeet,
  homePinMismatchesGeocode,
  isGpsFixConfident,
  pickBetterGpsFix,
  HOME_PIN_MISMATCH_FEET,
  MAX_GPS_ACCURACY_METERS,
} from "./geo.ts";

// Salt Lake City downtown-ish, used as a stand-in home pin.
const HOME = { lat: 40.7608, lng: -111.891 };

function offsetWestFeet(from: { lat: number; lng: number }, feet: number) {
  // 1 deg longitude ≈ 272_200 ft at this latitude (cos(40.76°) * 364_000).
  const feetPerDegLng = 364_000 * Math.cos((from.lat * Math.PI) / 180);
  return { lat: from.lat, lng: from.lng - feet / feetPerDegLng };
}

describe("haversineFeet", () => {
  it("returns ~0 for the same point", () => {
    const d = haversineFeet(HOME, HOME);
    assert.ok(d < 1);
  });

  it("measures a ~500 ft offset", () => {
    const away = offsetWestFeet(HOME, 500);
    const d = haversineFeet(HOME, away);
    assert.ok(d > 480 && d < 520, `got ${d}`);
  });

  it("measures a ~4698 ft (~0.9 mi) offset like the production false-out", () => {
    const away = offsetWestFeet(HOME, 4698);
    const d = haversineFeet(HOME, away);
    assert.ok(d > 4500 && d < 4900, `got ${d}`);
    assert.ok(d > 1000);
  });
});

describe("isGpsFixConfident", () => {
  it("rejects missing, zero, and coarse (hundreds of meters) fixes", () => {
    assert.equal(isGpsFixConfident(null), false);
    assert.equal(isGpsFixConfident({ acc: 0 }), false);
    assert.equal(isGpsFixConfident({ acc: 250 }), false);
    assert.equal(isGpsFixConfident({ acc: 500 }), false);
  });

  it("accepts a typical phone GPS reading", () => {
    assert.equal(isGpsFixConfident({ acc: 12 }), true);
    assert.equal(isGpsFixConfident({ acc: MAX_GPS_ACCURACY_METERS }), true);
  });
});

describe("pickBetterGpsFix", () => {
  it("keeps the more accurate reading", () => {
    const coarse = { lat: 40.76, lng: -111.89, acc: 800 };
    const fine = { lat: 40.7608, lng: -111.891, acc: 12 };
    assert.deepEqual(pickBetterGpsFix(coarse, fine), fine);
    assert.deepEqual(pickBetterGpsFix(fine, coarse), fine);
    assert.deepEqual(pickBetterGpsFix(null, coarse), coarse);
  });
});

describe("evaluateGeofence", () => {
  const radius = 1000;

  it("fails closed when there is no GPS fix", () => {
    assert.deepEqual(
      evaluateGeofence({ home: HOME, live: null, accuracyMeters: 12, radiusFeet: radius }),
      { kind: "no_gps" },
    );
    assert.equal(
      evaluateGeofence({
        home: HOME,
        live: { lat: 0, lng: 0 },
        accuracyMeters: 12,
        radiusFeet: radius,
      }).kind,
      "no_gps",
    );
  });

  it("does not treat a coarse fix as inside or outside the zone", () => {
    const live = offsetWestFeet(HOME, 50);
    const d = evaluateGeofence({
      home: HOME,
      live,
      accuracyMeters: 450,
      radiusFeet: radius,
    });
    assert.equal(d.kind, "low_accuracy");
    if (d.kind === "low_accuracy") assert.equal(d.accuracyMeters, 450);
  });

  it("passes when high-accuracy GPS is inside the default 1000 ft zone", () => {
    const live = offsetWestFeet(HOME, 200);
    const d = evaluateGeofence({
      home: HOME,
      live,
      accuracyMeters: 12,
      radiusFeet: radius,
    });
    assert.equal(d.kind, "inside");
    if (d.kind === "inside") {
      assert.ok(d.distanceFeet < 1000);
      assert.equal(d.limitFeet, 1000);
    }
  });

  it("flags outside when high-accuracy GPS is past the radius (does not widen 1000 ft)", () => {
    const live = offsetWestFeet(HOME, 4698);
    const d = evaluateGeofence({
      home: HOME,
      live,
      accuracyMeters: 12,
      radiusFeet: radius,
    });
    assert.equal(d.kind, "outside");
    if (d.kind === "outside") {
      assert.ok(d.distanceFeet > 1000);
      assert.equal(d.limitFeet, 1000);
    }
  });

  it("reports no_home_pin without inventing a zone when the pin is missing", () => {
    const d = evaluateGeofence({
      home: null,
      live: HOME,
      accuracyMeters: 12,
      radiusFeet: radius,
    });
    assert.equal(d.kind, "no_home_pin");
  });
});

describe("homePinMismatchesGeocode", () => {
  it("treats a missing pin as a mismatch", () => {
    assert.equal(homePinMismatchesGeocode(null, HOME), true);
  });

  it("treats a city-centroid-sized offset as a mismatch", () => {
    const centroid = offsetWestFeet(HOME, 4698);
    assert.equal(homePinMismatchesGeocode(centroid, HOME), true);
  });

  it("does not flag a pin within the mismatch tolerance", () => {
    const nearby = offsetWestFeet(HOME, HOME_PIN_MISMATCH_FEET / 2);
    assert.equal(homePinMismatchesGeocode(nearby, HOME), false);
  });
});
