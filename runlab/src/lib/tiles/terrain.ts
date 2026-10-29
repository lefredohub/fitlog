/**
 * Altitude à partir des tuiles de terrain publiques « Terrarium » (jeu de données ouvert
 * Mapzen / Tilezen hébergé sur AWS : gratuit, sans clé ni quota), téléchargées par l'appareil. Sources : SRTM, EU-DEM,
 * NED… ; résolution d'environ 13 m au niveau de zoom 13 sous nos latitudes.
 */
import type { LngLat } from "@/lib/route/types";
import { decodePng } from "./png";
import { sources } from "./sources";
import { withTimeout } from "./tiles";

const ZOOM = 13;
const SIZE = 256;
const MAX_TILES = 64;
const CACHE_SIZE = 150;

/** Altitude (m) en un point, ou null hors des tuiles chargées. */
export type ElevationSampler = (p: LngLat) => number | null;

// Promesses en cache : deux calculs simultanés ne téléchargent pas deux fois la même tuile.
const cache = new Map<string, Promise<Float32Array>>();

/** Tuile décodée en altitudes (m) : (R × 256 + V + B / 256) − 32768. */
export async function terrariumHeights(png: Uint8Array): Promise<Float32Array> {
  const img = await decodePng(png);
  if (img.width !== SIZE || img.height !== SIZE) throw new Error("Tuile de terrain inattendue");
  const out = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < out.length; i++) {
    const o = i * img.channels;
    out[i] = img.data[o]! * 256 + img.data[o + 1]! + img.data[o + 2]! / 256 - 32768;
  }
  return out;
}

function tileXY(p: LngLat) {
  const n = 2 ** ZOOM;
  const r = (p[1] * Math.PI) / 180;
  return { x: ((p[0] + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

function loadTile(x: number, y: number): Promise<Float32Array> {
  const key = `${x}/${y}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = sources().terrain.replace("{z}", String(ZOOM)).replace("{x}", String(x)).replace("{y}", String(y));
  const job = fetch(url, { signal: withTimeout(undefined, 15_000) }).then(async (res) => {
    if (!res.ok) throw new Error(`Tuile de terrain ${key} : HTTP ${res.status}`);
    return terrariumHeights(new Uint8Array(await res.arrayBuffer()));
  });
  cache.set(key, job);
  // Un échec n'est pas gardé : la tuile sera redemandée la prochaine fois.
  job.catch(() => cache.delete(key));
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return job;
}

/** Échantillonneur d'altitude couvrant tous les points donnés (interpolation bilinéaire). */
export async function elevationFor(points: readonly LngLat[]): Promise<ElevationSampler> {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    const t = tileXY(p);
    x0 = Math.min(x0, Math.floor(t.x)); x1 = Math.max(x1, Math.floor(t.x));
    y0 = Math.min(y0, Math.floor(t.y)); y1 = Math.max(y1, Math.floor(t.y));
  }
  if (!Number.isFinite(x0)) return () => null;
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) throw new Error("Zone trop grande pour l'altitude");
  const tiles = new Map<string, Float32Array>();
  const jobs: Promise<void>[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) jobs.push(loadTile(x, y).then((h) => void tiles.set(`${x}/${y}`, h)));
  }
  await Promise.all(jobs);
  const at = (px: number, py: number): number | null => {
    const tx = Math.floor(px / SIZE);
    const ty = Math.floor(py / SIZE);
    const h = tiles.get(`${tx}/${ty}`);
    if (!h) return null;
    return h[(py - ty * SIZE) * SIZE + (px - tx * SIZE)]!;
  };
  return (p) => {
    const t = tileXY(p);
    // Pixels de l'ensemble des tuiles ; centre du pixel en (i + 0,5).
    const fx = t.x * SIZE - 0.5;
    const fy = t.y * SIZE - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const u = fx - ix;
    const v = fy - iy;
    const h00 = at(ix, iy), h10 = at(ix + 1, iy), h01 = at(ix, iy + 1), h11 = at(ix + 1, iy + 1);
    if (h00 === null || h10 === null || h01 === null || h11 === null) return h00 ?? h10 ?? h01 ?? h11;
    return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
  };
}
