"use client";

import { useEffect, useRef } from "react";
import { AttributionControl, GeoJSONSource, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import type { FeatureCollection, Geometry as GeoJsonGeometry } from "geojson";
import type { AmenityCollection, PlaceResult, RoadCollection } from "@/lib/geo";
import type { DayProfile, EnvironmentMetric } from "@/lib/environment-profile";
import { hourlyTrafficFactor } from "@/lib/environment-profile";
import { t, type AppLanguage } from "@/lib/i18n";

type Props = {
  place: PlaceResult | null;
  amenities: AmenityCollection | null;
  visibleCategories: Set<string>;
  roads: RoadCollection | null;
  environmentHour: number;
  environmentDay: DayProfile;
  environmentMetric: EnvironmentMetric;
  marketMode?: boolean;
  marketPoints?: FeatureCollection;
  marketUnits?: FeatureCollection;
  showMarketPoints?: boolean;
  showMarketUnits?: boolean;
  focusMarketId?: string | null;
  selectedMarketId?: string | null;
  onSelectMarket?: (properties: Record<string, unknown>) => void;
  onUserZoom?: () => void;
  language?: AppLanguage;
};

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
setWorkerUrl("/maplibre-gl-worker.mjs");

export default function MapCanvas({ place, amenities, visibleCategories, roads, environmentHour, environmentDay, environmentMetric, marketMode = false, marketPoints, marketUnits, showMarketPoints = true, showMarketUnits = true, focusMarketId, selectedMarketId, onSelectMarket, onUserZoom, language = "en" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const marketMarkersRef = useRef<Marker[]>([]);
  const selectedRef = useRef<PlaceResult | null>(place);
  const amenitiesRef = useRef<AmenityCollection | null>(amenities);
  const categoriesRef = useRef<Set<string>>(visibleCategories);
  const roadsRef = useRef<RoadCollection | null>(roads);
  const environmentRef = useRef({ hour: environmentHour, day: environmentDay, metric: environmentMetric });
  const marketModeRef = useRef(marketMode);
  const marketPointsRef = useRef(marketPoints);
  const marketUnitsRef = useRef(marketUnits);
  const showMarketPointsRef = useRef(showMarketPoints);
  const showMarketUnitsRef = useRef(showMarketUnits);
  const onSelectMarketRef = useRef(onSelectMarket);
  const onUserZoomRef = useRef(onUserZoom);
  selectedRef.current = place;
  amenitiesRef.current = amenities;
  categoriesRef.current = visibleCategories;
  roadsRef.current = roads;
  environmentRef.current = { hour: environmentHour, day: environmentDay, metric: environmentMetric };
  marketModeRef.current = marketMode;
  marketPointsRef.current = marketPoints;
  marketUnitsRef.current = marketUnits;
  showMarketPointsRef.current = showMarketPoints;
  showMarketUnitsRef.current = showMarketUnits;
  onSelectMarketRef.current = onSelectMarket;
  onUserZoomRef.current = onUserZoom;

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: host.current,
      center: marketModeRef.current ? [19.8187, 41.3275] : [19.8187, 41.3275],
      zoom: marketModeRef.current ? 11.1 : 6.25,
      minZoom: 5.5,
      maxZoom: 18,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" },
        },
        layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.15, "raster-contrast": 0.05 } }],
      },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => {
      map.addSource("place-shape", { type: "geojson", data: empty });
      map.addLayer({ id: "area-fill", type: "fill", source: "place-shape", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#60a5fa", "fill-opacity": 0.18 } });
      map.addLayer({ id: "area-line", type: "line", source: "place-shape", paint: { "line-color": "#2563eb", "line-width": 2.5 } });
      map.addSource("environment-roads", { type: "geojson", data: empty });
      map.addLayer({ id: "environment-road-line", type: "line", source: "environment-roads", paint: { "line-color": "#eab308", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.8, 12, 2.2, 16, 3.5], "line-opacity": 0.82 } });
      map.addSource("place-point", { type: "geojson", data: empty });
      map.addLayer({ id: "place-dot", type: "circle", source: "place-point", paint: { "circle-radius": 8, "circle-color": "#2563eb", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
      map.addSource("amenities", { type: "geojson", data: empty });
      map.addLayer({ id: "amenity-dot", type: "circle", source: "amenities", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3.5, 14, 7], "circle-color": ["match", ["get", "category"], "education", "#f59e0b", "health", "#ef4444", "green-space", "#22a06b", "transport", "#7c3aed", "daily-needs", "#0ea5e9", "shopping", "#e11d48", "restaurants", "#ea580c", "fitness", "#65a30d", "entertainment", "#d946ef", "parking", "#475569", "civic", "#0f766e", "tourism", "#0891b2", "vehicle", "#a16207", "personal", "#be185d", "finance", "#4f46e5", "utilities", "#64748b", "#64748b"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
      map.addSource("market-units", { type: "geojson", data: marketUnitsRef.current ?? empty });
      map.addLayer({ id: "market-unit-fill", type: "fill", source: "market-units", paint: { "fill-color": ["case", [">", ["coalesce", ["get", "price"], 0], 0], ["interpolate", ["linear"], ["get", "price"], 1500, "#7fc7a2", 1900, "#f2d16b", 2300, "#e98b5d", 3000, "#bd5d58"], "#aebbb2"], "fill-opacity": 0.38 } });
      map.addLayer({ id: "market-unit-line", type: "line", source: "market-units", paint: { "line-color": "#fff", "line-width": 1.6, "line-opacity": 0.95 } });
      map.addSource("market-points", { type: "geojson", data: marketPointsRef.current ?? empty });
      for (const layerId of ["market-unit-fill"]) {
        map.on("click", layerId, (event) => {
          const feature = event.features?.[0];
          if (feature?.properties) onSelectMarketRef.current?.(feature.properties as Record<string, unknown>);
        });
        map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
      }
      syncPlace(map, selectedRef.current);
      syncRoads(map, roadsRef.current);
      syncRoadStyle(map, environmentRef.current.hour, environmentRef.current.day, environmentRef.current.metric);
      syncAmenities(map, amenitiesRef.current, categoriesRef.current);
      syncMarket(map, marketPointsRef.current, marketUnitsRef.current, marketModeRef.current, showMarketPointsRef.current, showMarketUnitsRef.current);
    });
    map.on("zoom", (event) => {
      if (event.originalEvent) onUserZoomRef.current?.();
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncPlace(map, place);
  }, [place]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncAmenities(map, amenities, visibleCategories);
  }, [amenities, visibleCategories]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncRoads(map, roads);
  }, [roads]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncRoadStyle(map, environmentHour, environmentDay, environmentMetric);
  }, [environmentHour, environmentDay, environmentMetric]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncMarket(map, marketPoints, marketUnits, marketMode, showMarketPoints, showMarketUnits);
    if (marketMode && map.loaded()) map.flyTo({ center: [19.8187, 41.3275], zoom: 11.1, duration: 650 });
  }, [marketMode, marketPoints, marketUnits, showMarketPoints, showMarketUnits]);

  useEffect(() => {
    const map = mapRef.current;
    for (const marker of marketMarkersRef.current) marker.remove();
    marketMarkersRef.current = [];
    if (!map || !marketMode || !showMarketPoints || !marketPoints) return;
    const refreshLabelVisibility = () => {
      const reveal = map.getZoom() >= 13.2;
      for (const marker of marketMarkersRef.current) marker.getElement().classList.toggle("labels-visible", reveal);
    };
    for (const feature of marketPoints.features) {
      if (feature.geometry.type !== "Point") continue;
      const [longitude, latitude] = feature.geometry.coordinates;
      const properties = feature.properties ?? {};
      const price = Number(properties.price);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `market-price-marker ${price < 1500 ? "price-low" : price < 2100 ? "price-mid" : "price-high"}`;
      if (String(properties.marketId) === selectedMarketId) button.classList.add("selected");
      button.setAttribute("aria-label", `${String(properties.name)}: €${Math.round(price).toLocaleString("en-US")} per square metre`);
      button.title = `${String(properties.name)} · €${Math.round(price).toLocaleString("en-US")}/m²`;
      const dot = document.createElement("i");
      const label = document.createElement("span");
      label.textContent = `€${Math.round(price).toLocaleString("en-US")}`;
      button.append(dot, label);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectMarketRef.current?.(properties as Record<string, unknown>);
      });
      const marker = new Marker({ element: button, anchor: "bottom", offset: [0, -2] }).setLngLat([longitude, latitude]).addTo(map);
      marketMarkersRef.current.push(marker);
    }
    refreshLabelVisibility();
    map.on("zoom", refreshLabelVisibility);
    return () => {
      map.off("zoom", refreshLabelVisibility);
      for (const marker of marketMarkersRef.current) marker.remove();
      marketMarkersRef.current = [];
    };
  }, [marketMode, marketPoints, showMarketPoints, selectedMarketId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusMarketId || !marketPoints) return;
    const feature = marketPoints.features.find((item) => String(item.properties?.marketId) === focusMarketId);
    if (feature?.geometry.type === "Point") {
      const [longitude, latitude] = feature.geometry.coordinates;
      map.flyTo({ center: [longitude, latitude], zoom: 14.1, duration: 700 });
    }
  }, [focusMarketId, marketPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("market-unit-line")) return;
    map.setPaintProperty("market-unit-line", "line-color", ["case", ["==", ["get", "marketId"], selectedMarketId ?? ""], "#176d4e", "#ffffff"]);
    map.setPaintProperty("market-unit-line", "line-width", ["case", ["==", ["get", "marketId"], selectedMarketId ?? ""], 3, 1.6]);
  }, [selectedMarketId]);

  return <div className="map-frame"><div className="map-canvas" ref={host} /><div className="map-label"><span className="map-live-dot" /> {t(language, marketMode ? "mapTirana" : "mapAlbania")}</div></div>;
}

function syncMarket(map: MapLibreMap, points: FeatureCollection | undefined, units: FeatureCollection | undefined, active: boolean, showPoints: boolean, showUnits: boolean) {
  const pointsSource = map.getSource("market-points") as GeoJSONSource | undefined;
  const unitsSource = map.getSource("market-units") as GeoJSONSource | undefined;
  if (pointsSource) pointsSource.setData(points ?? empty);
  if (unitsSource) unitsSource.setData(units ?? empty);
  if (map.getLayer("market-price-points")) map.setLayoutProperty("market-price-points", "visibility", active && showPoints ? "visible" : "none");
  for (const layer of ["market-unit-fill", "market-unit-line"]) if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", active && showUnits ? "visible" : "none");
}

function syncPlace(map: MapLibreMap, place: PlaceResult | null) {
  const shapeSource = map.getSource("place-shape") as GeoJSONSource | undefined;
  const pointSource = map.getSource("place-point") as GeoJSONSource | undefined;
  if (!shapeSource || !pointSource) return;
  const shape = place?.geometry && ["Polygon", "MultiPolygon"].includes(place.geometry.type)
    ? { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, geometry: place.geometry as GeoJsonGeometry, properties: {} }] }
    : empty;
  shapeSource.setData(shape);
  pointSource.setData(place ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [place.longitude, place.latitude] }, properties: { name: place.name } }] } : empty);
  if (place) focus(map, place);
}

function syncAmenities(map: MapLibreMap, amenities: AmenityCollection | null, visibleCategories: Set<string>) {
  const source = map.getSource("amenities") as GeoJSONSource | undefined;
  if (!source) return;
  const features = (amenities?.features ?? []).filter((feature) => visibleCategories.has(feature.properties.category));
  source.setData({ type: "FeatureCollection", features });
}

function syncRoads(map: MapLibreMap, roads: RoadCollection | null) {
  const source = map.getSource("environment-roads") as GeoJSONSource | undefined;
  if (!source) return;
  source.setData(roads ?? empty);
}

function syncRoadStyle(map: MapLibreMap, hour: number, day: DayProfile, metric: EnvironmentMetric) {
  if (!map.getLayer("environment-road-line")) return;
  const factor = 0.20 + hourlyTrafficFactor(day, hour) * 0.80;
  const baseProperty = metric === "noise" ? "noiseBase" : "trafficBase";
  map.setPaintProperty("environment-road-line", "line-color", [
    "interpolate", ["linear"], ["*", ["get", baseProperty], factor],
    0, "#34a853", 32, "#a3c746", 52, "#f2c94c", 72, "#f28c38", 92, "#d94141", 100, "#b4232c",
  ]);
}

function focus(map: MapLibreMap, place: PlaceResult) {
  if (place.boundingBox) {
    const [west, south, east, north] = place.boundingBox;
    if (east > west && north > south) {
      map.fitBounds([[west, south], [east, north]], { padding: 90, maxZoom: 14, duration: 900 });
      return;
    }
  }
  map.flyTo({ center: [place.longitude, place.latitude], zoom: 13, duration: 900 });
}
