import { NextRequest, NextResponse } from "next/server";
import { AMENITY_CATEGORIES } from "@/lib/geo";
import type { AmenityCollection } from "@/lib/geo";
import { getLocalOsmIndex } from "@/lib/local-osm-index";

export const runtime = "nodejs";

const resultCache = new Map<string, { at: number; value: AmenityCollection }>();
const radiusMeters = 800;
const earthRadiusMeters = 6_371_008.8;

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 39.5 || lat > 42.8 || lon < 19.0 || lon > 21.2) {
    return NextResponse.json({ error: "Choose a location in Albania first." }, { status: 400 });
  }

  const key = `${lat.toFixed(5)},${lon.toFixed(5)},${radiusMeters}`;
  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return NextResponse.json(cached.value);

  try {
    const index = getLocalOsmIndex();
    const latitudeMargin = radiusMeters / 110_574;
    const longitudeMargin = radiusMeters / (111_320 * Math.max(0.1, Math.cos(lat * Math.PI / 180)));
    const features = index.features.filter((feature) => {
      const [featureLon, featureLat] = feature.geometry.coordinates;
      if (Math.abs(featureLat - lat) > latitudeMargin || Math.abs(featureLon - lon) > longitudeMargin) return false;
      return distanceMeters(lat, lon, featureLat, featureLon) <= radiusMeters;
    });
    const counts = Object.fromEntries(AMENITY_CATEGORIES.map((category) => [category, 0])) as AmenityCollection["counts"];
    for (const feature of features) counts[feature.properties.category] += 1;
    const result: AmenityCollection = {
      type: "FeatureCollection",
      features,
      counts,
      radiusMeters,
      datasetUpdatedAt: index.updatedAt,
      dataSource: index.source,
    };
    resultCache.set(key, { at: Date.now(), value: result });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=1800" } });
  } catch (error) {
    console.error("Local OpenStreetMap nearby index could not be read.", error);
    return NextResponse.json({ error: "PronaX's local OpenStreetMap data could not be loaded. Reinstall the app or contact support." }, { status: 500 });
  }
}
