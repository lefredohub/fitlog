/**
 * Données OpenStreetMap des tuiles vectorielles (schéma OpenMapTiles) : réseau des chemins
 * (zoom 14), lieux autour desquels tourner, et noms pour la recherche d'adresse.
 *
 * Les mêmes tuiles que celles de la carte, téléchargées directement par l'appareil :
 * gratuites, sans clé ni quota. Un cache mémoire évite de retélécharger un quartier.
 */
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import type { AreaKind, NetworkArea, NetworkData, NetworkLabel, NetworkLine } from "@/lib/network/graph";
import type { LngLat } from "@/lib/route/types";
import type { SearchEntry } from "@/lib/search/search";
import { sources } from "./sources";

const ZOOM = 14;
/** Zoom des tuiles où l'on cherche les villes et villages (≈ 40 km de côté). */
const PLACE_ZOOM = 10;
/** Une boucle de 30 km couvre une centaine de tuiles autour du départ. */
const MAX_TILES = 160;
const CONCURRENCY = 6;
const CACHE_SIZE = 250;
const NO_GRADE = new Set(["rail", "transit", "ferry", "aerialway"]);
const WATER = new Set(["lake", "pond", "reservoir", "basin"]);

export class TilesError extends Error {}

/** Contenu utile d'une tuile. */
export interface TileData extends NetworkData {
  /** Rues, lieux, points d'intérêt et adresses (recherche). */
  entries: SearchEntry[];
}

let template: { source: string; url: string; at: number } | null = null;
const tileCache = new Map<string, Promise<TileData>>();

async function tileTemplate(): Promise<string> {
  const source = sources().tiles;
  if (template && template.source === source && Date.now() - template.at < 3_600_000) return template.url;
  const res = await fetch(source, { signal: AbortSignal.timeout(10_000) }).catch((e) => {
    throw new TilesError(String(e));
  });
  if (!res.ok) throw new TilesError(`TileJSON HTTP ${res.status}`);
  const json = (await res.json()) as { tiles?: string[] };
  const url = json.tiles?.[0];
  if (!url) throw new TilesError("TileJSON sans adresse de tuiles");
  template = { source, url, at: Date.now() };
  return url;
}

function lon2x(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function lat2y(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

type TilePoint = { x: number; y: number };
type Layer = VectorTile["layers"][string];
/** Écart maximal entre une voie et la ligne qui porte son nom (unités de tuile, ≈ 0,4 m à z14). */
const NAME_SNAP = 10;
/** Écart maximal entre une adresse et la rue qui lui donne son nom (≈ 40 m à z14). */
const ADDRESS_SNAP = 100;
const NAME_CELL = 64;

type NamedSegment = { a: TilePoint; b: TilePoint; cls: string; name: string };

function segmentDistance(p: TilePoint, s: NamedSegment) {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - s.a.x - dx * t, p.y - s.a.y - dy * t);
}

const nameOfFeature = (props: Record<string, unknown>) => {
  const name = props["name:fr"] ?? props.name;
  return name === undefined || name === "" ? undefined : String(name);
};

/**
 * Index des noms de voies (couche « transportation_name », dont les lignes sont fusionnées
 * d'une voie à l'autre) : retrouve le nom d'une voie, ou de la rue d'une adresse, par sa position.
 */
function nameIndex(layer: Layer | undefined) {
  const cells = new Map<string, NamedSegment[]>();
  const pad = ADDRESS_SNAP;
  if (layer) {
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const name = nameOfFeature(f.properties);
      if (f.type !== 2 || !name) continue;
      const cls = String(f.properties.class ?? "");
      for (const ring of f.loadGeometry()) {
        for (let k = 0; k + 1 < ring.length; k++) {
          const a = ring[k]!;
          const b = ring[k + 1]!;
          const seg = { a, b, cls, name };
          for (let gx = Math.floor((Math.min(a.x, b.x) - pad) / NAME_CELL); gx <= Math.floor((Math.max(a.x, b.x) + pad) / NAME_CELL); gx++) {
            for (let gy = Math.floor((Math.min(a.y, b.y) - pad) / NAME_CELL); gy <= Math.floor((Math.max(a.y, b.y) + pad) / NAME_CELL); gy++) {
              const key = `${gx}:${gy}`;
              (cells.get(key) ?? cells.set(key, []).get(key)!).push(seg);
            }
          }
        }
      }
    }
  }
  const nearest = (p: TilePoint, maxD: number, cls?: string) => {
    let best: { d: number; name: string } | null = null;
    for (const seg of cells.get(`${Math.floor(p.x / NAME_CELL)}:${Math.floor(p.y / NAME_CELL)}`) ?? []) {
      if (cls !== undefined && seg.cls !== cls) continue;
      const d = segmentDistance(p, seg);
      if (d <= maxD && (!best || d < best.d)) best = { d, name: seg.name };
    }
    return best?.name;
  };
  return {
    /** Nom porté par une ligne : vote de quelques points pris le long de la ligne. */
    line(ring: TilePoint[], cls: string): string | undefined {
      if (cells.size === 0) return undefined;
      const votes = new Map<string, number>();
      const samples = Math.min(5, ring.length - 1);
      for (let s = 0; s < samples; s++) {
        const k = Math.floor(((s + 0.5) * (ring.length - 1)) / samples);
        const name = nearest({ x: (ring[k]!.x + ring[k + 1]!.x) / 2, y: (ring[k]!.y + ring[k + 1]!.y) / 2 }, NAME_SNAP, cls);
        if (name) votes.set(name, (votes.get(name) ?? 0) + 1);
      }
      let name: string | undefined;
      let top = 0;
      for (const [n, v] of votes) if (v > top) [name, top] = [n, v];
      // Au moins la moitié des points : une voie qui croise une rue nommée n'en prend pas le nom.
      return top * 2 >= samples ? name : undefined;
    },
    /** Rue la plus proche d'une adresse. */
    street(p: TilePoint): string | undefined {
      return nearest(p, ADDRESS_SNAP);
    },
  };
}

function projector(x: number, y: number, z: number) {
  const n = 2 ** z;
  return (p: TilePoint, extent: number): LngLat => {
    const lon = ((x + p.x / extent) / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + p.y / extent)) / n))) * 180) / Math.PI;
    return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
  };
}

/** Lignes de la couche « transportation » d'une tuile (coordonnées géographiques), avec leur nom. */
export function linesFromTile(buffer: ArrayBuffer | Uint8Array, x: number, y: number, z: number): NetworkLine[] {
  return parseTile(buffer, x, y, z).lines;
}

/** Lieux autour desquels on peut tourner : (couche, filtre de classe, nature). */
const AREA_SOURCES: [string, (cls: string, sub: string) => boolean, AreaKind][] = [
  ["water", (cls) => WATER.has(cls), "water"],
  ["landcover", (cls, sub) => cls === "grass" && sub === "park", "park"],
  ["landcover", (cls) => cls === "wood", "wood"],
];

/** Points d'intérêt utiles comme départ (les commerces et services sont trop nombreux). */
const POI_CLASSES = new Set([
  "park", "garden", "stadium", "sports_centre", "pitch", "swimming", "school", "college", "town_hall", "railway",
  "bus", "attraction", "castle", "monument", "place_of_worship", "playground", "beach", "harbor", "museum", "library",
  "hospital", "campsite", "lighthouse", "viewpoint", "zoo", "cemetery", "theatre", "cinema", "golf",
]);

/** Contenu d'une tuile au zoom 14 : réseau, lieux, noms. */
export function parseTile(buffer: ArrayBuffer | Uint8Array, x: number, y: number, z: number): TileData {
  const tile = new VectorTile(new PbfReader(buffer));
  const names = nameIndex(tile.layers.transportation_name);
  const toLngLat = projector(x, y, z);
  const props = (f: { properties: Record<string, unknown> }) => (k: string) =>
    f.properties[k] === undefined ? undefined : String(f.properties[k]);

  // Réseau.
  const lines: NetworkLine[] = [];
  const layer = tile.layers.transportation;
  for (let i = 0; layer && i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 2) continue; // lignes uniquement
    const cls = String(f.properties.class ?? "");
    if (NO_GRADE.has(cls)) continue;
    const str = props(f);
    for (const ring of f.loadGeometry()) {
      if (ring.length < 2) continue;
      const line: NetworkLine = {
        coords: ring.map((p) => toLngLat(p, layer.extent)),
        cls,
        subclass: str("subclass"),
        brunnel: str("brunnel"),
        surface: str("surface"),
        access: str("access"),
        foot: str("foot"),
        service: str("service"),
      };
      const name = names.line(ring, cls);
      if (name) line.name = name;
      lines.push(line);
    }
  }

  // Lieux dont on peut faire le tour.
  const areas: NetworkArea[] = [];
  for (const [layerName, accept, kind] of AREA_SOURCES) {
    const l = tile.layers[layerName];
    for (let i = 0; l && i < l.length; i++) {
      const f = l.feature(i);
      if (f.type !== 3 || !accept(String(f.properties.class ?? ""), String(f.properties.subclass ?? ""))) continue;
      const outer = f.loadGeometry()[0];
      if (!outer || outer.length < 4) continue;
      const id = f.id ?? f.properties.id ?? `${x}/${y}/${i}`;
      areas.push({ kind, key: `${layerName}:${String(id)}`, points: outer.map((p) => toLngLat(p, l.extent)) });
    }
  }

  // Noms : étiquettes des plans d'eau, parcs et jardins (circuits), et recherche d'adresse.
  const labels: NetworkLabel[] = [];
  const entries: SearchEntry[] = [];
  const water = tile.layers.water_name;
  for (let i = 0; water && i < water.length; i++) {
    const f = water.feature(i);
    const name = nameOfFeature(f.properties);
    const p = f.loadGeometry()[0]?.[0];
    if (!name || !p) continue;
    const coord = toLngLat(p, water.extent);
    if (f.type === 1 && WATER.has(String(f.properties.class ?? ""))) labels.push({ name, kind: "water", coord });
    entries.push({ name, kind: "water", coord });
  }
  const poi = tile.layers.poi;
  for (let i = 0; poi && i < poi.length; i++) {
    const f = poi.feature(i);
    const name = nameOfFeature(f.properties);
    const cls = String(f.properties.class ?? "");
    const p = f.loadGeometry()[0]?.[0];
    if (!name || !p || f.type !== 1) continue;
    const coord = toLngLat(p, poi.extent);
    if (cls === "park" || cls === "garden") labels.push({ name, kind: "park", coord });
    if (POI_CLASSES.has(cls)) entries.push({ name, kind: "poi", coord });
  }
  const place = tile.layers.place;
  for (let i = 0; place && i < place.length; i++) {
    const f = place.feature(i);
    const name = nameOfFeature(f.properties);
    const p = f.loadGeometry()[0]?.[0];
    if (name && p && f.type === 1) entries.push({ name, kind: "place", coord: toLngLat(p, place.extent) });
  }
  // Rues : un point par tronçon nommé (le plus proche sera retenu à la recherche).
  const tn = tile.layers.transportation_name;
  for (let i = 0; tn && i < tn.length; i++) {
    const f = tn.feature(i);
    const name = nameOfFeature(f.properties);
    if (!name || f.type !== 2) continue;
    for (const ring of f.loadGeometry()) {
      const mid = ring[Math.floor(ring.length / 2)];
      if (mid) entries.push({ name, kind: "street", coord: toLngLat(mid, tn.extent) });
    }
  }
  // Adresses : numéro + rue la plus proche.
  const hn = tile.layers.housenumber;
  for (let i = 0; hn && i < hn.length; i++) {
    const f = hn.feature(i);
    const number = f.properties.housenumber;
    const p = f.loadGeometry()[0]?.[0];
    if (number === undefined || !p) continue;
    const street = names.street(p);
    if (street) entries.push({ name: `${String(number)} ${street}`, kind: "address", coord: toLngLat(p, hn.extent) });
  }
  return { lines, areas, labels, entries };
}

/** Villes, villages et quartiers d'une tuile de faible zoom. */
export function placesFromTile(buffer: ArrayBuffer | Uint8Array, x: number, y: number, z: number): SearchEntry[] {
  const tile = new VectorTile(new PbfReader(buffer));
  const toLngLat = projector(x, y, z);
  const place = tile.layers.place;
  const out: SearchEntry[] = [];
  for (let i = 0; place && i < place.length; i++) {
    const f = place.feature(i);
    const name = nameOfFeature(f.properties);
    const p = f.loadGeometry()[0]?.[0];
    if (name && p && f.type === 1) out.push({ name, kind: "place", coord: toLngLat(p, place.extent) });
  }
  return out;
}

export interface Bbox {
  w: number;
  s: number;
  e: number;
  n: number;
}

/** Emprise géographique d'une tuile. */
function tileBbox(x: number, y: number, z: number): Bbox {
  const n = 2 ** z;
  const lat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return { w: (x / n) * 360 - 180, e: ((x + 1) / n) * 360 - 180, n: lat(y), s: lat(y + 1) };
}

/** Tuiles touchant le disque de rayon `radiusM` autour d'un point. */
export function tilesAround(center: LngLat, radiusM: number, z = ZOOM): [number, number][] {
  const kx = 111_320 * Math.cos((center[1] * Math.PI) / 180);
  const ky = 111_320;
  const dLon = radiusM / kx;
  const dLat = radiusM / ky;
  const keys: [number, number][] = [];
  for (let x = lon2x(center[0] - dLon, z); x <= lon2x(center[0] + dLon, z); x++) {
    for (let y = lat2y(center[1] + dLat, z); y <= lat2y(center[1] - dLat, z); y++) {
      const t = tileBbox(x, y, z);
      // Point de la tuile le plus proche du centre.
      const px = Math.max(t.w, Math.min(t.e, center[0]));
      const py = Math.max(t.s, Math.min(t.n, center[1]));
      if (Math.hypot((px - center[0]) * kx, (py - center[1]) * ky) <= radiusM) keys.push([x, y]);
    }
  }
  return keys;
}

/** Signal d'abandon avec délai maximal (AbortSignal.any manque aux anciens iPhone). */
export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : timeout;
}

async function download(url: string, z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8Array | null> {
  let res: Response;
  try {
    res = await fetch(url.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)), { signal: withTimeout(signal, 15_000) });
  } catch (err) {
    throw new TilesError(String(err));
  }
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new TilesError(`Tuile ${z}/${x}/${y} : HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const EMPTY: TileData = { lines: [], areas: [], labels: [], entries: [] };

function loadTile(url: string, x: number, y: number, signal?: AbortSignal): Promise<TileData> {
  const key = `${ZOOM}/${x}/${y}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const job = download(url, ZOOM, x, y, signal).then((buf) => (buf ? parseTile(buf, x, y, ZOOM) : EMPTY));
  tileCache.set(key, job);
  // Un échec n'est pas gardé : la tuile sera redemandée la prochaine fois.
  job.catch(() => tileCache.delete(key));
  if (tileCache.size > CACHE_SIZE) tileCache.delete(tileCache.keys().next().value!);
  return job;
}

async function fetchTiles(keys: [number, number][], signal?: AbortSignal): Promise<TileData> {
  if (keys.length > MAX_TILES) throw new TilesError(`Zone trop grande (${keys.length} tuiles)`);
  const url = await tileTemplate();
  const results: TileData[] = new Array(keys.length);
  let next = 0;
  const worker = async () => {
    while (next < keys.length) {
      const i = next++;
      results[i] = await loadTile(url, keys[i]![0], keys[i]![1], signal);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length) }, worker));
  return {
    lines: results.flatMap((r) => r.lines),
    areas: results.flatMap((r) => r.areas),
    labels: results.flatMap((r) => r.labels ?? []),
    entries: results.flatMap((r) => r.entries),
  };
}

/** Réseau, lieux et noms autour d'un point, dans un rayon donné (m). */
export function fetchNetwork(center: LngLat, radiusM: number, signal?: AbortSignal): Promise<TileData> {
  return fetchTiles(tilesAround(center, radiusM), signal);
}

const placeCache = new Map<string, Promise<SearchEntry[]>>();

/** Villes et villages à une cinquantaine de kilomètres autour d'un point. */
export async function fetchPlaces(center: LngLat, signal?: AbortSignal): Promise<SearchEntry[]> {
  const url = await tileTemplate();
  const cx = lon2x(center[0], PLACE_ZOOM);
  const cy = lat2y(center[1], PLACE_ZOOM);
  const jobs: Promise<SearchEntry[]>[] = [];
  for (let x = cx - 1; x <= cx + 1; x++) {
    for (let y = cy - 1; y <= cy + 1; y++) {
      const key = `${x}/${y}`;
      let job = placeCache.get(key);
      if (!job) {
        job = download(url, PLACE_ZOOM, x, y, signal).then((buf) => (buf ? placesFromTile(buf, x, y, PLACE_ZOOM) : []));
        placeCache.set(key, job);
        job.catch(() => placeCache.delete(key));
      }
      jobs.push(job);
    }
  }
  return (await Promise.all(jobs)).flat();
}
