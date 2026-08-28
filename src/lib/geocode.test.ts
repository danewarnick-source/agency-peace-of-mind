import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandUsAddressForNominatim,
  pickStreetLevelGeocode,
  type NominatimHit,
} from "./geocode.ts";

describe("expandUsAddressForNominatim", () => {
  it("expands Utah grid compass letters (7675 S 2450 W)", () => {
    assert.equal(
      expandUsAddressForNominatim("7675 S 2450 W WEST JORDAN, UT 84084"),
      "7675 South 2450 West WEST JORDAN, UT 84084",
    );
    assert.equal(
      expandUsAddressForNominatim("7675 S. 2450 W."),
      "7675 South 2450 West",
    );
  });

  it("does not rewrite St. George as Street George", () => {
    assert.equal(
      expandUsAddressForNominatim("1 Main St George, UT"),
      "1 Main St George, UT",
    );
  });
});

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

  it("rejects a road-only hit (Stephen Prince 7675 South ROAD, 0.89 mi west of house)", () => {
    // Live Nominatim ROAD hit for abbreviated "7675 S 2450 W WEST JORDAN, UT 84084".
    // Pin 40.6119006,-111.9697163 is the road, not the house (~40.6119255,-111.9527469).
    const hits: NominatimHit[] = [
      {
        lat: "40.6119006",
        lon: "-111.9697163",
        class: "highway",
        type: "residential",
        addresstype: "road",
        address: { road: "7675 South" },
      },
    ];
    assert.equal(pickStreetLevelGeocode(hits), null);
  });

  it("rejects a road-level hit when no house number is present", () => {
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
    assert.equal(pickStreetLevelGeocode(hits), null);
  });

  it("returns null for empty or null-island results", () => {
    assert.equal(pickStreetLevelGeocode([]), null);
    assert.equal(
      pickStreetLevelGeocode([{ lat: "0", lon: "0", class: "place", type: "house" }]),
      null,
    );
  });
});
