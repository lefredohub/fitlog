import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { GeoJSONSource, Map as MlMap, MapMouseEvent, Marker, StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";
import { cumulativeDistances, destination, pointAtDistance } from "@/lib/geo/geo";
import type { LngLat, Position } from "@/lib/route/types";
import { cn } from "./ui";

export interface MapRoute {
  id: string;
  coordinates: Position[];
  /** Traversées de route (mode record), affichées sur le tracé sélectionné. */
  crossings?: LngLat[];
}

export interface MapPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MapViewProps {
  className?: string;
  theme: "light" | "dark";
  initialView: { center: LngLat; zoom: number };
  start?: LngLat | null;
  routes?: MapRoute[];
  selectedRouteId?: string | null;
  user?: { coord: LngLat; accuracyM: number } | null;
  showKmMarkers?: boolean;
  /** Recadre la carte quand `key` change. */
  fit?: { key: string; coords: (LngLat | Position)[] } | null;
  /** Centre la carte sur ce point à chaque mise à jour (guidage). */
  follow?: LngLat | null;
  padding?: MapPadding;
  onMapClick?: (coord: LngLat) => void;
  onRouteClick?: (id: string) => void;
  onUserGesture?: () => void;
  /** Centre et zoom de la carte après un déplacement (recherche autour de ce point). */
  onMoveEnd?: (center: LngLat, zoom: number) => void;
}

const STYLE_BASE = "https://tiles.openfreemap.org/styles/";

/** Style minimal utilisé si le fond de carte est inaccessible : les tracés restent lisibles. */
function fallbackStyle(theme: "light" | "dark"): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": theme === "dark" ? "#1b1d18" : "#e9eae3" } }],
  };
}

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function circlePolygon(center: LngLat, radiusM: number): Feature<Polygon> {
  const ring: LngLat[] = [];
  for (let i = 0; i <= 48; i++) ring.push(destination(center, radiusM, (i * 360) / 48));
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

function el(className: string, html = ""): HTMLDivElement {
  const d = document.createElement("div");
  d.className = className;
  d.innerHTML = html;
  return d;
}

/** Petite flèche (chevron) dessinée sur canvas pour indiquer le sens du parcours. */
function arrowImage(): ImageData {
  const size = 24;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "#0e1416";
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(8, 6);
  ctx.lineTo(15, 12);
  ctx.lineTo(8, 18);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

export function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [ready, setReady] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [failure, setFailure] = useState<"style" | "webgl" | null>(null);
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const markers = useRef<{
    start: Marker | null;
    crossings: Marker[];
    km: Marker[];
    user: Marker | null;
  }>({ start: null, crossings: [], km: [], user: null });

  /* ---------- Création de la carte ---------- */
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      libRef.current = lib;
      lib.setWorkerUrl(workerUrl);
      const { theme, initialView } = propsRef.current;
      const styleName = theme === "dark" ? "dark" : "liberty";
      let styleLoaded = false;
      try {
        map = new lib.Map({
          container: containerRef.current,
          style: STYLE_BASE + styleName,
          center: initialView.center,
          zoom: initialView.zoom,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          maxZoom: 19,
        });
      } catch {
        setFailure("webgl");
        return;
      }
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.getCanvas().setAttribute("aria-label", "Carte");

      map.on("style.load", () => {
        styleLoaded = true;
        installLayers(map!);
        setStyleVersion((v) => v + 1);
        setReady(true);
      });
      map.on("error", (e) => {
        if (styleLoaded) return; // erreurs de tuiles ponctuelles : ignorées
        const msg = String((e as { error?: { message?: string } }).error?.message ?? "");
        console.warn("[carte] style indisponible", msg);
        styleLoaded = true;
        map!.setStyle(fallbackStyle(propsRef.current.theme), { diff: false });
        setFailure("style");
      });
      map.on("click", (e: MapMouseEvent) => {
        const p = propsRef.current;
        const hits = map!.getLayer("routes-hit") ? map!.queryRenderedFeatures(e.point, { layers: ["routes-hit"] }) : [];
        const hitId = hits[0]?.properties?.id as string | undefined;
        if (hitId && p.onRouteClick && (p.routes?.length ?? 0) > 1) p.onRouteClick(hitId);
        else p.onMapClick?.([e.lngLat.lng, e.lngLat.lat]);
      });
      map.on("dragstart", (e) => {
        if ((e as { originalEvent?: Event }).originalEvent) propsRef.current.onUserGesture?.();
      });
      map.on("moveend", () => {
        const c = map!.getCenter();
        propsRef.current.onMoveEnd?.([c.lng, c.lat], map!.getZoom());
      });
      map.on("mouseenter", "routes-hit", () => {
        if ((propsRef.current.routes?.length ?? 0) > 1) map!.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "routes-hit", () => {
        map!.getCanvas().style.cursor = "";
      });
    })();
    const current = markers.current;
    return () => {
      cancelled = true;
      current.km.forEach((mk) => mk.remove());
      current.start?.remove();
      current.user?.remove();
      map?.remove();
      mapRef.current = null;
    };
    // La carte n'est créée qu'une fois ; le style est géré dans un effet dédié.
  }, []);

  /* ---------- Changement de fond de carte / thème ---------- */
  const styleName = props.theme === "dark" ? "dark" : "liberty";
  const lastStyle = useRef(styleName);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || failure === "style" || lastStyle.current === styleName) return;
    lastStyle.current = styleName;
    map.setStyle(STYLE_BASE + styleName);
  }, [styleName, ready, failure]);

  /* ---------- Tracés ---------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("routes") as GeoJSONSource | undefined;
    if (!src) return;
    const routes = props.routes ?? [];
    const selected = props.selectedRouteId ?? routes[0]?.id ?? null;
    // Le tracé sélectionné est ajouté en dernier pour être dessiné au-dessus.
    const ordered = [...routes].sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
    src.setData({
      type: "FeatureCollection",
      features: ordered
        .filter((r) => r.coordinates.length >= 2)
        .map((r) => ({
          type: "Feature",
          properties: { id: r.id, selected: r.id === selected },
          geometry: { type: "LineString", coordinates: r.coordinates.map((c) => [c[0], c[1]]) },
        })),
    });

    // Bornes kilométriques du tracé sélectionné.
    markers.current.km.forEach((mk) => mk.remove());
    markers.current.km = [];
    const lib = libRef.current;
    const sel = routes.find((r) => r.id === selected);
    if (props.showKmMarkers && sel && lib) {
      const cum = cumulativeDistances(sel.coordinates);
      const total = cum[cum.length - 1] ?? 0;
      const every = total > 25_000 ? 5000 : total > 12_000 ? 2000 : 1000;
      for (let d = every; d < total - 150; d += every) {
        const node = el(
          "pointer-events-none rounded-full bg-tx px-1.5 py-0.5 text-[10px] font-bold leading-none text-bg shadow tabular",
          String(d / 1000),
        );
        node.setAttribute("aria-hidden", "true");
        markers.current.km.push(new lib.Marker({ element: node }).setLngLat(pointAtDistance(sel.coordinates, cum, d)).addTo(map));
      }
    }

    // Traversées de route du tracé sélectionné.
    markers.current.crossings.forEach((mk) => mk.remove());
    markers.current.crossings = [];
    if (sel?.crossings && lib) {
      for (const c of sel.crossings) {
        const node = el("pointer-events-none size-3 rounded-full border-2 border-white bg-rd shadow");
        node.setAttribute("aria-hidden", "true");
        markers.current.crossings.push(new lib.Marker({ element: node }).setLngLat(c).addTo(map));
      }
    }
  }, [props.routes, props.selectedRouteId, props.showKmMarkers, ready, styleVersion]);

  /* ---------- Départ ---------- */
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || !ready) return;
    markers.current.start?.remove();
    markers.current.start = null;
    if (!props.start) return;
    const node = el(
      "flex size-9 items-center justify-center rounded-full border-[3px] border-bg bg-y shadow-lg",
      `<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="color:var(--on)"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>`,
    );
    node.setAttribute("aria-label", "Départ");
    node.setAttribute("role", "img");
    markers.current.start = new lib.Marker({ element: node }).setLngLat(props.start).addTo(map);
  }, [props.start, ready]);

  /* ---------- Position de l'utilisateur ---------- */
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || !ready) return;
    const src = map.getSource("user-accuracy") as GeoJSONSource | undefined;
    if (!props.user) {
      markers.current.user?.remove();
      markers.current.user = null;
      src?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    src?.setData(circlePolygon(props.user.coord, Math.max(5, props.user.accuracyM)));
    if (!markers.current.user) {
      const node = el(
        "relative size-5 rounded-full border-[3px] border-white bg-[#1a73e8] shadow-lg pointer-events-none",
        `<span class="absolute -inset-2 -z-10 animate-ping rounded-full bg-[#1a73e8]/30"></span>`,
      );
      node.setAttribute("aria-hidden", "true");
      markers.current.user = new lib.Marker({ element: node }).setLngLat(props.user.coord).addTo(map);
    } else markers.current.user.setLngLat(props.user.coord);
  }, [props.user, ready, styleVersion]);

  /* ---------- Marges : zone de carte masquée par l'interface ---------- */
  // La marge est appliquée à la carte elle-même (et non à chaque animation) :
  // MapLibre l'additionne sinon à celle de fitBounds, ce qui empêche le recadrage.
  const pad = props.padding;
  const padKey = pad ? `${pad.top},${pad.right},${pad.bottom},${pad.left}` : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !pad) return;
    map.setPadding(pad);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- padKey résume `pad`
  }, [padKey, ready]);

  /* ---------- Recadrage ---------- */
  const fitKey = props.fit?.key;
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    const fit = propsRef.current.fit;
    if (!map || !lib || !ready || !fit || fit.coords.length === 0) return;
    const currentPad = propsRef.current.padding;
    if (currentPad) map.setPadding(currentPad);
    if (fit.coords.length === 1) {
      map.easeTo({ center: [fit.coords[0]![0], fit.coords[0]![1]], zoom: Math.max(map.getZoom(), 14), duration: 600 });
      return;
    }
    const b = new lib.LngLatBounds();
    fit.coords.forEach((c) => b.extend([c[0], c[1]]));
    map.fitBounds(b, { padding: 24, duration: 700, maxZoom: 16 });
  }, [fitKey, ready]);

  /* ---------- Suivi (guidage) ---------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !props.follow) return;
    // On ne force le zoom que si la carte est trop éloignée : le coureur garde son niveau de zoom.
    map.easeTo({ center: props.follow, zoom: map.getZoom() < 14 ? 16 : map.getZoom(), duration: 500 });
  }, [props.follow, ready]);

  return (
    <div className={cn("overflow-hidden bg-s2", props.className ?? "relative")}>
      {/* h-full/w-full explicites : la feuille MapLibre impose « position: relative » au conteneur. */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {failure && (
        <div role="status" className="absolute inset-x-16 top-[calc(env(safe-area-inset-top)+70px)] z-10 mx-auto max-w-sm rounded-2xl bg-s1 px-3 py-2 text-center text-xs font-medium text-au shadow-card">
          {failure === "style" ? "Fond de carte indisponible : les parcours restent affichés." : "Carte non prise en charge par ce navigateur."}
        </div>
      )}
    </div>
  );
}

/** Ajoute sources et couches (appelé à chaque chargement de style). */
function installLayers(map: MlMap) {
  const casing = cssVar("--route-casing", "#0b0c09");
  const core = cssVar("--y", "#f2609f");
  const muted = cssVar("--route-muted", "#8d9184");
  const empty: FeatureCollection = { type: "FeatureCollection", features: [] };

  if (!map.hasImage("route-arrow")) map.addImage("route-arrow", arrowImage(), { pixelRatio: 2 });
  if (!map.getSource("routes")) map.addSource("routes", { type: "geojson", data: empty });
  if (!map.getSource("user-accuracy")) map.addSource("user-accuracy", { type: "geojson", data: empty });

  const lineLayout = { "line-join": "round", "line-cap": "round" } as const;
  map.addLayer({
    id: "user-accuracy",
    type: "fill",
    source: "user-accuracy",
    paint: { "fill-color": "#1a73e8", "fill-opacity": 0.12 },
  });
  map.addLayer({
    id: "routes-muted",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "selected"], false],
    layout: lineLayout,
    paint: { "line-color": muted, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 16, 5], "line-opacity": 0.75 },
  });
  map.addLayer({
    id: "routes-casing",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "selected"], true],
    layout: lineLayout,
    paint: { "line-color": casing, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 11] },
  });
  map.addLayer({
    id: "routes-selected",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "selected"], true],
    layout: lineLayout,
    paint: { "line-color": core, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 6] },
  });
  map.addLayer({
    id: "routes-arrows",
    type: "symbol",
    source: "routes",
    filter: ["==", ["get", "selected"], true],
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 90,
      "icon-image": "route-arrow",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 1],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  map.addLayer({
    id: "routes-hit",
    type: "line",
    source: "routes",
    layout: lineLayout,
    paint: { "line-color": "#000", "line-width": 22, "line-opacity": 0 },
  });
}
