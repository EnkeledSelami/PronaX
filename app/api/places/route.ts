import { NextRequest, NextResponse } from "next/server";
import { normalizeNominatimPlace } from "@/lib/geo";

export const runtime = "nodejs";

const cache = new Map<string, { at: number; value: unknown }>();
let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

async function serializedNominatimRequest(url: URL) {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const wait = Math.max(0, 1100 - (Date.now() - lastRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return await fetch(url, {
      headers: { "User-Agent": "PronaX/0.1 (https://kelixel.com; neighborhood research demo)" },
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
  } finally {
    release();
  }
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 100) {
    return NextResponse.json({ error: "Enter a location between 2 and 100 characters." }, { status: 400 });
  }
  const key = query.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return NextResponse.json(cached.value);

  try {
    const base = process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";
    const url = new URL("/search", base);
    url.search = new URLSearchParams({ q: query, format: "jsonv2", countrycodes: "al", addressdetails: "1", polygon_geojson: "1", limit: "5", "accept-language": "en" }).toString();
    const response = await serializedNominatimRequest(url);
    if (!response.ok) return NextResponse.json({ error: "The location service is temporarily unavailable. Please try again." }, { status: 502 });
    const raw = await response.json();
    const places = Array.isArray(raw) ? raw.map(normalizeNominatimPlace).filter(Boolean) : [];
    cache.set(key, { at: Date.now(), value: places });
    return NextResponse.json(places, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "Could not reach the location service. Please try again." }, { status: 502 });
  }
}
