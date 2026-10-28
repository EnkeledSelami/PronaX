"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeatureCollection } from "geojson";
import dynamic from "next/dynamic";
import { t, type AppLanguage } from "@/lib/i18n";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false, loading: () => <div className="map-loading">Loading Tirana price map…</div> });

type Neighbourhood = {
  id: string; name: string; latitude: number | null; longitude: number | null;
  median: number | null; p25: number | null; p75: number | null;
  listingCount: number | null; snapshotDate: string | null; locationType: string;
  osmType: string; osmId: string; locationLabel: string;
  source: string; sourceUrl: string; method: string; geometryNote: string;
};
type MarketData = {
  builtAt: string; neighbourhoods: Neighbourhood[];
  administrativeUnits: FeatureCollection;
  methodology: { neighbourhoodDisclosure: string; pointDisclosure: string; unitDisclosure: string; geometrySnapshot: string };
};
type SelectedMarket = { id: string; kind: "neighbourhood" | "administrative_unit"; name: string };

const money = (value: number | null | undefined) => value == null ? "—" : `€${Math.round(value).toLocaleString("en-US")}`;

export default function MarketPrices({ language }: { language: AppLanguage }) {
  const text = (key: string) => t(language, key);
  const [data, setData] = useState<MarketData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedMarket | null>(null);
  const [showPoints, setShowPoints] = useState(true);
  const [showUnits, setShowUnits] = useState(true);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/data/tirana-market-prices.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("The bundled Tirana price database could not be loaded.");
        return response.json() as Promise<MarketData>;
      })
      .then((json) => { if (alive) setData(json); })
      .catch((error: unknown) => { if (alive) setLoadError(error instanceof Error ? error.message : "Market data is unavailable."); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return (data?.neighbourhoods ?? []).filter((item) => !term || item.name.toLocaleLowerCase().includes(term));
  }, [data, query]);

  const points = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: (data?.neighbourhoods ?? []).filter((item) => item.median != null && item.latitude != null && item.longitude != null).map((item) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [item.longitude!, item.latitude!] },
      properties: {
        marketId: item.id, kind: "neighbourhood", name: item.name, price: item.median,
        p25: item.p25, p75: item.p75, count: item.listingCount, period: item.snapshotDate,
        source: item.source, sourceUrl: item.sourceUrl, method: item.method,
        geometryNote: item.geometryNote, locationType: item.locationType,
      },
    })),
  }), [data]);

  const chosen = selected?.kind === "neighbourhood"
    ? data?.neighbourhoods.find((item) => item.id === selected.id)
    : null;
  const unitFeature = selected?.kind === "administrative_unit"
    ? data?.administrativeUnits.features.find((feature) => String(feature.properties?.marketId) === selected.id)
    : null;

  function selectFeature(properties: Record<string, unknown>) {
    const kind = properties.kind === "administrative_unit" ? "administrative_unit" : "neighbourhood";
    setSelected({ id: String(properties.marketId ?? ""), kind, name: String(properties.name ?? "Tirana") });
  }

  function selectNeighbourhood(item: Neighbourhood) {
    setSelected({ id: item.id, kind: "neighbourhood", name: item.name });
  }

  return <div className="workspace market-workspace">
    <aside className="sidebar market-sidebar">
      <div className="market-intro">
        <div className="eyebrow">{text("marketEyebrow")}</div>
        <h1>{text("priceAtlasTitle").split("|")[0]}<br/><em>{text("priceAtlasTitle").split("|")[1]}</em></h1>
        <p>{text("marketDescription")}</p>
      </div>

      <div className="market-source-card">
        <div className="market-source-top"><span className="market-source-icon">€</span><span><strong>{text("localPriceDataset")}</strong><small>{text("bundledOffline")}</small></span><i className="local-dot"/></div>
        <div className="market-summary"><strong>{data ? data.neighbourhoods.length : "—"}</strong><span>{text("mappedNeighbourhoods")}</span></div>
        <small className="market-updated">{text("snapshot")}: {data?.builtAt ?? text("loading")}</small>
      </div>

      <label className="market-search-label" htmlFor="market-neighbourhood-search">{text("findNeighbourhood")}</label>
      <div className="search-row market-search"><span className="search-icon">⌕</span><input id="market-neighbourhood-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text("neighbourhoodPlaceholder")}/><span className="market-search-count">{filtered.length}</span></div>
      {loadError && <div className="message error-message" role="alert">{loadError}</div>}

      <div className="market-list-head"><span>{text("neighbourhoodPrices")}</span><span>{text("medianPerSqm")}</span></div>
      <div className="market-area-list" role="list">
        {filtered.map((item) => <button key={item.id} className={`market-area-row ${selected?.id === item.id ? "selected" : ""}`} onClick={() => selectNeighbourhood(item)} role="listitem">
          <span className="market-area-name"><strong>{item.name}</strong><small>{item.listingCount?.toLocaleString("en-US")} {text("listingRecords")}{item.latitude == null ? ` · ${text("noVerifiedPoint")}` : ""}</small></span>
          <span className="market-area-price">{money(item.median)}</span>
        </button>)}
        {data && filtered.length === 0 && <div className="market-no-results">{text("noNeighbourhoodMatches")} “{query}”.</div>}
      </div>

      <div className="market-layer-controls">
        <div className="section-heading"><span>{text("mapOverlays")}</span><span className="layers-caption">{text("toggleLayers")}</span></div>
        <label className="market-toggle"><span className="market-toggle-dot points"/><span><strong>{text("neighbourhoodPricesLayer")}</strong><small>{text("pronaListingMedian")}</small></span><input type="checkbox" checked={showPoints} onChange={() => setShowPoints((value) => !value)}/></label>
        <label className="market-toggle"><span className="market-toggle-dot units"/><span><strong>{text("municipalAverage")}</strong><small>{text("publishedBenchmark")}</small></span><input type="checkbox" checked={showUnits} onChange={() => setShowUnits((value) => !value)}/></label>
      </div>
      <div className="market-disclosure"><strong>{text("howToReadMap")}</strong><p>{text("marketMapDisclosure")}</p></div>
      <div className="sidebar-legal">© OpenStreetMap contributors · ODbL · Market listing source: Prona</div>
    </aside>

    <section className="map-area market-map-area" aria-label={text("marketMapLabel")}>
      <MapCanvas place={null} amenities={null} visibleCategories={new Set()} roads={null} environmentHour={8} environmentDay="weekday" environmentMetric="traffic" marketMode marketPoints={points} marketUnits={data?.administrativeUnits} showMarketPoints={showPoints} showMarketUnits={showUnits} focusMarketId={selected?.kind === "neighbourhood" ? selected.id : null} selectedMarketId={selected?.id} onSelectMarket={selectFeature} language={language} onUserZoom={() => setWelcomeDismissed(true)}/>
      <div className="market-legend"><strong>{text("askingPriceLegend")}</strong><div><i className="legend-low"/> {text("lowerPrice")} <i className="legend-mid"/> {text("midPrice")} <i className="legend-high"/> {text("higherPrice")}</div><small>{text("priceScaleDisclaimer")}</small></div>
      {!selected && !welcomeDismissed && <div className="market-welcome"><span>{text("marketWelcomeLabel")}</span><strong>{text("marketWelcomeTitle")}</strong><p>{text("marketWelcomeText")}</p></div>}
      {selected && <section className="market-detail-card" aria-live="polite">
        <button className="clear-button market-close" onClick={() => setSelected(null)} aria-label={text("closePrice")}>×</button>
        <div className="eyebrow">{chosen ? text("neighbourhoodMedian") : text("unitAverage")}</div>
        <h2>{selected.name}</h2>
        {chosen ? <>
          <div className="market-detail-value">{money(chosen.median)} <small>/ m²</small></div>
          <div className="market-range"><span>{text("middleHalfListings")}</span><strong>{money(chosen.p25)} – {money(chosen.p75)} / m²</strong></div>
          <div className="market-detail-stats"><span><b>{chosen.listingCount?.toLocaleString("en-US") ?? "—"}</b> {text("sourceRecords")}</span><span><b>{chosen.snapshotDate ?? "—"}</b> {text("snapshot")}</span></div>
          <p className="market-detail-note">{chosen.method} {chosen.geometryNote}</p>
          <a className="market-source-link" href={chosen.sourceUrl} target="_blank" rel="noreferrer">Source: Prona <span>↗</span></a>
          <div className="market-boundary-credit">{chosen.latitude != null ? text("mapLabelPoint") : text("noVerifiedMapPoint")}</div>
        </> : unitFeature && Number(unitFeature.properties?.price) > 0 ? <>
          <div className="market-detail-value">{money(Number(unitFeature.properties?.price) || null)} <small>/ m² {text("average")}</small></div>
          <div className="market-range"><span>{text("publishedPeriod")}</span><strong>Q2 2026</strong></div>
          <p className="market-detail-note">{String(unitFeature.properties?.method ?? "")} {text("benchmarkSeparate")}</p>
          <a className="market-source-link" href={String(unitFeature.properties?.sourceUrl ?? "https://hyrja.al")} target="_blank" rel="noreferrer">Source: Keydata via Hyrja <span>↗</span></a>
          <div className="market-boundary-credit">{text("boundaryCredit")}</div>
        </> : unitFeature ? <>
          <p className="market-detail-note">{text("noConsistentPrice")}</p>
          <div className="market-boundary-credit">{text("boundaryCredit")}</div>
        </> : <p className="market-detail-note">{text("noMatchingOsm")}</p>}
      </section>}
      <div className="market-map-attribution">{data?.methodology.geometrySnapshot ?? "Map data © OpenStreetMap contributors"}</div>
    </section>
  </div>;
}
