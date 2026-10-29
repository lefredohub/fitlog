/**
 * Fonctions géométriques de base (sphère terrestre, coordonnées [lng, lat]).
 * Précision largement suffisante à l'échelle d'un parcours de course à pied.
 */
import type { LngLat, Position } from "@/lib/route/types";

export const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Distance orthodromique entre deux points, en mètres. */
export function haversine(a: Position | LngLat, b: Position | LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point situé à `distanceM` de `origin` dans la direction `bearingDeg` (0 = nord). */
export function destination(origin: LngLat, distanceM: number, bearingDeg: number): LngLat {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(origin[1]);
  const λ1 = toRad(origin[0]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [((toDeg(λ2) + 540) % 360) - 180, toDeg(φ2)];
}

/** Distances cumulées depuis le premier point (même longueur que `coords`). */
export function cumulativeDistances(coords: readonly (Position | LngLat)[]): number[] {
  const out = new Array<number>(coords.length);
  let total = 0;
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) total += haversine(coords[i - 1]!, coords[i]!);
    out[i] = total;
  }
  return out;
}

export function pathLength(coords: readonly (Position | LngLat)[]): number {
  const cum = cumulativeDistances(coords);
  return cum.length ? cum[cum.length - 1]! : 0;
}

/** Interpole le point situé à `distanceM` le long du tracé. */
export function pointAtDistance(coords: readonly Position[], cum: readonly number[], distanceM: number): LngLat {
  if (coords.length === 0) throw new Error("Tracé vide");
  if (distanceM <= 0) return [coords[0]![0], coords[0]![1]];
  const last = coords.length - 1;
  if (distanceM >= cum[last]!) return [coords[last]![0], coords[last]![1]];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= distanceM) lo = mid;
    else hi = mid;
  }
  const span = cum[hi]! - cum[lo]!;
  const t = span > 0 ? (distanceM - cum[lo]!) / span : 0;
  const a = coords[lo]!;
  const b = coords[hi]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Projection locale équirectangulaire (en mètres) autour d'une latitude de référence.
 * Suffisante pour des calculs de proximité sur quelques dizaines de kilomètres.
 */
function projector(refLat: number) {
  const kx = toRad(1) * EARTH_RADIUS_M * Math.cos(toRad(refLat));
  const ky = toRad(1) * EARTH_RADIUS_M;
  return (p: Position | LngLat): [number, number] => [p[0] * kx, p[1] * ky];
}

export interface Projection {
  /** Distance (m) entre le point et le tracé. */
  distanceToPathM: number;
  /** Distance (m) le long du tracé du point projeté. */
  alongM: number;
  /** Indice du segment [index, index + 1] retenu. */
  segmentIndex: number;
}

/**
 * Projette un point sur le tracé. Si `window` est fourni, seuls les segments dont
 * la distance cumulée est comprise dans [min, max] sont considérés (utile pour
 * suivre la progression sur un aller-retour où les deux sens se superposent).
 */
export function projectOnPath(
  point: LngLat,
  coords: readonly Position[],
  cum: readonly number[],
  window?: { minM: number; maxM: number },
  /**
   * À distance égale, préfère les projections situées après cette position
   * (pénalité de 0,5 m par mètre de recul). Indispensable au demi-tour d'un aller-retour.
   */
  preferForwardFromM?: number,
): Projection | null {
  if (coords.length < 2) return null;
  const proj = projector(point[1]);
  const [px, py] = proj(point);
  let best: Projection | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    if (window && (cum[i + 1]! < window.minM || cum[i]! > window.maxM)) continue;
    const [ax, ay] = proj(coords[i]!);
    const [bx, by] = proj(coords[i + 1]!);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const qx = ax + dx * t;
    const qy = ay + dy * t;
    const d = Math.hypot(px - qx, py - qy);
    const alongM = cum[i]! + (cum[i + 1]! - cum[i]!) * t;
    const score = preferForwardFromM === undefined ? d : d + Math.max(0, preferForwardFromM - alongM) * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = { distanceToPathM: d, alongM, segmentIndex: i };
    }
  }
  return best;
}

/**
 * Part (0 à 1) du tracé A située à moins de `toleranceM` du tracé B.
 * Sert à écarter les propositions quasiment identiques.
 */
export function overlapRatio(a: readonly Position[], b: readonly Position[], toleranceM = 30): number {
  if (a.length === 0 || b.length === 0) return 0;
  const refLat = a[0]![1];
  const proj = projector(refLat);
  const cell = toleranceM;
  const grid = new Set<string>();
  const cumB = cumulativeDistances(b);
  // Échantillonne B tous les ~toleranceM/2 et indexe dans une grille.
  const totalB = cumB[cumB.length - 1]!;
  const stepB = toleranceM / 2;
  for (let d = 0; d <= totalB; d += stepB) {
    const [x, y] = proj(pointAtDistance(b, cumB, d));
    grid.add(`${Math.floor(x / cell)}:${Math.floor(y / cell)}`);
  }
  const cumA = cumulativeDistances(a);
  const totalA = cumA[cumA.length - 1]!;
  if (totalA === 0) return 0;
  const stepA = 25;
  let hits = 0;
  let samples = 0;
  for (let d = 0; d <= totalA; d += stepA) {
    samples++;
    const [x, y] = proj(pointAtDistance(a, cumA, d));
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let found = false;
    for (let ix = -1; ix <= 1 && !found; ix++) {
      for (let iy = -1; iy <= 1 && !found; iy++) {
        if (grid.has(`${cx + ix}:${cy + iy}`)) found = true;
      }
    }
    if (found) hits++;
  }
  return hits / samples;
}

