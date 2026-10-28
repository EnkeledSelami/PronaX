#!/usr/bin/env python3
"""Export the retained Tirana market database and bundled OSM zones as map JSON.

No network requests are made. Neighbourhood coordinates are a retained,
attributed Nominatim snapshot in data-source/market-prices/raw/.
"""
import json
import re
import sqlite3
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data-source" / "market-prices"
DB = BASE / "tirana-prices.sqlite"
GPKG = ROOT / "data-source" / "albania.gpkg"
POINTS = BASE / "raw" / "prona_neighbourhood_osm_points.json"
OUTPUT = ROOT / "public" / "data" / "tirana-market-prices.json"


def parse_wkb(data, offset=0):
    """Decode the Polygon/MultiPolygon WKB used by this GeoPackage layer."""
    endian = "<" if data[offset] == 1 else ">"
    geom_type = struct.unpack_from(endian + "I", data, offset + 1)[0]
    cursor = offset + 5
    if geom_type == 3:  # Polygon
        ring_count = struct.unpack_from(endian + "I", data, cursor)[0]
        cursor += 4
        rings = []
        for _ in range(ring_count):
            point_count = struct.unpack_from(endian + "I", data, cursor)[0]
            cursor += 4
            ring = []
            for _ in range(point_count):
                lon, lat = struct.unpack_from(endian + "dd", data, cursor)
                cursor += 16
                ring.append([lon, lat])
            rings.append(ring)
        return {"type": "Polygon", "coordinates": rings}, cursor
    if geom_type == 6:  # MultiPolygon
        polygon_count = struct.unpack_from(endian + "I", data, cursor)[0]
        cursor += 4
        polygons = []
        for _ in range(polygon_count):
            polygon, cursor = parse_wkb(data, cursor)
            if polygon["type"] != "Polygon":
                raise ValueError("Unexpected non-Polygon member in MultiPolygon")
            polygons.append(polygon["coordinates"])
        return {"type": "MultiPolygon", "coordinates": polygons}, cursor
    raise ValueError(f"Unsupported market map geometry type {geom_type}")


def gpkg_geojson(blob):
    # GeoPackage binary header: magic/version/flags/SRS, then optional envelope.
    if blob[:2] != b"GP":
        raise ValueError("Invalid GeoPackage geometry header")
    envelope = (blob[3] >> 1) & 0b111
    envelope_bytes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[envelope]
    geometry, _ = parse_wkb(blob, 8 + envelope_bytes)
    return geometry


def main():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    point_snapshot = json.loads(POINTS.read_text(encoding="utf-8"))
    points_by_name = {item["name"].casefold(): item for item in point_snapshot.get("points", [])}

    neighbourhoods = []
    for row in db.execute("""
        SELECT a.area_id,a.name,
          MAX(CASE WHEN o.statistic='median' THEN o.value END) AS median,
          MAX(CASE WHEN o.statistic='p25' THEN o.value END) AS p25,
          MAX(CASE WHEN o.statistic='p75' THEN o.value END) AS p75,
          MAX(o.sample_count) AS listing_count,
          MAX(o.snapshot_date) AS snapshot_date
        FROM areas a JOIN observations o ON o.area_id=a.area_id
        WHERE o.source_id='prona_neighbourhoods'
          AND o.indicator='asking_price_per_sqm'
          AND o.publication_status='eligible_with_attribution'
        GROUP BY a.area_id,a.name ORDER BY a.name
    """):
        anchor = points_by_name.get(row["name"].casefold())
        # A name search can return a landmark with a similar name (Qendra once
        # resolved to the Pyramid). Keep the price record but withhold its map
        # point unless OSM supplied a place/neighbourhood type.
        if anchor and anchor.get("placeType") not in {"quarter", "neighbourhood", "suburb", "administrative", "residential"}:
            anchor = None
        # Keep geographic confidence separate from price confidence.
        neighbourhoods.append({
            "id": row["area_id"], "name": row["name"],
            "latitude": anchor["lat"] if anchor else None, "longitude": anchor["lon"] if anchor else None,
            "median": round(row["median"], 1) if row["median"] is not None else None,
            "p25": round(row["p25"], 1) if row["p25"] is not None else None,
            "p75": round(row["p75"], 1) if row["p75"] is not None else None,
            "listingCount": row["listing_count"], "snapshotDate": row["snapshot_date"],
            "locationType": anchor.get("placeType", "") if anchor else "",
            "osmType": anchor.get("osmType", "") if anchor else "", "osmId": anchor.get("osmId", "") if anchor else "",
            "locationLabel": anchor.get("displayName", "") if anchor else "",
            "source": "Prona", "sourceUrl": "https://pronatirana.com/en/cmimet",
            "method": "Sale-listing aggregate; neighbourhood assigned to nearest named OSM area within 900 m. Property-type filter is not stated in the CSV.",
            "geometryNote": "OSM label point only; not an official neighbourhood boundary.",
        })

    unit_values = {}
    for row in db.execute("""
        SELECT a.name,o.value,o.period_start,o.period_end,o.snapshot_date,o.publication_status
        FROM areas a JOIN observations o ON o.area_id=a.area_id
        WHERE o.source_id='keydata_q2_2026'
          AND o.indicator='market_apartment_price_per_sqm'
          AND o.statistic='mean'
    """):
        unit_match = re.search(r"Unit\s+(\d+)", row["name"], re.I)
        if unit_match and row["publication_status"] == "published_aggregate_attribution_scope_unclear":
            unit_values[int(unit_match.group(1))] = {
                "price": round(row["value"]), "periodStart": row["period_start"],
                "periodEnd": row["period_end"], "snapshotDate": row["snapshot_date"],
            }

    gpkg = sqlite3.connect(GPKG)
    units = []
    for name, geom, osm_id in gpkg.execute("""
        SELECT name,geom,osm_id FROM gis_osm_adminareas_a_free
        WHERE fclass='admin_level9' AND name LIKE '%Bashkiake Nr.%'
    """):
        match = re.search(r"Nr\.\s*(\d+)", name or "")
        if not match:
            continue
        number = int(match.group(1))
        geometry = gpkg_geojson(geom)
        value = unit_values.get(number)
        units.append({
            "type": "Feature", "id": f"tirana-unit-{number}", "geometry": geometry,
            "properties": {
                "marketId": f"admin-unit:{number}", "kind": "administrative_unit",
                "name": f"Municipal unit {number}", "unitNumber": number,
                "price": value["price"] if value else None,
                "unit": "EUR/m² average", "periodStart": value["periodStart"] if value else None,
                "periodEnd": value["periodEnd"] if value else None,
                "snapshotDate": value["snapshotDate"] if value else "2026-10-27",
                "source": "Keydata, as published by Hyrja.al", "sourceUrl": "https://hyrja.al/en/blog/apartment-prices-tirana-by-area-2026",
                "method": "Published administrative-unit average for apartments; mixes new build and resale. This is not the neighbourhood listing median.",
                "geometrySource": "OpenStreetMap Geofabrik Albania snapshot, 2026-10-27",
                "osmId": str(osm_id),
                "geometryNote": "OpenStreetMap administrative-unit boundary; unit label joined by its published OSM name.",
            },
        })
    gpkg.close()
    db.close()

    result = {
        "version": "1.0.0", "city": "Tirana", "currency": "EUR",
        "builtAt": "2026-10-28", "neighbourhoods": neighbourhoods,
        "administrativeUnits": {"type": "FeatureCollection", "features": units},
        "methodology": {
            "neighbourhoodSource": "Prona (pronatirana.com)",
            "neighbourhoodSnapshot": "2026-10-28",
            "neighbourhoodDisclosure": "Asking prices from sale listings, not completed transactions. The CSV does not state a property-type filter. Price range is the publisher's 25th–75th percentile. Listing counts indicate source records, not verified unique homes.",
            "pointDisclosure": "Neighbourhood anchors are OpenStreetMap place labels. They locate a label on the map; they are not neighbourhood boundary polygons.",
            "unitDisclosure": "Administrative-unit colour and figures are the published Q2 2026 Keydata averages as reported by Hyrja. They are a separate metric and source; never merge them with Prona neighbourhood medians.",
            "geometrySnapshot": "OpenStreetMap Geofabrik Albania extract, downloaded 2026-10-27; ODbL attribution applies.",
            "fallbackPolicy": "No fallback price is silently substituted. Where a neighbourhood estimate is absent, show the nearest broader benchmark separately and identify its publisher, period, and metric.",
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(neighbourhoods)} neighbourhood points and {len(units)} administrative boundaries to {OUTPUT}")


if __name__ == "__main__":
    main()
