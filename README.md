# PronaX

Albania neighbourhood intelligence, built around traceable geographic data.

## Included application

- Search for a place in Albania using a submit button (no autocomplete).
- Select a returned OpenStreetMap place and show its returned geometry on a pannable, zoomable map.
- Load 16 nearby map layers within 800 metres from a bundled, locally indexed Albania OpenStreetMap snapshot. Layers include groceries, shops, restaurants/cafés, fitness/sports, entertainment, parking, finance and civic services. Nearby counts do not call Overpass.
- Load nearby road segments from that same bundled snapshot and explore weekday/weekend hourly traffic, noise and road-impact context. These are relative illustrative estimates based on road class and a typical-hour profile, not measured traffic, decibel or air-quality readings.
- Filter the returned amenity points by category and inspect source and coverage notes.
- Open a separate **Market prices** service with Tirana neighbourhood listing medians, percentile ranges, sample counts, and the source method beside the map.
- Toggle a second map layer for published municipal-unit averages, shown separately from neighbourhood listing medians; boundaries come from the bundled OSM snapshot.
- Keep market prices local: the desktop app loads its included SQLite-derived JSON and does not request a price API. The map basemap and location search still require internet.

The application runs locally and includes its UI, search endpoint, local POI and road indexes, source notes, and build configuration. Search results, OSM place boundaries, and nearby feature counts are not a complete inventory of the real world. Do not interpret an unlisted feature as a real zero.

## Run locally

Requirements: Node.js 20.9 or newer. `Start-PronaX.ps1` will use the bundled Codex Node/pnpm runtime when present, otherwise it uses your installed Node.js and pnpm.

```powershell
.\Start-PronaX.ps1
```

You can also double-click `Start-PronaX.cmd` to start the development server. The local edition includes the interactive map, location search, nearby category lookup, side-by-side comparison for up to three areas, an assumption-based mortgage planner, and the Tirana Market Prices atlas.

Open <http://localhost:3000>. Enter a location such as “Tirana” and press **Search**. Choose a result, then use **Explore nearby places** to query the bundled local snapshot, or **Load map** in Hourly area view to display nearby roads. Select **Market prices** in the service navigation to inspect Tirana listing-price points and the distinct municipal-unit benchmark. Zoom in to reveal neighbourhood prices on the map, then select an area for its source and method.

## Windows desktop app

Run `PronaX-Setup.exe` from the project folder to install PronaX. The installer shows its progress and creates Start Menu and desktop shortcuts. After installation, start PronaX from either shortcut; Node.js and a terminal are not required. Keep an internet connection available for place search and map tiles. Nearby counts, road context, and Market Prices use bundled data and do not call Overpass or a housing-price API.

To rebuild the Windows apps, install Node.js 20.9 or newer, enable pnpm, install dependencies with `pnpm install`, then run `pnpm dist:win`. The setup and portable executables are written to `dist`.

To run the production build locally, use `.\Start-PronaX.ps1 -Production`. Optional service endpoint settings are documented in `.env.example`. No credentials or API keys are required for this low-volume local application.

## Data and licensing

Read [docs/data-inventory.md](docs/data-inventory.md) before changing or adding a dataset. Nearby lookups and road geometry use the bundled ODbL-derived index in `public/data/albania-amenities.json.gz`; location search uses Nominatim and map tiles remain online. The 16 toggles filter the same indexed 800 m results. Dataset attribution and license details are in `public/data/README.txt`.

Market-price inputs, rights notes, snapshot dates and geometry policies are documented in [data-source/market-prices/README.md](data-source/market-prices/README.md). The normalized local database is `data-source/market-prices/tirana-prices.sqlite`; the app reads its generated payload at `public/data/tirana-market-prices.json`. Rebuild both using the commands in that data README. Neighbourhood markers are OSM label points, not boundary polygons; administrative polygons and their separate published averages are identified as such in the interface.

To rebuild the local nearby index, download the latest free Albania GeoPackage from Geofabrik, extract `albania.gpkg` into `data-source/`, update `UPDATED_AT` in `scripts/build_local_osm_index.py` to the source timestamp, then run `py -3.9 scripts/build_local_osm_index.py`. The builder reads POI, POI-area, transport, traffic, places-of-worship, land-use and selected road classes. Do not include the source GeoPackage in the installer; only the generated compressed index is packaged.

The mortgage planner accepts property price and down payment in the selected currency unit (ALL, EUR or USD) and calculates a monthly principal-and-interest estimate from a term in months. It does not fetch exchange rates or convert the entered values.

INSTAT publishes 2023 census geographic layers, but the public REST layers reviewed for this project declare CC BY-NC-ND 4.0. PronaX is intended to become a public product, so those values are not copied or displayed until commercial reuse and adaptation rights are confirmed. ASIG's prepared datasets require Geoportal registration; their reuse terms also need to be checked per dataset.

## Database design

See [docs/schema-proposal.md](docs/schema-proposal.md) for the initial platform proposal. The housing-price service uses its own normalized SQLite research database and retains source versions, terms, dates, geographic level, sample counts, and missing values.

## Checks

```powershell
pnpm test
pnpm build
```

Place search remains a best-effort online service. Nearby POI counts are calculated from the bundled snapshot.
