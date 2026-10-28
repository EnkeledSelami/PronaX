# Minimum viable database schema proposal

The current browser-first vertical slice does not write provider records to a database. Before persistence is introduced, every row needs source and licence provenance.

## Core tables

- `data_sources`: stable source id, publisher, canonical URL, licence identifier/text, terms URL, access method, verified-at timestamp, commercial reuse status, attribution text.
- `dataset_versions`: source id, dataset name/version, observation date, publication date, ingestion timestamp, file/API endpoint, checksum, CRS, schema version, ingestion status and diagnostics.
- `admin_areas`: source id/version, source area identifier, official code when available, name, parent identifier, geographic level, geometry (PostGIS `geometry(MultiPolygon,4326)`), valid-from/to and geometry validation status.
- `indicators`: stable indicator id/name/unit/definition, expected geography level, comparability notes, missing-value meaning and methodology version.
- `area_indicator_values`: area id, dataset version, indicator id, nullable numeric/text value, observation date, denominator if applicable, geography level, suppression/missing reason and source row identifier.
- `osm_features`: OSM type + id, tags, geometry, source timestamp, retrieval timestamp and ODbL attribution/provenance. Store only when the redistribution and share-alike obligations are implemented.

## Integrity rules

- A zero is a numeric zero; missing, suppressed, not collected, not applicable and unavailable are separate states.
- Every metric joins to a specific geography level and dataset version.
- Do not join a census municipality value onto a neighborhood polygon and label it neighborhood data.
- Keep raw downloads immutable with checksums before normalization. Never replace a source version in place.
- Validate CRS, identifiers, geometry validity, duplicates, and expected counts before promotion to the serving dataset.
- Comparison queries must reject different definitions, incompatible geographic levels, and non-overlapping observation periods unless the UI explains the mismatch.
