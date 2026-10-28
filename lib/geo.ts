export type Geometry = {
  type: string;
  coordinates: unknown;
};

export type PlaceResult = {
  id: string;
  name: string;
  displayName: string;
  level: string;
  category: string;
  latitude: number;
  longitude: number;
  boundingBox: [number, number, number, number] | null;
  geometry: Geometry | null;
  address: Record<string, string>;
  osmType: string | null;
  osmId: number | null;
};

export type AmenityCategory =
  | "education"
  | "health"
  | "green-space"
  | "transport"
  | "daily-needs"
  | "shopping"
  | "restaurants"
  | "fitness"
  | "entertainment"
  | "parking"
  | "civic"
  | "tourism"
  | "vehicle"
  | "personal"
  | "finance"
  | "utilities";

export const AMENITY_CATEGORIES: AmenityCategory[] = [
  "education", "health", "green-space", "transport", "daily-needs",
  "shopping", "restaurants", "fitness", "entertainment", "parking",
  "civic", "tourism", "vehicle", "personal", "finance", "utilities",
];

export type AmenityFeature = {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    name: string;
    category: AmenityCategory;
    osmType: string;
    osmId: number;
    tags: Record<string, string>;
    url: string;
  };
};

export type AmenityCollection = {
  type: "FeatureCollection";
  features: AmenityFeature[];
  counts: Record<AmenityCategory, number>;
  radiusMeters?: number;
  datasetUpdatedAt?: string;
  dataSource?: string;
};

export type RoadFeature = {
  type: "Feature";
  id: string;
  bbox: [number, number, number, number];
  geometry:
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "MultiLineString"; coordinates: [number, number][][] };
  properties: {
    name: string;
    roadClass: string;
    trafficBase: number;
    noiseBase: number;
  };
};

export type RoadCollection = {
  type: "FeatureCollection";
  features: RoadFeature[];
  coverageMode: "boundary" | "radius";
  radiusMeters: number | null;
  datasetUpdatedAt: string;
};

type RawPlace = Record<string, unknown>;
type RawElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, unknown>;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function classifyPlaceType(result: RawPlace): string {
  const addressType = text(result.addresstype).toLowerCase();
  const type = text(result.type).toLowerCase();
  const category = text(result.category).toLowerCase();
  const address = (result.address ?? {}) as Record<string, unknown>;

  if (["neighbourhood", "suburb", "quarter", "city_district"].includes(addressType)) {
    return "Neighbourhood";
  }
  if (["municipality", "city", "town", "village", "hamlet"].includes(addressType)) {
    return "City or municipality";
  }
  if (addressType === "county" || addressType === "state") return "County";
  if (category === "boundary" || type === "administrative") {
    const level = text((result.extratags as Record<string, unknown> | undefined)?.admin_level);
    return level ? `Administrative area · level ${level}` : "Administrative area";
  }
  if (text(address.city) || text(address.town) || text(address.village)) return "Place";
  return "Mapped place";
}

export function normalizeNominatimPlace(result: RawPlace): PlaceResult | null {
  const latitude = finiteNumber(result.lat);
  const longitude = finiteNumber(result.lon);
  const displayName = text(result.display_name);
  if (latitude === null || longitude === null || !displayName) return null;

  const rawBounds = result.boundingbox;
  let boundingBox: PlaceResult["boundingBox"] = null;
  if (Array.isArray(rawBounds) && rawBounds.length === 4) {
    const [south, north, west, east] = rawBounds.map(finiteNumber);
    if (south !== null && north !== null && west !== null && east !== null) {
      boundingBox = [west, south, east, north];
    }
  }

  const rawGeometry = result.geojson as Geometry | undefined;
  const geometry = rawGeometry && typeof rawGeometry.type === "string"
    ? rawGeometry
    : null;
  const rawAddress = (result.address ?? {}) as Record<string, unknown>;
  const address = Object.fromEntries(
    Object.entries(rawAddress).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const osmType = text(result.osm_type) || null;
  const osmId = finiteNumber(result.osm_id);

  return {
    id: String(result.place_id ?? `${osmType ?? "place"}-${osmId ?? `${latitude},${longitude}`}`),
    name: text(result.name) || displayName.split(",")[0],
    displayName,
    level: classifyPlaceType(result),
    category: text(result.category) || "place",
    latitude,
    longitude,
    boundingBox,
    geometry,
    address,
    osmType,
    osmId,
  };
}

export function isAreaGeometry(geometry: Geometry | null): boolean {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

export function categoryForOsmTags(tags: Record<string, unknown>): AmenityCategory | null {
  const amenity = text(tags.amenity).toLowerCase();
  const leisure = text(tags.leisure).toLowerCase();
  const publicTransport = text(tags.public_transport).toLowerCase();
  const railway = text(tags.railway).toLowerCase();
  if (["school", "university", "college", "kindergarten"].includes(amenity)) return "education";
  if (["hospital", "clinic", "doctors", "dentist", "pharmacy"].includes(amenity)) return "health";
  if (["park", "garden", "playground", "nature_reserve"].includes(leisure)) return "green-space";
  if (amenity === "bus_station" || ["platform", "station"].includes(publicTransport) || ["station", "halt", "subway_entrance"].includes(railway)) return "transport";
  if (["marketplace", "supermarket", "convenience"].includes(amenity)) return "daily-needs";
  return null;
}

export function createOverpassQuery(latitude: number, longitude: number, radiusMeters = 800): string {
  if (!Number.isFinite(latitude) || latitude < 39 || latitude > 43) throw new Error("Latitude must be within Albania.");
  if (!Number.isFinite(longitude) || longitude < 19 || longitude > 22) throw new Error("Longitude must be within Albania.");
  if (!Number.isInteger(radiusMeters) || radiusMeters < 100 || radiusMeters > 1000) throw new Error("Search radius must be 100–1,000 metres.");

  const lat = latitude.toFixed(5);
  const lon = longitude.toFixed(5);
  const timeoutSeconds = radiusMeters <= 500 ? 12 : 16;
  return `[out:json][timeout:${timeoutSeconds}];\n(\n` +
    `nwr["amenity"~"^(school|university|college|kindergarten|hospital|clinic|doctors|dentist|pharmacy|bus_station|marketplace|supermarket|convenience)$"](around:${radiusMeters},${lat},${lon});\n` +
    `nwr["leisure"~"^(park|garden|playground|nature_reserve)$"](around:${radiusMeters},${lat},${lon});\n` +
    `nwr["public_transport"~"^(platform|station)$"](around:${radiusMeters},${lat},${lon});\n` +
    `nwr["railway"~"^(station|halt|subway_entrance)$"](around:${radiusMeters},${lat},${lon});\n` +
    `);\nout center tags 120;`;
}

export function normalizeOverpassElements(elements: RawElement[]): AmenityCollection {
  const counts: AmenityCollection["counts"] = {
    education: 0,
    health: 0,
    "green-space": 0,
    transport: 0,
    "daily-needs": 0,
    shopping: 0,
    restaurants: 0,
    fitness: 0,
    entertainment: 0,
    parking: 0,
    civic: 0,
    tourism: 0,
    vehicle: 0,
    personal: 0,
    finance: 0,
    utilities: 0,
  };
  const seen = new Set<string>();
  const features: AmenityFeature[] = [];

  for (const element of elements) {
    const type = text(element.type);
    const id = finiteNumber(element.id);
    if (!type || id === null) continue;
    const key = `${type}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const latitude = finiteNumber(element.lat ?? element.center?.lat);
    const longitude = finiteNumber(element.lon ?? element.center?.lon);
    if (latitude === null || longitude === null) continue;

    const tags = Object.fromEntries(
      Object.entries(element.tags ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    const category = categoryForOsmTags(tags);
    if (!category || !AMENITY_CATEGORIES.includes(category)) continue;
    counts[category] += 1;
    features.push({
      type: "Feature",
      id: key,
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties: {
        name: text(tags.name) || text(tags["name:en"]) || "Unnamed mapped place",
        category,
        osmType: type,
        osmId: id,
        tags,
        url: `https://www.openstreetmap.org/${type}/${id}`,
      },
    });
  }

  return { type: "FeatureCollection", features, counts };
}
