# PronaX data inventory

Research snapshot: 27 October 2026. This inventory records what was verified, what was inferred, and what remains blocked. “Publicly viewable” does not mean “licensed for commercial redistribution.” Dataset-specific terms must be checked before publishing copied or transformed records.

## Three useful sources for the first version

| Priority | Dataset | What it can support | Current decision |
|---|---|---|---|
| 1 | OpenStreetMap place, road and amenity data | Map context, user-triggered place search, locally indexed nearby schools/health/transit/parks/services | Local POI snapshot is bundled under ODbL with attribution. Place search and map tiles remain online. Not a completeness guarantee. |
| 2 | INSTAT 2023 Population and Housing Census | Population, household and housing indicators at municipality or administrative-unit levels | Available through INSTAT and GeoData Hub; sampled ArcGIS layers state CC BY-NC-ND 4.0. Not copied into PronaX pending written commercial/adaptation permission. |
| 3 | ASIG Administrative Units (Order 1–5) | Official land, county, municipality, administrative-unit and lower-order boundaries | Dataset is listed by ASIG, but ATOM downloads currently require Geoportal registration. Current download format, dataset-specific reuse terms and exact update date remain to be verified. Not bundled. |

## Dataset records

### OSM map tiles, place search, and local nearby-places index

- **Publisher:** OpenStreetMap contributors / OpenStreetMap Foundation services.
- **URLs:** [OSM copyright and licence](https://www.openstreetmap.org/copyright), [tile usage policy](https://operations.osmfoundation.org/policies/tiles/), [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/), [Overpass API manual](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).
- **Licence:** OSM data is Open Database License (ODbL). Attribute OpenStreetMap contributors and link the licence. The standard raster tile endpoint is a separate, best-effort service with a usage policy; it is not a free unlimited tile API.
- **Format/fields:** Raster XYZ map tiles; Nominatim JSON place search results; a compressed JSON POI index derived from Geofabrik's Albania GeoPackage export.
- **Coverage/granularity:** Albania; point and area features categorized into 16 neighborhood layers: education, healthcare, green spaces, transport, groceries, retail, restaurants/cafés, fitness/sports, entertainment/culture, parking, civic/safety, tourism/landmarks, vehicle services, personal services, finance, and utilities. Nearby lookups use an 800m geodesic radius from the selected place coordinates.
- **Observation/update date:** The bundled snapshot contains OSM data as of 2026-10-26T21:24:46Z. The UI shows this date. Place search and tile layers continue to use online services.
- **Acquisition:** The Geofabrik Albania GeoPackage extract was downloaded once and processed locally by `scripts/build_local_osm_index.py`. Nearby count requests are served from the bundled index; the app no longer sends nearby queries to Overpass.
- **Bulk availability:** The source extract is available from Geofabrik. The 242 MB source GeoPackage is not included in the installer; a compact category-filtered derivative is included and remains ODbL-licensed.
- **Reuse status:** Access and ODbL attribution have been verified. Public service usage policies have been reviewed. Commercial operational suitability is not guaranteed; usage and service endpoints must remain switchable.
- **Limitations:** Mapping omissions, inconsistent tagging, snapshot age, approximate centre points for mapped area features, and imperfect place boundaries. A returned count is “mapped features in the local snapshot within the selected radius,” never a guaranteed count of real services. Refresh the dataset periodically.
- **PronaX features:** Map, search, selected place context, nearby mapped amenities and category filtering.

### INSTAT 2023 Census — population distribution / municipal and administrative-unit indicators

- **Publisher:** Institute of Statistics of Albania (INSTAT); GeoData Hub/WebGIS dissemination.
- **URLs:** [Census 2023 tables](https://www.instat.gov.al/en/themes/censuses/census-of-population-and-housing/), [INSTAT GeoData Hub](https://geodatahub.instat.gov.al/), [municipality population-distribution FeatureServer](https://services7.arcgis.com/E9FE1JuiACmTPbPv/ArcGIS/rest/services/municipality_p_distrib_2023_view/FeatureServer), [administrative-unit population-distribution FeatureServer](https://services7.arcgis.com/E9FE1JuiACmTPbPv/ArcGIS/rest/services/administrativeunit_p_distrib_2023_view/FeatureServer).
- **Licence/reuse:** The reviewed public ArcGIS service says **Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International**. INSTAT's dissemination policy also states its statistical output is copyrighted, all rights reserved, and requires attribution. These terms do not establish permission for a commercial, transformed PronaX integration. **Status: access verified; redistribution/adaptation for product use not cleared.**
- **Format/fields:** ArcGIS FeatureServer, queryable as JSON/GeoJSON. The reviewed administrative-unit population layer lists names/codes for administrative units, municipality and prefecture, `DATA_REF`, and `P_DISTRIB`; service spatial reference is EPSG:32634.
- **Coverage/granularity:** Albania. Separate service layers are at municipality and administrative-unit levels. The GeoData Hub reports 2023 census coverage and selected indicators by administrative units, municipalities and prefectures, plus some 1 km² grid indicators; availability varies by indicator.
- **Observation date:** Census reference moment was 18 September 2023. Do not present as current population.
- **Update frequency:** Census is decennial; the observed values are a 2023 snapshot. No regular update for this dataset is documented.
- **Acquisition:** INSTAT census tables/database and GeoData Hub/WebGIS. REST query works publicly for the inspected layer; this verifies access, not commercial redistribution permission.
- **Bulk availability:** INSTAT pages provide downloadable tables and the FeatureServer supports query/export operations. Bulk redistribution is not approved under the reviewed service licence.
- **Limitations:** No neighborhood-level figure should be inferred from municipality or administrative-unit values. Some figures are not available at all levels. Data may be revised; store publication version and reference date when licensed.
- **PronaX features:** Demographic and housing profile, comparison. These features remain withheld until INSTAT grants terms suitable for PronaX.

### ASIG Administrative Units (Order 1–5), transport and service layers

- **Publisher:** State Authority for Geospatial Information (ASIG), National Geoportal.
- **URLs:** [Prepared datasets](https://geoportal.asig.gov.al/en/data/datasets), [ASIG Geoportal information](https://asig.gov.al/gjeoportal/), [ASIG download notice](https://asig.gov.al/en/important-notice/).
- **Licence/reuse:** A dataset-specific reuse licence was not found in the catalogue evidence reviewed. Do not treat the public catalogue or map view as an open licence. Check metadata and conditions per layer before republishing.
- **Available content:** ASIG lists “Order 1–5” boundaries (land boundary, county, municipality, administrative unit, and lower order), road transport, railway transport, geographical names, and public/health/education institution layers.
- **Format/fields:** The current catalogue describes prepared datasets but does not expose a stable machine-readable schema in its indexed page. A legacy ASIG user manual describes Shapefile downloads, but that is not evidence of the current ATOM package format. Verify after registration.
- **Coverage/granularity:** National / administrative levels for Order 1–5; transport and institution coverage depends on individual layer metadata.
- **Observation/update date:** Not established for each layer; inspect metadata before use.
- **Acquisition:** ASIG announced on 16 January 2026 that prepared-data downloads through its ATOM service require a registered National Geoportal user (or e-Albania credentials); it recommends Firefox for download. Web Map Services may also be available for viewing, but viewing access alone is not redistribution permission.
- **Bulk availability:** Prepared-data download is available to registered users; anonymous bulk access was not verified.
- **Limitations:** Registration required; terms, field schema, coordinate system, update cadence, and direct download were not verified in this audit.
- **PronaX features:** Preferred authoritative administrative boundaries and potentially transport/service layers after permission and format checks.

### INSTAT Construction Cost Index for Dwellings

- **Publisher:** INSTAT.
- **URL:** [Construction Cost Index](https://www.instat.gov.al/en/themes/prices/construction-cost-index/).
- **Licence/reuse:** INSTAT statistics attribution is required; INSTAT's dissemination policy reserves copyright. Exact commercial reuse terms for this specific table have not been confirmed. Do not republish its values until terms are checked.
- **Format/fields:** Page links to tables; index values and quarterly/yearly percentage changes, expenditure groups include materials, salary, machinery, transport, energy and other costs.
- **Coverage/granularity:** National, not neighborhood or municipal. It measures construction input cost change, not house prices or transaction values.
- **Observation/update date:** The page describes quarterly releases, base period Q4 2021 = 100. The indexed page labels Q1 2026 latest and lists a Q2 2026 release date that has passed; recheck the live page before ingesting.
- **Update frequency:** Quarterly per INSTAT metadata.
- **Acquisition:** Tables linked from the official indicator page; file/API format and direct bulk endpoint need verification.
- **Bulk availability:** Not confirmed from the current page snapshot.
- **Limitations:** National index only; it must not be presented as local market value or rent.
- **PronaX features:** Later affordability/construction-cost context, with an explicit national-level label.

### Bank of Albania Real Estate Market Survey

- **Publisher:** Bank of Albania.
- **URL:** [Survey on developments in Albania's real estate market](https://www.bankofalbania.org/Financial_Stability/Analysis_and_studies/Surveys/Survey_on_the_developments_in_the_real_estate_market_in_Albania.html).
- **Licence/reuse:** No dataset-specific redistribution licence verified; contact the Bank before reproducing tables in a commercial product.
- **Format/fields:** Survey reports, methodology, questionnaires and tables/time series are linked by reporting period; exact machine-readable format varies and needs inspection per publication.
- **Coverage/granularity:** Semiannual survey of approximately 230 construction firms and real-estate agencies; price index includes Tirana and national aggregates, not neighborhood transaction prices.
- **Observation/update date:** Published survey periods vary. Recheck the newest linked report before importing.
- **Update frequency:** Every six months according to the Bank's description.
- **Acquisition:** Official survey page and attached publications.
- **Bulk availability:** No API or bulk archive endpoint verified.
- **Limitations:** The Bank describes the survey as non-exhaustive and temporary; the index is not proof of prices in a specific neighborhood and cannot establish whether values are normal or excessive.
- **PronaX features:** Later housing-market context only, clearly labeled as survey index and aggregate geography.

## Access/reuse gates before the next data integrations

1. Obtain written commercial/adaptation terms from INSTAT for census indicators, or identify a separate official dataset with a suitable licence.
2. Register with ASIG, download the Order 1–5 package, preserve its metadata, inspect the actual licence and schema, then test geometry validity and CRS.
3. Confirm permission and file/API format for INSTAT construction costs and Bank of Albania survey tables before copying values.
4. For production OSM usage, choose and contract an appropriate tile/geocoding/Overpass provider or self-host; keep attribution and ODbL obligations visible.
