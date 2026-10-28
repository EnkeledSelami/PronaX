import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getLocalOsmIndex } from "@/lib/local-osm-index";
import type { Geometry, RoadFeature } from "@/lib/geo";

export const runtime = "nodejs";
const radiusMeters = 800;
const earthRadiusMeters = 6_371_008.8;
const cache = new Map<string, { at: number; value: unknown }>();
type Point = [number, number];
type Polygon = Point[][];

function parseBoundary(geometry: unknown): Polygon[] | null {
  if (!geometry || typeof geometry !== "object") return null;
  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== "Polygon" && candidate.type !== "MultiPolygon") return null;
  const rawPolygons = candidate.type === "Polygon" ? [candidate.coordinates] : candidate.coordinates;
  if (!Array.isArray(rawPolygons)) return null;
  const polygons: Polygon[] = [];
  let pointCount = 0;
  for (const rawPolygon of rawPolygons) {
    if (!Array.isArray(rawPolygon) || !rawPolygon.length) return null;
    const rings: Polygon = [];
    for (const rawRing of rawPolygon) {
      if (!Array.isArray(rawRing) || rawRing.length < 4) return null;
      const ring: Point[] = [];
      for (const rawPoint of rawRing) {
        if (!Array.isArray(rawPoint) || rawPoint.length < 2) return null;
        const [lon, lat] = rawPoint;
        if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
        if (lon < 19 || lon > 22 || lat < 39 || lat > 43) return null;
        ring.push([lon, lat]);
        pointCount += 1;
        if (pointCount > 100_000) return null;
      }
      rings.push(ring);
    }
    polygons.push(rings);
  }
  return polygons.length ? polygons : null;
}

function pointInRing(point: Point, ring: Point[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideBoundary(point: Point, polygons: Polygon[]): boolean {
  return polygons.some((rings) => pointInRing(point, rings[0]) && !rings.slice(1).some((hole) => pointInRing(point, hole)));
}

function edgeIntersections(a: Point, b: Point, c: Point, d: Point): number | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-14) return null;
  const qx = c[0] - a[0];
  const qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * ry - qy * rx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

function clipLineToBoundary(line: Point[], polygons: Polygon[]): Point[][] {
  const clipped: Point[][] = [];
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1];
    const b = line[i];
    const cuts = [0, 1];
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (let edge = 1; edge < ring.length; edge += 1) {
          const cut = edgeIntersections(a, b, ring[edge - 1], ring[edge]);
          if (cut !== null) cuts.push(cut);
        }
      }
    }
    cuts.sort((left, right) => left - right);
    const uniqueCuts = cuts.filter((value, index) => index === 0 || value - cuts[index - 1] > 1e-10);
    for (let cut = 1; cut < uniqueCuts.length; cut += 1) {
      const start = uniqueCuts[cut - 1];
      const end = uniqueCuts[cut];
      const middle = (start + end) / 2;
      const midpoint: Point = [a[0] + (b[0] - a[0]) * middle, a[1] + (b[1] - a[1]) * middle];
      if (!insideBoundary(midpoint, polygons)) continue;
      const from: Point = [a[0] + (b[0] - a[0]) * start, a[1] + (b[1] - a[1]) * start];
      const to: Point = [a[0] + (b[0] - a[0]) * end, a[1] + (b[1] - a[1]) * end];
      const previous = clipped[clipped.length - 1];
      if (previous && Math.abs(previous[previous.length - 1][0] - from[0]) < 1e-9 && Math.abs(previous[previous.length - 1][1] - from[1]) < 1e-9) previous.push(to);
      else clipped.push([from, to]);
    }
  }
  return clipped;
}

function clipRoad(road: RoadFeature, polygons: Polygon[]): RoadFeature | null {
  const sourceLines = road.geometry.type === "LineString" ? [road.geometry.coordinates] : road.geometry.coordinates;
  const lines = sourceLines.flatMap((line) => clipLineToBoundary(line, polygons));
  if (!lines.length) return null;
  const bbox: RoadFeature["bbox"] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const line of lines) for (const point of line) {
    bbox[0] = Math.min(bbox[0], point[0]);
    bbox[1] = Math.min(bbox[1], point[1]);
    bbox[2] = Math.max(bbox[2], point[0]);
    bbox[3] = Math.max(bbox[3], point[1]);
  }
  return {
    ...road,
    bbox,
    geometry: lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines },
  };
}

function segmentDistanceMeters(lat: number, lon: number, a: Point, b: Point): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const scaleX = earthRadiusMeters * Math.cos(toRadians(lat));
  const px = toRadians(lon) * scaleX;
  const py = toRadians(lat) * earthRadiusMeters;
  const ax = toRadians(a[0]) * scaleX;
  const ay = toRadians(a[1]) * earthRadiusMeters;
  const bx = toRadians(b[0]) * scaleX;
  const by = toRadians(b[1]) * earthRadiusMeters;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function featureDistanceMeters(lat: number, lon: number, road: RoadFeature): number {
  let minimum = Number.POSITIVE_INFINITY;
  const parts = road.geometry.type === "LineString" ? [road.geometry.coordinates] : road.geometry.coordinates;
  for (const line of parts) {
    for (let index = 1; index < line.length; index += 1) {
      minimum = Math.min(minimum, segmentDistanceMeters(lat, lon, line[index - 1], line[index]));
      if (minimum === 0) return 0;
    }
  }
  return minimum;
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 5_000_000) return NextResponse.json({ error: "The selected boundary is too large to load." }, { status: 413 });
  let body: { lat?: unknown; lon?: unknown; geometry?: Geometry };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid environment lookup request." }, { status: 400 }); }

  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 39.5 || lat > 42.8 || lon < 19 || lon > 21.2) {
    return NextResponse.json({ error: "Choose a location in Albania first." }, { status: 400 });
  }
  const hasBoundary = body.geometry?.type === "Polygon" || body.geometry?.type === "MultiPolygon";
  const polygons = hasBoundary ? parseBoundary(body.geometry) : null;
  if (hasBoundary && !polygons) return NextResponse.json({ error: "The selected area boundary is invalid or too detailed." }, { status: 400 });

  const cacheKey = hasBoundary
    ? createHash("sha256").update(JSON.stringify(body.geometry)).digest("hex")
    : `${lat.toFixed(4)},${lon.toFixed(4)},${radiusMeters}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return NextResponse.json(cached.value);

  try {
    const index = getLocalOsmIndex();
    let roads: RoadFeature[];
    let coverageMode: "boundary" | "radius";
    if (polygons) {
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (const polygon of polygons) for (const ring of polygon) for (const point of ring) {
        bounds[0] = Math.min(bounds[0], point[0]);
        bounds[1] = Math.min(bounds[1], point[1]);
        bounds[2] = Math.max(bounds[2], point[0]);
        bounds[3] = Math.max(bounds[3], point[1]);
      }
      roads = index.roads.flatMap((road) => {
        const [west, south, east, north] = road.bbox;
        if (east < bounds[0] || west > bounds[2] || north < bounds[1] || south > bounds[3]) return [];
        const clipped = clipRoad(road, polygons);
        return clipped ? [clipped] : [];
      });
      coverageMode = "boundary";
    } else {
      const latMargin = radiusMeters / 110_574;
      const lonMargin = radiusMeters / (111_320 * Math.max(0.1, Math.cos(lat * Math.PI / 180)));
      roads = index.roads.filter((road) => {
        const [west, south, east, north] = road.bbox;
        if (east < lon - lonMargin || west > lon + lonMargin || north < lat - latMargin || south > lat + latMargin) return false;
        return featureDistanceMeters(lat, lon, road) <= radiusMeters;
      });
      coverageMode = "radius";
    }
    const result = {
      type: "FeatureCollection" as const,
      features: roads,
      coverageMode,
      radiusMeters: coverageMode === "radius" ? radiusMeters : null,
      datasetUpdatedAt: index.updatedAt,
      method: "Illustrative road-class and time-of-day model; not measured traffic, decibel, or air-quality readings.",
    };
    cache.set(cacheKey, { at: Date.now(), value: result });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=1800" } });
  } catch (error) {
    console.error("Local road network could not be loaded.", error);
    return NextResponse.json({ error: "The local road network could not be loaded. Reinstall the app or contact support." }, { status: 500 });
  }
}
