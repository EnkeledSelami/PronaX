"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AmenityCollection, AmenityCategory, PlaceResult, RoadCollection } from "@/lib/geo";
import { estimatedRoadPressure, pressureWord, type DayProfile, type EnvironmentMetric } from "@/lib/environment-profile";
import MarketPrices from "@/components/MarketPrices";
import { t, type AppLanguage } from "@/lib/i18n";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), { ssr: false, loading: () => <div className="map-loading">Loading…</div> });

function updateAmount(input: HTMLInputElement, setValue: (value: string) => void) {
  const raw = input.value;
  const digits = raw.replace(/\D/g, "");
  const digitsBeforeCaret = raw.slice(0, input.selectionStart ?? raw.length).replace(/\D/g, "").length;
  setValue(digits);
  requestAnimationFrame(() => {
    const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    let caret = 0;
    let seen = 0;
    while (caret < formatted.length && seen < digitsBeforeCaret) {
      if (/\d/.test(formatted[caret])) seen += 1;
      caret += 1;
    }
    input.setSelectionRange(caret, caret);
  });
}

const categories: { id: AmenityCategory; labelKey: string; icon: string; color: string }[] = [
  { id: "education", labelKey: "education", icon: "▤", color: "amber" },
  { id: "health", labelKey: "healthcare", icon: "+", color: "red" },
  { id: "green-space", labelKey: "greenSpaces", icon: "✳", color: "green" },
  { id: "transport", labelKey: "transport", icon: "↗", color: "violet" },
  { id: "daily-needs", labelKey: "dailyNeeds", icon: "⌂", color: "blue" },
  { id: "shopping", labelKey: "shopping", icon: "▣", color: "rose" },
  { id: "restaurants", labelKey: "restaurants", icon: "☕", color: "orange" },
  { id: "fitness", labelKey: "fitness", icon: "⚽", color: "lime" },
  { id: "entertainment", labelKey: "entertainment", icon: "♫", color: "pink" },
  { id: "parking", labelKey: "parking", icon: "P", color: "slate" },
  { id: "civic", labelKey: "civic", icon: "⌂", color: "teal" },
  { id: "tourism", labelKey: "tourism", icon: "◇", color: "cyan" },
  { id: "vehicle", labelKey: "vehicle", icon: "⛽", color: "brown" },
  { id: "personal", labelKey: "personal", icon: "✦", color: "magenta" },
  { id: "finance", labelKey: "finance", icon: "¤", color: "indigo" },
  { id: "utilities", labelKey: "utilities", icon: "♧", color: "gray" },
];
const defaultVisibleCategories = new Set<AmenityCategory>([
  "education", "health", "green-space", "transport", "daily-needs",
]);

export default function PronaXApp() {
  const [service, setService] = useState<"explore" | "prices">("explore");
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [exploreHintDismissed, setExploreHintDismissed] = useState(false);
  const text = (key: string) => t(language, key);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [amenities, setAmenities] = useState<AmenityCollection | null>(null);
  const [roads, setRoads] = useState<RoadCollection | null>(null);
  const [environmentBusy, setEnvironmentBusy] = useState(false);
  const [environmentHour, setEnvironmentHour] = useState(8);
  const [environmentDay, setEnvironmentDay] = useState<DayProfile>("weekday");
  const [environmentMetric, setEnvironmentMetric] = useState<EnvironmentMetric>("traffic");
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(defaultVisibleCategories));
  const [busy, setBusy] = useState<"search" | "nearby" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparePlaces, setComparePlaces] = useState<PlaceResult[]>([]);
  const [compareData, setCompareData] = useState<Record<string, AmenityCollection>>({});
  const [compareBusy, setCompareBusy] = useState<string | null>(null);
  const [costOpen, setCostOpen] = useState(false);
  const [homePrice, setHomePrice] = useState("12000000");
  const [deposit, setDeposit] = useState("2400000");
  const [interest, setInterest] = useState("5");
  const [term, setTerm] = useState("300");
  const [currency, setCurrency] = useState<"ALL" | "EUR" | "USD">("ALL");
  const total = useMemo(() => amenities?.features.length ?? 0, [amenities]);
  useEffect(() => {
    const saved = window.localStorage.getItem("pronax-language");
    if (saved === "en" || saved === "sq") setLanguage(saved);
  }, []);
  useEffect(() => { window.localStorage.setItem("pronax-language", language); }, [language]);
  const environmentEstimate = useMemo(() => {
    if (!roads?.features.length) return null;
    const average = roads.features.reduce((sum, road) => sum + (environmentMetric === "noise" ? road.properties.noiseBase : road.properties.trafficBase), 0) / roads.features.length;
    return Math.round(estimatedRoadPressure(average, environmentDay, environmentHour, environmentMetric));
  }, [roads, environmentMetric, environmentDay, environmentHour]);
  const monthlyPayment = useMemo(() => {
    const principal = Math.max(0, Number(homePrice.replace(/,/g, "")) - Number(deposit.replace(/,/g, "")));
    const months = Number(term);
    const monthlyRate = Number(interest) / 1200;
    if (!Number.isFinite(principal) || !months || principal <= 0) return 0;
    return monthlyRate > 0 ? principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)) : principal / months;
  }, [homePrice, deposit, interest, term]);
  useEffect(() => {
    if (!playing || !roads) return;
    const timer = window.setInterval(() => setEnvironmentHour((hour) => (hour + 1) % 24), 1000);
    return () => window.clearInterval(timer);
  }, [playing, roads]);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) { setError(text("typeTwoChars")); return; }
    setBusy("search"); setError(""); setNotice(""); setPlaces([]);
    try {
      const response = await fetch(`/api/places?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Location search failed.");
      setPlaces(data);
      if (!data.length) setNotice(text("noSearchResult"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Location search failed."); }
    finally { setBusy(null); }
  }

  async function loadNearby() {
    if (!place) return;
    setBusy("nearby"); setError("");
    try {
      const response = await fetch(`/api/amenities?lat=${place.latitude}&lon=${place.longitude}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nearby places could not be loaded.");
      setAmenities(data);
      setNotice(data.features.length ? `${data.features.length} mapped places found within ${data.radiusMeters ?? 800} m.` : `No matching places are in the local snapshot within ${data.radiusMeters ?? 800} m. This does not prove none exist.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nearby places could not be loaded."); }
    finally { setBusy(null); }
  }

  async function loadEnvironment() {
    if (!place) return;
    setEnvironmentBusy(true); setError(""); setPlaying(false);
    try {
      const hasBoundary = place.geometry && ["Polygon", "MultiPolygon"].includes(place.geometry.type);
      const response = await fetch("/api/environment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: place.latitude, lon: place.longitude, geometry: hasBoundary ? place.geometry : null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The local road network could not be loaded.");
      setRoads(data);
      setNotice(`${data.features.length.toLocaleString()} nearby road segments loaded from the bundled map snapshot.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The local road network could not be loaded."); }
    finally { setEnvironmentBusy(false); }
  }

  function choosePlace(result: PlaceResult) {
    setPlace(result); setPlaces([]); setAmenities(null); setRoads(null); setPlaying(false); setNotice(""); setError("");
  }

  function toggleCategory(id: string) {
    setVisible((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function addToComparison() {
    if (!place) return;
    if (comparePlaces.some((item) => item.id === place.id)) { setNotice("This location is already in your comparison."); return; }
    if (comparePlaces.length >= 3) { setNotice("Compare up to three places at a time. Remove one to add another."); return; }
    setComparePlaces((items) => [...items, place]);
    setNotice(`${place.name} added to comparison.`);
    void loadCompareData(place);
  }

  async function loadCompareData(item: PlaceResult) {
    setCompareBusy(item.id);
    try {
      const response = await fetch(`/api/amenities?lat=${item.latitude}&lon=${item.longitude}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load mapped places.");
      setCompareData((previous) => ({ ...previous, [item.id]: data }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load mapped places."); }
    finally { setCompareBusy(null); }
  }

  function removeCompared(id: string) {
    setComparePlaces((items) => items.filter((item) => item.id !== id));
    setCompareData((previous) => { const next = { ...previous }; delete next[id]; return next; });
  }

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#home" aria-label="PronaX — Know Your Location"><img className="brand-full-logo" src="/pronax-full-logo.jpg" alt="PronaX — Know Your Location" /></a>
      <nav className="service-tabs" aria-label="PronaX services">
        <button className={service === "explore" ? "active" : ""} onClick={() => setService("explore")}><span>⌖</span> {text("explore")}</button>
        <button className={service === "prices" ? "active" : ""} onClick={() => setService("prices")}><span>€</span> {text("marketPrices")}</button>
      </nav>
      <div className="top-right"><button className="top-tool" onClick={() => setCompareOpen(true)}>{text("compare")} <span>{comparePlaces.length || "＋"}</span></button><button className="top-tool" onClick={() => setCostOpen(true)}>{text("costPlanner")}</button><span className="data-status"><i /> {text(service === "prices" ? "localPriceData" : "liveMapData")}</span><button className="language-toggle" onClick={() => setLanguage((value) => value === "en" ? "sq" : "en")} aria-label={text("language")} title={text("language")}>{language === "en" ? "🇬🇧 English" : "🇦🇱 Shqip"}</button><button className="profile-avatar" aria-label="KeliXel">K</button></div>
    </header>

    {service === "prices" ? <MarketPrices language={language} /> :
    <div className="workspace" id="home">
      <aside className="sidebar">
        <div className="side-intro"><div className="eyebrow">{text("exploreAlbania")}</div><h1>{text("findYour")}<br/><em>{text("place")}</em></h1><p>{text("exploreDescription")}</p></div>

        <form className="search-box" onSubmit={search}>
          <label htmlFor="location-search">{text("searchLocation")}</label>
          <div className="search-row"><span className="search-icon">⌕</span><input id="location-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={text("searchPlaceholder")} maxLength={100} /><button type="submit" aria-label={text("search")} disabled={busy === "search"}>{busy === "search" ? <span className="spinner" /> : "→"}</button></div>
          <div className="search-hint">{text("searchHint")}</div>
        </form>

        {error && <div className="message error-message" role="alert">{error}</div>}
        {notice && <div className="message notice-message" role="status">{notice}</div>}

        {places.length > 0 && <section className="results-panel"><div className="section-heading"><span>{text("searchResults")}</span><b>{places.length}</b></div>{places.map((result) => <button className="place-result" key={result.id} onClick={() => choosePlace(result)}><span className="result-pin">⌖</span><span><strong>{result.name}</strong><small>{result.level} · {result.address.municipality || result.address.city || result.address.county || "Albania"}</small></span><span className="result-arrow">↗</span></button>)}</section>}

        <section className="layers-panel"><div className="section-heading"><span>{text("mapLayers")}</span><span className="layers-caption">{amenities ? `${total} places · ${amenities.radiusMeters ?? 800} m` : text("choosePlace")}</span></div>{categories.map((item) => <label className="layer-row" key={item.id}><span className={`layer-symbol ${item.color}`}>{item.icon}</span><span className="layer-name">{text(item.labelKey)}</span><span className="layer-count">{amenities ? amenities.counts[item.id] : "—"}</span><input type="checkbox" checked={visible.has(item.id)} onChange={() => toggleCategory(item.id)} aria-label={`${text("show")} ${text(item.labelKey)}`} /></label>)}</section>

        <div className="sidebar-bottom"><div className="coverage-card"><span className="coverage-icon">⌖</span><div><strong>{text("coverageTitle")}</strong><p>{text("coverageDescription")}</p></div></div><div className="sidebar-legal">Map data © OpenStreetMap contributors · ODbL</div></div>
      </aside>

      <section className="map-area" aria-label={language === "sq" ? "Hartë interaktive e Shqipërisë" : "Interactive map of Albania"}>
        <MapCanvas place={place} amenities={amenities} visibleCategories={visible} roads={roads} environmentHour={environmentHour} environmentDay={environmentDay} environmentMetric={environmentMetric} language={language} onUserZoom={() => setExploreHintDismissed(true)} />
        {place && <section className="environment-panel" aria-label="Hourly traffic and environment context">
          <div className="environment-head"><div><div className="eyebrow">{text("environmentEyebrow")}</div><strong>{text("hourlyArea")}</strong></div><button className="environment-load" onClick={loadEnvironment} disabled={environmentBusy}>{environmentBusy ? text("loading") : roads ? text("refresh") : text("loadMap")}</button></div>
            {!roads ? <p>{place.geometry && ["Polygon", "MultiPolygon"].includes(place.geometry.type) ? text("boundaryRoadHint") : text("radiusRoadHint")}</p> : <>
            <div className="environment-controls"><div className="environment-metrics">{([ ["traffic", "traffic"], ["noise", "noise"], ["environment", "roadImpact"] ] as [EnvironmentMetric, string][]).map(([id, key]) => <button key={id} className={environmentMetric === id ? "active" : ""} onClick={() => setEnvironmentMetric(id)}>{text(key)}</button>)}</div>
              <select aria-label={environmentDay === "weekday" ? text("weekday") : text("weekend")} value={environmentDay} onChange={(event) => setEnvironmentDay(event.target.value as DayProfile)}><option value="weekday">{text("weekday")}</option><option value="weekend">{text("weekend")}</option></select>
              <label className="hour-control"><span><b>{String(environmentHour).padStart(2, "0")}:00</b><button onClick={() => setPlaying((value) => !value)}>{playing ? text("pause") : text("play")}</button></span><input type="range" min="0" max="23" step="1" value={environmentHour} onChange={(event) => setEnvironmentHour(Number(event.target.value))} aria-label={language === "sq" ? "Ora e ditës" : "Hour of day"}/><span className="hour-ticks"><small>00:00</small><small>23:00</small></span></label>
            </div>
            <div className="environment-legend"><span><i className="low"/> {text("lower")}</span><span><i className="mid"/> {text("moderate")}</span><span><i className="high"/> {text("higher")}</span></div>
            <div className="environment-score"><span>{text("modeledLevel")}</span><strong>{environmentEstimate} / 100 · {environmentEstimate === null ? "—" : text(pressureWord(environmentEstimate).toLowerCase())}</strong></div>
            <p className="environment-disclosure">{roads.coverageMode === "boundary" ? text("roadsClipped") : `${text("roadsRadius")} ${roads.radiusMeters ?? 800} m.`} {text("illustrativeRoad")} {roads.features.length.toLocaleString()} {language === "sq" ? "segmente rrugore të hartëzuara · kopja" : "mapped road segments · snapshot"} {roads.datasetUpdatedAt.slice(0, 10)}.</p>
          </>}
        </section>}
        {place && <div className="area-card"><div className="area-card-top"><div><div className="eyebrow">{text("selectedArea")} · {place.level.toUpperCase()}</div><h2>{place.name}</h2></div><button className="clear-button" onClick={() => { setPlace(null); setAmenities(null); setRoads(null); setPlaying(false); setNotice(""); }}>×</button></div><p className="area-address">{place.displayName}</p><div className="area-rule"/><div className="area-facts"><div><span>{text("mapCoordinates")}</span><strong>{place.latitude.toFixed(4)}° N · {place.longitude.toFixed(4)}° E</strong></div><div><span>{text("areaStatistics")}</span><strong className="unavailable">{text("noLocalStatistic")}</strong></div></div><div className="area-actions"><button className="nearby-button" onClick={loadNearby} disabled={busy === "nearby"}>{busy === "nearby" ? <><span className="spinner light"/> {text("loadingNearby")}</> : <><span>＋</span> {text("nearbyPlaces")} <small>{amenities?.radiusMeters ?? 800} m</small></>}</button><button className="compare-add" onClick={addToComparison}>{text("addCompare")} <span>＋</span></button></div><div className="area-source">{text("nearbyNote")} {amenities?.datasetUpdatedAt?.slice(0, 10) ?? "2026-10-26"} · {text("placeSearchInternet")}</div></div>}
        {!place && !exploreHintDismissed && <div className="map-welcome"><div className="welcome-orb">⌖</div><span>{text("exploreWelcomeLabel")}</span><h2 style={{ whiteSpace: "pre-line" }}>{text("exploreWelcomeTitle")}</h2><p style={{ whiteSpace: "pre-line" }}>{text("exploreWelcomeText")}</p></div>}
        <div className="map-source-pill"><span className="source-dot"/> OpenStreetMap <span>·</span> {language === "sq" ? "Shqipëria" : "Albania"}</div>
      </section>
    </div>}
    {compareOpen && <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setCompareOpen(false); }}><section className="tool-dialog compare-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title"><div className="dialog-head"><div><div className="eyebrow">{text("placeToPlace")}</div><h2 id="compare-title">{text("compareAreas")}</h2></div><button className="clear-button" onClick={() => setCompareOpen(false)} aria-label={text("close")}>×</button></div><p className="dialog-intro">{text("compareDescription")}</p>{comparePlaces.length === 0 ? <div className="dialog-empty"><span>⌖</span><strong>{text("noPlacesAdded")}</strong><p>{text("compareEmptyHint")}</p></div> : <><div className="compare-columns"><div className="compare-metric-head">{text("mappedPlaceType")}</div>{comparePlaces.map((item) => <div className="compare-place-head" key={item.id}><strong>{item.name}</strong><small>{item.level}</small>{compareData[item.id] && <small>{compareData[item.id].radiusMeters ?? 800} m {text("lookup")}</small>}<button onClick={() => removeCompared(item.id)}>{text("remove")}</button>{!compareData[item.id] && <button className="load-counts" disabled={compareBusy !== null} onClick={() => loadCompareData(item)}>{compareBusy === item.id ? text("loading") : text("loadNearbyCounts")}</button>}</div>)}</div>{categories.map((category) => <div className="compare-row" key={category.id}><span>{text(category.labelKey)}</span>{comparePlaces.map((item) => <strong key={item.id}>{compareData[item.id] ? compareData[item.id].counts[category.id] : "—"}</strong>)}</div>)}<div className="compare-row compare-total"><span>{text("totalMapped")}</span>{comparePlaces.map((item) => <strong key={item.id}>{compareData[item.id]?.features.length ?? "—"}</strong>)}</div><div className="comparison-note">{text("compareNote")}</div></>}</section></div>}
    {costOpen && <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setCostOpen(false); }}><section className="tool-dialog cost-dialog" role="dialog" aria-modal="true" aria-labelledby="cost-title"><div className="dialog-head"><div><div className="eyebrow">{text("yourAssumptions")} · {currency}</div><h2 id="cost-title">{text("mortgagePlanner")}</h2></div><button className="clear-button" onClick={() => setCostOpen(false)} aria-label={text("close")}>×</button></div><p className="dialog-intro">{text("mortgageDescription")}</p><div className="cost-fields"><label>{text("propertyPrice")}<input inputMode="numeric" value={homePrice.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} onChange={(e) => updateAmount(e.currentTarget, setHomePrice)} /></label><label>{text("downPayment")}<input inputMode="numeric" value={deposit.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} onChange={(e) => updateAmount(e.currentTarget, setDeposit)} /></label><label>{text("annualInterest")}<input type="number" min="0" max="100" step="0.1" value={interest} onChange={(e) => setInterest(e.target.value)} /></label><label>{text("loanTerm")}<input type="number" min="1" max="600" value={term} onChange={(e) => setTerm(e.target.value)} /></label><label className="currency-field">{text("currency")}<select value={currency} onChange={(e) => setCurrency(e.target.value as "ALL" | "EUR" | "USD")}><option value="ALL">{text("lek")}</option><option value="EUR">{text("euro")}</option><option value="USD">{text("usDollar")}</option></select></label></div><div className="cost-result"><span>{text("monthlyPayment")}</span><strong>{currency === "ALL" ? "" : currency === "EUR" ? "€" : "$"}{monthlyPayment.toLocaleString("en-US", { maximumFractionDigits: 0 })} <small>{currency === "ALL" ? "Lekë" : currency} {text("perMonth")}</small></strong><p>{text("currencyDisclaimer")}</p></div></section></div>}
    <footer className="footbar"><span><b>PRONAX</b> <span className="foot-dot">•</span> {text("footerTagline")}</span><span>{text("mapCoverageFooter")}</span><a className="kelixel-credit" href="https://www.kelixel.com" target="_blank" rel="noreferrer">{text("madeBy")} ↗</a></footer>
  </main>;
}
