#!/usr/bin/env python3
"""Build PronaX's compact nearby-places index from Geofabrik's Albania GPKG.

The source GPKG is not shipped in the installer. The compressed JSON index is
derived from OpenStreetMap data and remains ODbL-licensed.
"""

from __future__ import annotations

import gzip
import json
import os
import sqlite3
import struct
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get("PRONAX_GPKG", ROOT / "data-source" / "albania.gpkg"))
OUTPUT = ROOT / "public" / "data" / "albania-amenities.json.gz"
UPDATED_AT = os.environ.get("PRONAX_OSM_UPDATED_AT", "2026-10-26T21:24:46Z")

CATEGORIES = {
    "education": {"school", "university", "college", "kindergarten", "library"},
    "health": {"hospital", "clinic", "doctors", "dentist", "pharmacy", "chemist", "optician", "veterinary"},
    "green-space": {"park", "playground", "garden", "nature_reserve", "dog_park", "recreation_ground", "grass", "forest", "meadow", "allotments"},
    "transport": {"bus_station", "bus_stop", "railway_station", "railway_halt", "ferry_terminal", "subway_entrance", "tram_stop", "taxi", "airport", "airfield", "helipad", "apron", "pier"},
    "daily-needs": {"marketplace", "supermarket", "convenience", "general", "greengrocer", "butcher", "bakery", "beverages", "kiosk", "food"},
    "shopping": {"clothes", "shoe_shop", "furniture_shop", "mobile_phone_shop", "jeweller", "gift_shop", "florist", "computer_shop", "camera", "sports_shop", "toy_shop", "bookshop", "stationery", "video_shop", "department_store", "mall", "doityourself", "garden_centre", "outdoor_shop", "bicycle_shop", "bicycle", "electronics", "hardware", "houseware", "jewelry", "perfumery", "pet", "second_hand", "variety_store", "watches", "wholesale"},
    "restaurants": {"restaurant", "cafe", "fast_food", "food_court"},
    "fitness": {"fitness_centre", "sports_centre", "sports_hall", "pitch", "stadium", "swimming_pool", "track"},
    "entertainment": {"bar", "pub", "nightclub", "cinema", "theatre", "arts_centre", "attraction", "theme_park", "zoo", "museum", "biergarten"},
    "parking": {"parking", "parking_bicycle", "vending_parking"},
    "civic": {"community_centre", "police", "fire_station", "town_hall", "courthouse", "post_office", "embassy", "consulate", "muslim", "christian", "christian_orthodox", "christian_catholic", "muslim_sunni", "christian_evangelical", "christian_protestant", "jewish", "graveyard", "prison", "wayside_shrine", "wayside_cross", "camera_surveillance", "post_box", "nursing_home"},
    "tourism": {"hotel", "guesthouse", "hostel", "motel", "camp_site", "caravan_site", "chalet", "alpine_hut", "wilderness_hut", "tourist_info", "viewpoint", "archaeological", "ruins", "monument", "castle", "memorial", "lighthouse", "fort", "artwork", "picnic_site", "observation_tower", "tower", "battlefield", "travel_agent", "bicycle_rental"},
    "vehicle": {"fuel", "car_wash", "car_rental", "car_dealership", "bicycle_repair_station", "charging_station"},
    "personal": {"hairdresser", "beauty_shop", "laundry", "tailor", "tattoo", "dry_cleaning", "beauty"},
    "finance": {"bank", "atm", "bureau_de_change", "money_transfer"},
    "utilities": {"toilet", "drinking_water", "recycling", "waste_basket", "fountain", "water_well", "telephone", "shelter", "water_tower", "water_works", "water_mill", "recycling_clothes", "recycling_glass", "recycling_metal"},
}

ROAD_BASE = {
    "motorway": 94, "motorway_link": 80,
    "trunk": 88, "trunk_link": 76,
    "primary": 78, "primary_link": 68,
    "secondary": 64, "secondary_link": 57,
    "tertiary": 52, "tertiary_link": 46,
    "unclassified": 41, "residential": 38, "living_street": 25,
}


def category_for(fclass: str) -> str | None:
    for category, classes in CATEGORIES.items():
        if fclass in classes:
            return category
    return None


def point_from_gpkg(blob: bytes) -> tuple[float, float] | None:
    # GeoPackage header (8 bytes) followed by little/big endian WKB.
    if not blob or blob[:2] != b"GP" or len(blob) < 29:
        return None
    offset = 8
    byte_order = blob[offset]
    endian = "<" if byte_order == 1 else ">"
    geometry_type = struct.unpack_from(endian + "I", blob, offset + 1)[0] & 0xFF
    if geometry_type != 1:  # Point layer only.
        return None
    longitude, latitude = struct.unpack_from(endian + "dd", blob, offset + 5)
    if not (19 <= longitude <= 22 and 39 <= latitude <= 43):
        return None
    return latitude, longitude


def representative_point(blob: bytes) -> tuple[float, float] | None:
    if not blob or blob[:2] != b"GP" or len(blob) < 40:
        return None
    # Area layers carry the GeoPackage XY envelope; its centre is a lightweight
    # representative point for local-radius filtering and map visualization.
    flags = blob[3]
    envelope_type = (flags >> 1) & 0x07
    if envelope_type != 1:
        return None
    byte_order = blob[3] & 1
    endian = "<" if byte_order else ">"
    min_lon, max_lon, min_lat, max_lat = struct.unpack_from(endian + "dddd", blob, 8)
    latitude = (min_lat + max_lat) / 2
    longitude = (min_lon + max_lon) / 2
    if not (19 <= longitude <= 22 and 39 <= latitude <= 43):
        return None
    return latitude, longitude


def road_geometry(blob: bytes) -> tuple[dict[str, object], tuple[float, float, float, float]] | None:
    """Decode the source GeoPackage's 2D LineString/MultiLineString WKB."""
    if not blob or blob[:2] != b"GP" or len(blob) < 29:
        return None

    def read_wkb(offset: int) -> tuple[list[list[tuple[float, float]]], int] | None:
        if offset + 5 > len(blob):
            return None
        byte_order = blob[offset]
        endian = "<" if byte_order == 1 else ">"
        geometry_type = struct.unpack_from(endian + "I", blob, offset + 1)[0] & 0xFF
        cursor = offset + 5
        if geometry_type == 2:
            if cursor + 4 > len(blob):
                return None
            count = struct.unpack_from(endian + "I", blob, cursor)[0]
            cursor += 4
            if count < 2 or cursor + count * 16 > len(blob):
                return None
            points = [struct.unpack_from(endian + "dd", blob, cursor + i * 16) for i in range(count)]
            return [points], cursor + count * 16
        if geometry_type == 5:
            if cursor + 4 > len(blob):
                return None
            count = struct.unpack_from(endian + "I", blob, cursor)[0]
            cursor += 4
            parts: list[list[tuple[float, float]]] = []
            for _ in range(count):
                nested = read_wkb(cursor)
                if nested is None:
                    return None
                nested_parts, cursor = nested
                parts.extend(nested_parts)
            return parts, cursor
        return None

    # GeoPackage geometry may include a bounding-box envelope after its
    # 8-byte header. Skip it before reading WKB (most road rows use XY).
    envelope_type = (blob[3] >> 1) & 0x07
    envelope_sizes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
    envelope_size = envelope_sizes.get(envelope_type)
    if envelope_size is None:
        return None
    decoded = read_wkb(8 + envelope_size)
    if decoded is None:
        return None
    parts, _ = decoded
    parts = [[(x, y) for x, y in part if 19 <= x <= 22 and 39 <= y <= 43] for part in parts]
    parts = [part for part in parts if len(part) >= 2]
    if not parts:
        return None
    flat = [point for part in parts for point in part]
    bounds = (min(x for x, _ in flat), min(y for _, y in flat), max(x for x, _ in flat), max(y for _, y in flat))
    if len(parts) == 1:
        return {"type": "LineString", "coordinates": parts[0]}, bounds
    return {"type": "MultiLineString", "coordinates": parts}, bounds


def road_features(connection: sqlite3.Connection) -> list[dict[str, object]]:
    features: list[dict[str, object]] = []
    seen: set[str] = set()
    for osm_id, fclass, name, geom in connection.execute(
        "SELECT osm_id, fclass, name, geom FROM gis_osm_roads_free"
    ):
        road_class = fclass or ""
        if road_class not in ROAD_BASE:
            continue
        decoded = road_geometry(geom)
        if not decoded:
            continue
        geometry, bounds = decoded
        feature_id = str(osm_id)
        if feature_id in seen:
            continue
        seen.add(feature_id)
        base = ROAD_BASE[road_class]
        features.append({
            "type": "Feature",
            "id": f"road/{feature_id}",
            "bbox": list(bounds),
            "geometry": geometry,
            "properties": {
                "name": (name or "").strip() or road_class.replace("_", " ").title(),
                "roadClass": road_class,
                "trafficBase": base,
                "noiseBase": min(100, round(base * 0.84 + 10)),
            },
        })
    return features


def build() -> int:
    if not SOURCE.is_file():
        print(f"GeoPackage not found: {SOURCE}", file=sys.stderr)
        print("Download albania-latest-free.gpkg.zip from Geofabrik and extract albania.gpkg to data-source/.", file=sys.stderr)
        return 2

    connection = sqlite3.connect(f"file:{SOURCE.as_posix()}?mode=ro", uri=True)
    rows: dict[str, dict[str, object]] = {}
    sources = [
        ("gis_osm_pois_free", point_from_gpkg),
        ("gis_osm_pois_a_free", representative_point),
        ("gis_osm_transport_free", point_from_gpkg),
        ("gis_osm_transport_a_free", representative_point),
        ("gis_osm_traffic_free", point_from_gpkg),
        ("gis_osm_traffic_a_free", representative_point),
        ("gis_osm_pofw_free", point_from_gpkg),
        ("gis_osm_pofw_a_free", representative_point),
        ("gis_osm_landuse_a_free", representative_point),
    ]
    for table, point_reader in sources:
        for osm_id, fclass, name, geom in connection.execute(
            f"SELECT osm_id, fclass, name, geom FROM {table}"
        ):
            category = category_for(fclass or "")
            if not category:
                continue
            point = point_reader(geom)
            if not point:
                continue
            latitude, longitude = point
            object_id = str(osm_id or f"{table}-{len(rows)}")
            osm_type = "way" if table.endswith("_a_free") else "node"
            # The POI layer is preferred when a transport feature is duplicated.
            key = f"{category}/{osm_type}/{object_id}"
            if key in rows:
                continue
            display_name = (name or "").strip() or (fclass or "mapped place").replace("_", " ").title()
            rows[key] = {
                "type": "Feature",
                "id": f"{osm_type}/{object_id}",
                "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                "properties": {
                    "name": display_name,
                    "category": category,
                    "osmType": osm_type,
                    "osmId": int(object_id) if object_id.isdigit() else object_id,
                    "tags": {"fclass": fclass or ""},
                    "url": f"https://www.openstreetmap.org/?mlat={latitude:.6f}&mlon={longitude:.6f}#map=18/{latitude:.6f}/{longitude:.6f}",
                },
            }
    roads = road_features(connection)
    connection.close()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "OpenStreetMap contributors / Geofabrik Albania extract",
        "updatedAt": UPDATED_AT,
        "license": "ODbL-1.0",
        "features": list(rows.values()),
        "roads": roads,
    }
    with OUTPUT.open("wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0, compresslevel=9) as compressed:
            compressed.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    print(f"Wrote {len(rows):,} nearby features and {len(roads):,} road segments to {OUTPUT}")
    print(f"Source snapshot: {UPDATED_AT}")
    print(f"Compressed size: {OUTPUT.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
