import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryForOsmTags,
  classifyPlaceType,
  createOverpassQuery,
  isAreaGeometry,
  normalizeNominatimPlace,
  normalizeOverpassElements,
} from "../lib/geo.ts";

test("Nominatim administrative and neighbourhood levels remain explicit", () => {
  assert.equal(classifyPlaceType({ addresstype: "neighbourhood" }), "Neighbourhood");
  assert.equal(classifyPlaceType({ addresstype: "municipality" }), "City or municipality");
  assert.equal(classifyPlaceType({ category: "boundary", type: "administrative", extratags: { admin_level: "8" } }), "Administrative area · level 8");
});

test("normalizes Nominatim bounds from south,north,west,east into map order", () => {
  const place = normalizeNominatimPlace({
    place_id: 1,
    name: "Tirana",
    display_name: "Tirana, Albania",
    lat: "41.3275",
    lon: "19.8187",
    boundingbox: ["41.2", "41.4", "19.7", "19.9"],
    address: { city: "Tirana", country: "Albania" },
    geojson: { type: "Polygon", coordinates: [] },
  });
  assert.ok(place);
  assert.deepEqual(place.boundingBox, [19.7, 41.2, 19.9, 41.4]);
  assert.equal(place.level, "Place");
  assert.equal(isAreaGeometry(place.geometry), true);
});

test("invalid geocoder results are omitted instead of inventing coordinates", () => {
  assert.equal(normalizeNominatimPlace({ display_name: "Unknown", lat: "", lon: "" }), null);
});

test("maps OSM tags to the supported nearby categories", () => {
  assert.equal(categoryForOsmTags({ amenity: "school" }), "education");
  assert.equal(categoryForOsmTags({ amenity: "pharmacy" }), "health");
  assert.equal(categoryForOsmTags({ leisure: "park" }), "green-space");
  assert.equal(categoryForOsmTags({ railway: "station" }), "transport");
  assert.equal(categoryForOsmTags({ shop: "clothes" }), null);
});

test("converts returned OSM elements to deduplicated GeoJSON with counts", () => {
  const result = normalizeOverpassElements([
    { type: "node", id: 10, lat: 41.3, lon: 19.8, tags: { amenity: "school", name: "School A" } },
    { type: "node", id: 10, lat: 41.3, lon: 19.8, tags: { amenity: "school", name: "School A" } },
    { type: "way", id: 20, center: { lat: 41.31, lon: 19.81 }, tags: { leisure: "park" } },
    { type: "node", id: 30, lat: 41.4, lon: 19.9, tags: { shop: "clothes" } },
  ]);
  assert.equal(result.features.length, 2);
  assert.equal(result.counts.education, 1);
  assert.equal(result.counts["green-space"], 1);
  assert.deepEqual(result.features[0].geometry.coordinates, [19.8, 41.3]);
});

test("limits spatial requests to a small radius inside Albania", () => {
  const query = createOverpassQuery(41.3275, 19.8187);
  assert.match(query, /around:800,41\.32750,19\.81870/);
  assert.throws(() => createOverpassQuery(48, 2), /within Albania/);
  assert.throws(() => createOverpassQuery(41.3, 19.8, 5000), /100–1,000/);
});
