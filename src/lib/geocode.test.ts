import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickStreetLevelGeocode, type NominatimHit } from "./geocode.ts";

describe("pickStreetLevelGeocode", () => {
  it("rejects a city centroid so we do not invent a home pin", () => {
    const hits: NominatimHit[] = [
      {
        lat: "40.7608",
        lon: "-111.8910",
        class: "place",
        type: "city",
        addresstype: "city",
        address: { city: "Salt Lake City" },
      },
    ];
    assert.equal(pickStreetLevelGeocode(hits), null);
  });

  it("prefers a house-number street hit over a city result", () => {
    const hits: NominatimHit[] = [
      {
        lat: "40.7608",
        lon: "-111.8910",
        class: "place",
        type: "city",
        addresstype: "city",
        address: { city: "Salt Lake City" },
      },
      {
        lat: "40.7580",
        lon: "-111.8760",
        class: "place",
        type: "house",
        addresstype: "place",
        address: {
          house_number: "123",
          road: "Main Street",
          city: "Salt Lake City",
        },
      },
    ];
    const hit = pickStreetLevelGeocode(hits);
    assert.ok(hit);
    assert.equal(hit?.quality, "street");
    assert.equal(hit?.lat, 40.758);
    assert.equal(hit?.lng, -111.876);
  });

  it("accepts a road-level hit when no house number is present", () => {
    const hits: NominatimHit[] = [
      {
        lat: "40.7000",
        lon: "-111.8000",
        class: "highway",
        type: "residential",
        addresstype: "road",
        address: { road: "Oak Ave" },
      },
    ];
    const hit = pickStreetLevelGeocode(hits);
    assert.ok(hit);
    assert.equal(hit?.quality, "road");
  });

  it("returns null for empty or null-island results", () => {
    assert.equal(pickStreetLevelGeocode([]), null);
    assert.equal(
      pickStreetLevelGeocode([{ lat: "0", lon: "0", class: "place", type: "house" }]),
      null,
    );
  });
});
