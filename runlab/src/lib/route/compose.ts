/**
 * Composition de tracés réels : couper un itinéraire à une distance précise,
 * en enchaîner deux, ou construire le retour d'un aller-retour par le même chemin.
 *
 * C'est ce qui permet de garantir la distance : le moteur de routage ne sait pas
 * produire une boucle « exactement » de 10 km, mais un tracé réel peut être coupé
 * au mètre près puis complété par un vrai itinéraire de retour.
 * Les consignes de guidage aux jonctions sont recalculées à partir de la géométrie.
 */
import { cumulativeDistances, haversine, pointAtDistance } from "@/lib/geo/geo";
import { bearing } from "./interruptions";
import type { Maneuver, Position, RoutedPath, RouteStep, Segment } from "./types";

/** Distance de part et d'autre d'un point pour mesurer une direction stable (m). */
const BEARING_SPAN_M = 15;

/** Type de manœuvre selon l'écart entre direction d'arrivée et de départ (degrés). */
export function maneuverFromTurn(inBearing: number, outBearing: number): Maneuver {
  const d = ((outBearing - inBearing + 540) % 360) - 180; // ]-180, 180], positif = à droite
  const a = Math.abs(d);
  if (a < 25) return "straight";
  if (a > 165) return "uturn";
  const side = d > 0 ? "right" : "left";
  if (a < 60) return side === "right" ? "slight-right" : "slight-left";
  if (a > 135) return side === "right" ? "sharp-right" : "sharp-left";
  return side;
}

const TURN_TEXT: Partial<Record<Maneuver, string>> = {
  left: "Tournez à gauche",
  right: "Tournez à droite",
  "slight-left": "Tournez légèrement à gauche",
  "slight-right": "Tournez légèrement à droite",
  "sharp-left": "Tournez franchement à gauche",
  "sharp-right": "Tournez franchement à droite",
  "keep-left": "Restez à gauche",
  "keep-right": "Restez à droite",
  uturn: "Faites demi-tour",
  straight: "Continuez tout droit",
};

export function turnInstruction(maneuver: Maneuver, name: string): string {
  const base = TURN_TEXT[maneuver] ?? "Continuez";
  return name ? `${base} sur ${name}` : base;
}

/** Direction d'arrivée et de départ autour du point d'indice `index`. */
function bearingsAt(coords: readonly Position[], cum: readonly number[], index: number) {
  const here = coords[index]!;
  const at = cum[index]!;
  const total = cum[cum.length - 1]!;
  const before = pointAtDistance(coords, cum, Math.max(0, at - BEARING_SPAN_M));
  const after = pointAtDistance(coords, cum, Math.min(total, at + BEARING_SPAN_M));
  return { inBearing: bearing(before, here), outBearing: bearing(here, after) };
}

export function withDistances(steps: RouteStep[], cum: readonly number[]): RouteStep[] {
  const last = cum.length - 1;
  return steps.map((s) => {
    const from = Math.min(s.fromIndex, last);
    const to = Math.min(Math.max(s.toIndex, from), last);
    return { ...s, fromIndex: from, toIndex: to, distanceM: cum[to]! - cum[from]! };
  });
}

function clipSegments<T>(segments: readonly Segment<T>[], lastIndex: number): Segment<T>[] {
  return segments.filter((s) => s.from < lastIndex).map((s) => ({ ...s, to: Math.min(s.to, lastIndex) }));
}

/** Tracé coupé à `toM` mètres du départ (point final interpolé, altitude comprise). */
export function slicePath(path: RoutedPath, toM: number): RoutedPath {
  const coords = path.coordinates;
  const cum = cumulativeDistances(coords);
  const total = cum[cum.length - 1] ?? 0;
  if (toM >= total) return path;
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1]! <= toM) i++;
  const a = coords[i]!;
  const b = coords[i + 1]!;
  const span = cum[i + 1]! - cum[i]!;
  const t = span > 0 ? (toM - cum[i]!) / span : 0;
  const end: Position = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (path.hasElevation && a[2] !== undefined && b[2] !== undefined) end.push(Math.round((a[2] + (b[2] - a[2]) * t) * 10) / 10);
  const sliced = [...coords.slice(0, i + 1), end];
  const lastIndex = sliced.length - 1;
  const steps = path.steps.filter((s) => s.fromIndex < lastIndex && s.maneuver !== "arrive");
  return {
    coordinates: sliced,
    engineDistanceM: toM,
    surfaces: clipSegments(path.surfaces, lastIndex),
    waytypes: clipSegments(path.waytypes, lastIndex),
    steps: withDistances(steps, cumulativeDistances(sliced)),
    hasElevation: path.hasElevation,
  };
}

function shift<T>(segments: readonly Segment<T>[], offset: number): Segment<T>[] {
  return segments.map((s) => ({ ...s, from: s.from + offset, to: s.to + offset }));
}

/**
 * Enchaîne deux tracés (le second part de la fin du premier). La consigne de départ
 * du second devient une vraie consigne de virage à la jonction.
 */
export function concatPaths(a: RoutedPath, b: RoutedPath): RoutedPath {
  const aLast = a.coordinates[a.coordinates.length - 1]!;
  const joinSame = haversine(aLast, b.coordinates[0]!) < 2;
  const offset = joinSame ? a.coordinates.length - 1 : a.coordinates.length;
  const coordinates = [...a.coordinates, ...(joinSame ? b.coordinates.slice(1) : b.coordinates)];
  // Indices de b décalés : son point de départ devient la jonction.
  const mapIndex = (i: number) => offset + i;
  const cum = cumulativeDistances(coordinates);
  const junction = offset;
  const { inBearing, outBearing } = bearingsAt(coordinates, cum, junction);
  const maneuver = maneuverFromTurn(inBearing, outBearing);
  const [bFirst, ...bRest] = b.steps;
  const steps: RouteStep[] = [...a.steps.filter((s) => s.maneuver !== "arrive")];
  if (bFirst && maneuver !== "straight") {
    steps.push({
      instruction: turnInstruction(maneuver, bFirst.name),
      name: bFirst.name,
      maneuver,
      distanceM: 0,
      fromIndex: junction,
      toIndex: mapIndex(bFirst.toIndex),
    });
  }
  for (const s of bRest) steps.push({ ...s, fromIndex: mapIndex(s.fromIndex), toIndex: mapIndex(s.toIndex) });
  return {
    coordinates,
    engineDistanceM: a.engineDistanceM + b.engineDistanceM,
    surfaces: [...a.surfaces, ...shift(b.surfaces, offset)],
    waytypes: [...a.waytypes, ...shift(b.waytypes, offset)],
    steps: withDistances(steps, cum),
    hasElevation: a.hasElevation && b.hasElevation,
  };
}

/**
 * Aller-retour par le même chemin : l'aller, un demi-tour, puis l'aller parcouru à
 * l'envers. Les consignes du retour sont recalculées (un « à gauche » à l'aller
 * devient un « à droite » au retour, sur la rue d'où l'on venait).
 */
export function mirrorReturn(out: RoutedPath): RoutedPath {
  const n = out.coordinates.length;
  const back = [...out.coordinates].reverse().slice(1);
  const coordinates = [...out.coordinates, ...back];
  const last = coordinates.length - 1; // = 2n - 2
  const mirror = (i: number) => last - i;
  const cum = cumulativeDistances(coordinates);

  const outSteps = out.steps.filter((s) => s.maneuver !== "arrive");
  const steps: RouteStep[] = [...outSteps];
  steps.push({ instruction: "Faites demi-tour", name: "", maneuver: "uturn", distanceM: 0, fromIndex: n - 1, toIndex: n - 1 });
  // Virages du retour : aux mêmes intersections que l'aller, parcourues en sens inverse.
  for (let k = outSteps.length - 1; k >= 1; k--) {
    const s = outSteps[k]!;
    if (s.fromIndex <= 0 || s.fromIndex >= n - 1) continue;
    const idx = mirror(s.fromIndex);
    const { inBearing, outBearing } = bearingsAt(coordinates, cum, idx);
    const maneuver = maneuverFromTurn(inBearing, outBearing);
    if (maneuver === "straight") continue;
    const name = outSteps[k - 1]!.name;
    steps.push({ instruction: turnInstruction(maneuver, name), name, maneuver, distanceM: 0, fromIndex: idx, toIndex: idx });
  }
  steps.push({ instruction: "Arrivée", name: "", maneuver: "arrive", distanceM: 0, fromIndex: last, toIndex: last });
  // Chaque consigne court jusqu'à la suivante.
  for (let i = 0; i < steps.length - 1; i++) steps[i]!.toIndex = Math.max(steps[i]!.fromIndex, steps[i + 1]!.fromIndex);

  const mirrorSegments = <T,>(segs: readonly Segment<T>[]) => [
    ...segs,
    ...segs.map((s) => ({ from: mirror(s.to), to: mirror(s.from), value: s.value })).reverse(),
  ];
  return {
    coordinates,
    engineDistanceM: out.engineDistanceM * 2,
    surfaces: mirrorSegments(out.surfaces),
    waytypes: mirrorSegments(out.waytypes),
    steps: withDistances(steps, cum),
    hasElevation: out.hasElevation,
  };
}

/** Tracé débutant à `fromM` mètres du départ (premier point interpolé). */
export function trimStart(path: RoutedPath, fromM: number): RoutedPath {
  const coords = path.coordinates;
  const cum = cumulativeDistances(coords);
  if (fromM <= 0) return path;
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1]! <= fromM) i++;
  const a = coords[i]!;
  const b = coords[i + 1]!;
  const span = cum[i + 1]! - cum[i]!;
  const t = span > 0 ? Math.min(1, (fromM - cum[i]!) / span) : 0;
  const first: Position = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (path.hasElevation && a[2] !== undefined && b[2] !== undefined) first.push(Math.round((a[2] + (b[2] - a[2]) * t) * 10) / 10);
  // Nouvel indice k = ancien indice k + i (le point 0 est sur l'ancien segment i).
  const coordinates = [first, ...coords.slice(i + 1)];
  const last = coordinates.length - 1;
  const active = [...path.steps].reverse().find((s) => s.fromIndex <= i);
  const steps: RouteStep[] = [];
  if (active && active.maneuver !== "arrive") steps.push({ ...active, fromIndex: 0, toIndex: Math.max(0, active.toIndex - i) });
  for (const s of path.steps) if (s.fromIndex > i) steps.push({ ...s, fromIndex: s.fromIndex - i, toIndex: s.toIndex - i });
  const clip = <T,>(segs: readonly Segment<T>[]) =>
    segs.filter((s) => s.to > i).map((s) => ({ ...s, from: Math.max(0, s.from - i), to: Math.min(last, s.to - i) }));
  return {
    coordinates,
    engineDistanceM: Math.max(0, path.engineDistanceM - fromM),
    surfaces: clip(path.surfaces),
    waytypes: clip(path.waytypes),
    steps: withDistances(steps, cumulativeDistances(coordinates)),
    hasElevation: path.hasElevation,
  };
}

/** Écart entre deux directions (0–180°). */
function angleBetween(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Retire les allers-retours en impasse : le tracé s'enfonce dans une rue puis revient
 * par le même chemin (demi-tour). La partie supprimée va du point où l'aller et le
 * retour se séparent jusqu'au fond de l'impasse, et retour. Le départ et l'arrivée
 * ne sont pas touchés.
 */
export function despurPath(path: RoutedPath, edgeM = 30): RoutedPath {
  let current = path;
  for (let guard = 0; guard < 30; guard++) {
    const coords = current.coordinates;
    const cum = cumulativeDistances(coords);
    const total = cum[cum.length - 1] ?? 0;
    const at = (m: number) => pointAtDistance(coords, cum, Math.max(0, Math.min(total, m)));
    let found: { from: number; to: number } | null = null;
    for (let i = 1; i < coords.length - 1 && !found; i++) {
      const m = cum[i]!;
      if (m < edgeM || m > total - edgeM) continue;
      if (angleBetween(bearing(coords[i]!, at(m - 10)), bearing(coords[i]!, at(m + 10))) >= 35) continue;
      // Demi-tour : on élargit tant que l'aller et le retour restent confondus.
      let s = 10;
      while (m - s - 5 > 0 && m + s + 5 < total && haversine(at(m - s - 5), at(m + s + 5)) < 12) s += 5;
      if (s >= 15) found = { from: m - s, to: m + s };
    }
    if (!found) return current;
    current = concatPaths(slicePath(current, found.from), trimStart(current, found.to));
  }
  return current;
}

/**
 * Place une consigne « tour » au point d'indice `junction` (annoncée à la voix) ; si l'on
 * tourne à cet endroit, la direction est ajoutée au texte.
 */
export function markLap(path: RoutedPath, junction: number, text: string, name = ""): RoutedPath {
  const turnHere = path.steps.find((s) => s.fromIndex === junction && s.maneuver !== "arrive");
  const steps = path.steps.filter((s) => s !== turnHere);
  const at = steps.findIndex((s) => s.fromIndex > junction);
  steps.splice(at < 0 ? steps.length : at, 0, {
    instruction: turnHere ? `${text} · ${turnHere.instruction}` : text,
    name: turnHere?.name ?? name,
    maneuver: "lap",
    distanceM: 0,
    fromIndex: junction,
    toIndex: junction,
  });
  for (let i = 0; i < steps.length - 1; i++) steps[i]!.toIndex = Math.max(steps[i]!.fromIndex, steps[i + 1]!.fromIndex);
  return { ...path, steps: withDistances(steps, cumulativeDistances(path.coordinates)) };
}

const TURNS = new Set<Maneuver>(["left", "right", "sharp-left", "sharp-right", "slight-left", "slight-right", "keep-left", "keep-right", "straight", "other"]);
/** Consignes rapprochées de moins de cette distance : un même « crochet » (passage piéton…). */
const JOG_M = 30;

/**
 * Regroupe les rafales de consignes rapprochées : traverser au passage piéton donne
 * souvent « à droite » (2 m), « à gauche » (9 m), « à droite »… Si la rafale ne change
 * pas vraiment de direction, elle disparaît ; sinon, elle devient une seule consigne
 * avec la direction d'ensemble.
 */
export function simplifyJogs(path: RoutedPath): RoutedPath {
  const coords = path.coordinates;
  if (coords.length < 3 || path.steps.length < 3) return path;
  const cum = cumulativeDistances(coords);
  const total = cum[cum.length - 1]!;
  const at = (m: number) => pointAtDistance(coords, cum, Math.max(0, Math.min(total, m)));
  const pos = (s: RouteStep) => cum[Math.min(s.fromIndex, cum.length - 1)]!;
  const out: RouteStep[] = [];
  const steps = path.steps;
  let i = 0;
  while (i < steps.length) {
    const s = steps[i]!;
    if (!TURNS.has(s.maneuver)) {
      out.push(s);
      i++;
      continue;
    }
    let k = i;
    while (k + 1 < steps.length && TURNS.has(steps[k + 1]!.maneuver) && pos(steps[k + 1]!) - pos(steps[k]!) < JOG_M) k++;
    if (k === i) {
      out.push(s);
      i++;
      continue;
    }
    const first = steps[i]!;
    const last = steps[k]!;
    const a = pos(first);
    const b = pos(last);
    const inB = bearing(at(a - 15), at(a));
    const outB = bearing(at(b), at(b + 15));
    const maneuver = maneuverFromTurn(inB, outB);
    const prevName = out[out.length - 1]?.name ?? "";
    if (maneuver !== "straight" || (last.name && last.name !== prevName)) {
      out.push({
        ...last,
        maneuver,
        instruction: turnInstruction(maneuver, last.name),
        fromIndex: first.fromIndex,
      });
    } else if (out.length > 0) {
      // Simple crochet : la consigne précédente se prolonge.
      out[out.length - 1] = { ...out[out.length - 1]!, toIndex: last.toIndex };
    }
    i = k + 1;
  }
  for (let j = 0; j < out.length - 1; j++) out[j]!.toIndex = Math.max(out[j]!.fromIndex, out[j + 1]!.fromIndex);
  return { ...path, steps: withDistances(out, cum) };
}
