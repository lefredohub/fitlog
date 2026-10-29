/**
 * Calcul des statistiques d'un parcours à partir de la géométrie réelle.
 *
 * Toutes les valeurs sont dérivées des données renvoyées par le moteur de routage :
 * aucune valeur n'est inventée. Lorsque l'altitude manque, les champs concernés
 * valent `null` et l'interface l'indique.
 */
import { cumulativeDistances } from "@/lib/geo/geo";
import type {
  Maneuver,
  Position,
  RoutedPath,
  RouteStats,
  RouteStep,
  Segment,
  SurfaceKind,
  TerrainBreakdown,
  WayKind,
} from "./types";

/**
 * Seuil d'hystérésis (m) : une variation d'altitude n'est comptée qu'une fois
 * qu'elle dépasse ce seuil. Évite de cumuler le « bruit » du modèle de terrain
 * (les altitudes viennent d'un MNT de ~30 à 90 m de résolution).
 */
export const ELEVATION_HYSTERESIS_M = 2;

/** Fenêtre (m) utilisée pour mesurer la pente maximale. */
export const GRADE_WINDOW_M = 200;

export function computeElevationGain(
  elevations: readonly number[],
  threshold = ELEVATION_HYSTERESIS_M,
): { ascentM: number; descentM: number } {
  let ascent = 0;
  let descent = 0;
  if (elevations.length < 2) return { ascentM: 0, descentM: 0 };
  let ref = elevations[0]!;
  for (let i = 1; i < elevations.length; i++) {
    const e = elevations[i]!;
    const diff = e - ref;
    if (diff >= threshold) {
      ascent += diff;
      ref = e;
    } else if (diff <= -threshold) {
      descent -= diff;
      ref = e;
    }
  }
  return { ascentM: Math.round(ascent), descentM: Math.round(descent) };
}

/** Pente moyenne maximale (en %, valeur absolue) sur une fenêtre glissante. */
export function computeMaxGrade(
  coords: readonly Position[],
  cum: readonly number[],
  windowM = GRADE_WINDOW_M,
): number | null {
  const total = cum[cum.length - 1] ?? 0;
  if (total < windowM || coords.some((c) => c[2] === undefined)) return null;
  let max = 0;
  let j = 0;
  for (let i = 0; i < coords.length; i++) {
    while (j < coords.length - 1 && cum[j]! - cum[i]! < windowM) j++;
    const run = cum[j]! - cum[i]!;
    if (run < windowM * 0.9) break;
    const rise = coords[j]![2]! - coords[i]![2]!;
    const grade = Math.abs(rise / run) * 100;
    if (grade > max) max = grade;
  }
  return Math.round(max * 10) / 10;
}

const emptySurface = (): Record<SurfaceKind, number> => ({ paved: 0, unpaved: 0, unknown: 0 });
const emptyWay = (): Record<WayKind, number> => ({
  road: 0,
  street: 0,
  path: 0,
  track: 0,
  footway: 0,
  cycleway: 0,
  steps: 0,
  other: 0,
  unknown: 0,
});

function accumulate<T extends string>(
  segments: readonly Segment<T>[],
  cum: readonly number[],
  target: Record<T, number>,
  unknownKey: T,
) {
  let covered = 0;
  const last = cum.length - 1;
  for (const s of segments) {
    const from = Math.max(0, Math.min(last, s.from));
    const to = Math.max(0, Math.min(last, s.to));
    const d = cum[to]! - cum[from]!;
    if (d > 0) {
      target[s.value] += d;
      covered += d;
    }
  }
  // Toute portion non couverte par les données est comptée comme inconnue.
  const total = cum[last] ?? 0;
  if (total - covered > 1) target[unknownKey] += total - covered;
}

export function computeTerrain(path: RoutedPath, cum: readonly number[]): TerrainBreakdown {
  const surface = emptySurface();
  const way = emptyWay();
  accumulate(path.surfaces, cum, surface, "unknown");
  accumulate(path.waytypes, cum, way, "unknown");
  return { surface, way };
}

const TURN_WEIGHT: Partial<Record<Maneuver, number>> = {
  left: 1,
  right: 1,
  "sharp-left": 1,
  "sharp-right": 1,
  uturn: 1,
  roundabout: 1,
  "slight-left": 0.5,
  "slight-right": 0.5,
  "keep-left": 0.5,
  "keep-right": 0.5,
};

/** Nombre pondéré de changements de direction (les légers comptent pour moitié). */
export function countTurns(steps: readonly RouteStep[]): number {
  return Math.round(steps.reduce((sum, s) => sum + (TURN_WEIGHT[s.maneuver] ?? 0), 0));
}

export function computeRouteStats(path: RoutedPath): RouteStats {
  const coords = path.coordinates;
  const cum = cumulativeDistances(coords);
  const distanceM = Math.round(cum[cum.length - 1] ?? 0);
  const elevations = path.hasElevation ? coords.map((c) => c[2]).filter((e): e is number => e !== undefined) : [];
  const hasEle = path.hasElevation && elevations.length === coords.length && coords.length > 1;

  let ascentM: number | null = null;
  let descentM: number | null = null;
  let minEleM: number | null = null;
  let maxEleM: number | null = null;
  let highPoint: RouteStats["highPoint"] = null;

  if (hasEle) {
    ({ ascentM, descentM } = computeElevationGain(elevations));
    let hi = 0;
    let lo = 0;
    for (let i = 1; i < elevations.length; i++) {
      if (elevations[i]! > elevations[hi]!) hi = i;
      if (elevations[i]! < elevations[lo]!) lo = i;
    }
    minEleM = Math.round(elevations[lo]!);
    maxEleM = Math.round(elevations[hi]!);
    highPoint = {
      distanceM: Math.round(cum[hi]!),
      eleM: maxEleM,
      coord: [coords[hi]![0], coords[hi]![1]],
    };
  }

  return {
    distanceM,
    ascentM,
    descentM,
    minEleM,
    maxEleM,
    highPoint,
    maxGradePct: hasEle ? computeMaxGrade(coords, cum) : null,
    terrain: computeTerrain(path, cum),
    turnCount: countTurns(path.steps),
  };
}

/** Part (0 à 1) de la distance dont le revêtement est connu. */
export function knownSurfaceShare(stats: RouteStats): number {
  const { paved, unpaved, unknown } = stats.terrain.surface;
  const total = paved + unpaved + unknown;
  return total > 0 ? (paved + unpaved) / total : 0;
}

/** Part (0 à 1) de la distance non revêtue (chemins, terre, gravier…). */
export function unpavedShare(stats: RouteStats): number {
  const { paved, unpaved, unknown } = stats.terrain.surface;
  const total = paved + unpaved + unknown;
  return total > 0 ? unpaved / total : 0;
}

/** Dénivelé positif par kilomètre (m/km), ou null si inconnu. */
export function climbRate(stats: RouteStats): number | null {
  if (stats.ascentM === null || stats.distanceM <= 0) return null;
  return stats.ascentM / (stats.distanceM / 1000);
}
