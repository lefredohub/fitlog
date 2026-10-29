/**
 * Générateur de propositions de parcours, entièrement sur l'appareil.
 *
 * Règle : une proposition fait entre la distance visée et +5 % (10 km → 10 à 10,5 km),
 * jamais moins.
 * - Boucle : planifiée sur le réseau piéton local (tuiles OpenStreetMap) parmi des
 *   milliers de possibilités — ronde, sans aller-retour ni rue reprise — puis tracée
 *   exactement comme planifiée. Plusieurs tours : la distance est répartie sur les tours.
 * - Circuit : plusieurs tours d'un lieu piéton proche (étang, parc…), en mode record ou
 *   quand on demande plusieurs tours.
 * - Aller-retour : aller le plus direct et agréable dans une direction, coupé exactement à
 *   mi-distance, retour par le même chemin.
 */
import { cumulativeDistances } from "@/lib/geo/geo";
import { markLap, mirrorReturn } from "@/lib/route/compose";
import { countRoadCrossings, roadsFromLines, type RoadLine } from "@/lib/route/crossings";
import { bearing } from "@/lib/route/interruptions";
import { computeRouteStats } from "@/lib/route/stats";
import type { LngLat, RoutedPath } from "@/lib/route/types";
import { RoutingError } from "@/lib/routing/errors";
import { WalkGraph, type NetworkData } from "@/lib/network/graph";
import {
  attachEnds,
  buildPath,
  nameOf,
  shortestTree,
  startAccess,
  traceFromNodes,
  traceLength,
  treePath,
  type ElevationSampler,
  type Trace,
} from "@/lib/network/router";
import { planCircuits, type PlannedCircuit } from "./circuits";
import { planLoops, type PlannedLoop } from "./loopPlanner";
import { networkCost } from "./profile";
import type { Candidate, GenerateInput, GenerateResult } from "./types";
import { aimDistance, distanceWindow, selectVariants } from "./variants";

/** Réseau piéton (lignes OpenStreetMap), lieux et noms autour d'un point. */
export type NetworkSource = (center: LngLat, radiusM: number, signal?: AbortSignal) => Promise<NetworkData>;

/** Altitudes d'une zone (tuiles de terrain) ; null si indisponibles. */
export type ElevationSource = (points: LngLat[]) => Promise<ElevationSampler | null>;

export interface EngineDeps {
  network: NetworkSource;
  elevation?: ElevationSource;
}

/** Longueur maximale d'un tour (au-delà : plusieurs tours ou un aller-retour). */
export const MAX_LAP_M = 30_000;
/** Aller-retour : distance totale maximale. */
export const MAX_OUTBACK_M = 42_200;
/** Propositions planifiées, avant le tri final. */
const PLANNED = 10;
const PLANNED_RECORD = 12;
const OUTBACK_DIRECTIONS = 6;

/** Rayon du réseau à charger pour planifier une boucle de cette longueur. */
export function networkRadius(lapM: number) {
  return (lapM / 1.25 / Math.PI) * 1.1 + 500;
}

/** Longueur (en nœuds) de la portion commune au début et à la fin d'une boucle. */
export function stemOf(nodes: readonly number[]): number {
  let m = 0;
  while (m + 1 < nodes.length - 1 - m && nodes[m + 1] === nodes[nodes.length - 2 - m]) m++;
  return m;
}

/** Enchaîne des suites de nœuds (chacune part du dernier nœud de la précédente). */
function chain(parts: number[][]): { nodes: number[]; starts: number[] } {
  const nodes: number[] = [];
  const starts: number[] = [];
  for (const p of parts) {
    starts.push(Math.max(0, nodes.length - 1));
    nodes.push(...(nodes.length > 0 ? p.slice(1) : p));
  }
  return { nodes, starts };
}

function toCandidate(id: string, path: RoutedPath, recipe: Candidate["recipe"]): Candidate {
  return { id, path, stats: computeRouteStats(path), recipe };
}

/** Contexte d'un calcul : réseau, altitudes et départ réel. */
interface Ctx {
  g: WalkGraph;
  start: LngLat;
  elevation: ElevationSampler | null;
}

/**
 * Parcours tracé exactement comme planifié, en une suite de nœuds du réseau (tours
 * enchaînés), raccordé au point de départ réel. `marks` : indices (dans `nodes`) des
 * débuts de tour, avec le texte annoncé.
 */
function pathFromNodes(ctx: Ctx, nodes: number[], marks: { at: number; text: string }[], firstLap?: string): { path: RoutedPath; marks: number[] } {
  const { g } = ctx;
  const { trace, shift } = attachEnds(g, traceFromNodes(g, nodes), ctx.start);
  // Départ éloigné du premier tour (fond d'impasse…) : le début du tour est annoncé.
  const head = trace.pts[shift];
  const first = g.coord(nodes[0]!);
  const laps =
    firstLap && shift > 0 && head && head[0] === first[0] && head[1] === first[1] && traceLength(g, { ...trace, pts: trace.pts.slice(0, shift + 1) }) > 50
      ? [{ at: 0, text: firstLap }, ...marks]
      : marks;
  const { path: raw, index } = buildPath(g, trace, ctx.elevation);
  let path = raw;
  const idx = laps.map((l) => index[l.at + shift]!);
  laps.forEach((l, k) => {
    const at = l.at + shift;
    path = markLap(path, idx[k]!, l.text, at < trace.edge.length ? nameOf(g, trace.edge[at]!) : "");
  });
  return { path, marks: idx };
}

/** Boucles et circuits, tracés exactement comme planifiés et mesurés au mètre près. */
function loopCandidates(ctx: Ctx, input: GenerateInput, loops: PlannedLoop[], circuits: PlannedCircuit[], laps: number, count: number): Candidate[] {
  const { g } = ctx;
  const { minM, maxM } = distanceWindow(input.targetDistanceM);
  const out: Candidate[] = [];
  for (const [i, plan] of loops.entries()) {
    if (out.length >= count) break;
    // Une « queue » (même rue au départ et au retour) n'est parcourue qu'une fois : elle
    // sert d'accès au premier tour et de retour après le dernier.
    const stem = stemOf(plan.nodes);
    const cycle = plan.nodes.slice(stem, plan.nodes.length - stem);
    const parts = Array.from({ length: laps }, () => cycle);
    if (stem > 0) parts.unshift(plan.nodes.slice(0, stem + 1));
    if (stem > 0) parts.push(plan.nodes.slice(plan.nodes.length - stem - 1));
    const { nodes, starts } = chain(parts);
    // Mesure exacte (accès compris) avant de tracer : seules les boucles dans la fourchette.
    const lengthM = traceLength(g, attachEnds(g, traceFromNodes(g, nodes), ctx.start).trace);
    if (lengthM < minM || lengthM > maxM) continue;
    const first = stem > 0 ? 1 : 0;
    const marks = starts.slice(first, first + laps).map((at, k) => ({ at, text: `Tour ${k + 1} sur ${laps}` }));
    // Sans accès, le premier tour commence au départ : annoncé seulement s'il en est loin.
    const firstLap = stem === 0 ? marks.shift()?.text : undefined;
    const { path } = pathFromNodes(ctx, nodes, laps > 1 ? marks : [], laps > 1 ? firstLap : undefined);
    out.push(toCandidate(`p${input.variation}-${i}`, path, { type: "planned", laps }));
  }
  circuits.forEach((c, i) => {
    const lapM = c.lap.lengthM;
    // Un morceau final de plus d'un demi-tour est annoncé comme un tour (écourté).
    const shortLap = c.partialM >= lapM / 2;
    const total = shortLap ? c.laps + 1 : c.laps;
    const parts = [...(c.approach ? [c.approach.nodes] : []), ...Array.from({ length: c.laps }, () => c.lap.nodes)];
    if (c.partialNodes.length > 1) parts.push(c.partialNodes);
    if (c.back) parts.push(c.back.nodes);
    const { nodes, starts } = chain(parts);
    const first = c.approach ? 1 : 0;
    const marks: { at: number; text: string }[] = [];
    if (c.approach) marks.push({ at: starts[1]!, text: total > 1 ? `Tour 1 sur ${total}` : "Début du circuit" });
    for (let k = 1; k < c.laps; k++) marks.push({ at: starts[first + k]!, text: `Tour ${k + 1} sur ${total}` });
    const partialStart = c.partialNodes.length > 1 ? starts[first + c.laps]! : null;
    if (shortLap && partialStart !== null) marks.push({ at: partialStart, text: `Tour ${total} sur ${total} (raccourci)` });
    const { path, marks: idx } = pathFromNodes(ctx, nodes, marks);
    const cum = cumulativeDistances(path.coordinates);
    const totalM = cum[cum.length - 1]!;
    const approachM = c.approach ? cum[idx[0]!]! : 0;
    const backM = c.back ? Math.max(0, totalM - approachM - c.laps * lapM - c.partialM) : 0;
    out.push(
      toCandidate(`k${input.variation}-${i}`, path, {
        type: "planned",
        laps: total,
        circuit: { kind: c.kind, name: c.name, lapM, approachM, partialM: shortLap ? c.partialM - lapM : c.partialM, backM },
      }),
    );
  });
  return out;
}

/**
 * Allers-retours : dans plusieurs directions, le chemin le plus direct et le plus agréable
 * (selon le coût des voies) jusqu'à mi-distance, coupé au mètre près, puis le même
 * chemin au retour.
 */
function outbackCandidates(ctx: Ctx, input: GenerateInput): Candidate[] {
  const { g } = ctx;
  const access = startAccess(g, input.start, 400);
  if (!access) return [];
  const half = aimDistance(input.targetDistanceM) / 2;
  const tree = shortestTree(g, access.node, half * 1.8);
  const s = g.coord(access.node);
  const kx = g.kx;
  const offset = (input.variation * 37) % 360;
  const out: Candidate[] = [];
  const used: Set<number>[] = [];
  for (let k = 0; k < OUTBACK_DIRECTIONS; k++) {
    const dir = (offset + (k * 360) / OUTBACK_DIRECTIONS) % 360;
    // Destination : assez loin pour couper à mi-distance, dans la bonne direction,
    // par un chemin direct (peu de détours) et agréable (coût proche de la longueur).
    let best = -1;
    let bestScore = -Infinity;
    for (let v = 0; v < g.size; v++) {
      const len = tree.len[v]!;
      if (!(len >= half && len <= half * 1.5)) continue;
      const p = g.coord(v);
      const crow = Math.hypot((p[0] - s[0]) * kx, (p[1] - s[1]) * g.ky);
      const dev = Math.abs(((bearing(s, p) - dir + 540) % 360) - 180);
      if (dev > 30) continue;
      const score = crow / len - 0.6 * (tree.cost[v]! / len - 1) - dev / 90;
      if (score > bestScore) [best, bestScore] = [v, score];
    }
    if (best < 0) continue;
    const nodes = treePath(g, tree, best);
    // Une direction déjà prise (même chemin sur plus de la moitié) n'apporte rien.
    const edges = new Set<number>();
    for (let i = 1; i < nodes.length; i++) edges.add(g.adj[nodes[i - 1]!]!.find((e) => g.other(e, nodes[i - 1]!) === nodes[i])!);
    if (used.some((u) => [...edges].filter((e) => u.has(e)).length > 0.5 * Math.min(u.size, edges.size))) continue;
    used.push(edges);
    // Coupe exacte : accès + aller = mi-distance.
    const { trace: full } = attachEnds(g, traceFromNodes(g, nodes), input.start, g.coord(best));
    const cut = cutTrace(g, full, half);
    if (!cut) continue;
    const { path } = buildPath(g, cut, ctx.elevation);
    out.push(toCandidate(`o${input.variation}-${k}`, mirrorReturn(path), { type: "outback", bearing: dir }));
  }
  return out;
}

/** Tracé coupé à `lengthM` mètres (point final posé sur la voie). */
function cutTrace(g: WalkGraph, trace: Trace, lengthM: number): Trace | null {
  let acc = 0;
  for (let i = 0; i + 1 < trace.pts.length; i++) {
    const a = trace.pts[i]!;
    const b = trace.pts[i + 1]!;
    const seg = Math.hypot((a[0] - b[0]) * g.kx, (a[1] - b[1]) * g.ky);
    if (acc + seg >= lengthM) {
      const t = seg > 0 ? (lengthM - acc) / seg : 0;
      return {
        pts: [...trace.pts.slice(0, i + 1), [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]],
        node: [...trace.node.slice(0, i + 1), -1],
        edge: trace.edge.slice(0, i + 1),
      };
    }
    acc += seg;
  }
  return null;
}

/** Mode record : traversées de route de chaque proposition. */
function countCrossings(candidates: Candidate[], roads: readonly RoadLine[]) {
  for (const c of candidates) {
    const { crossings, majorCrossings, points } = countRoadCrossings(c.path.coordinates, roads);
    c.stats = { ...c.stats, interruptions: { crossings, majorCrossings, points } };
  }
}

export async function generateProposals(input: GenerateInput, deps: EngineDeps, signal?: AbortSignal): Promise<GenerateResult> {
  const laps = input.shape === "loop" ? Math.max(1, input.laps ?? 1) : 1;
  const lapM = input.targetDistanceM / laps;
  const record = Boolean(input.preferences.forRecord);
  if (input.shape === "loop" && lapM > MAX_LAP_M) throw new RoutingError("TOO_LONG");
  if (input.shape === "outback" && input.targetDistanceM > MAX_OUTBACK_M) throw new RoutingError("TOO_LONG");

  // Circuits (plusieurs tours d'un lieu piéton proche) : en mode record, ou quand on
  // demande plusieurs tours.
  const circuitLaps = input.shape !== "loop" ? [] : laps > 1 ? [laps] : record ? [1, 2, 3, 4, 5, 6, 7, 8] : [];
  const radius =
    input.shape === "outback"
      ? aimDistance(input.targetDistanceM) / 2 + 500
      : circuitLaps.length > 0
        ? Math.max(networkRadius(lapM), Math.min(3000, input.targetDistanceM * 0.3) + 1000)
        : networkRadius(lapM);
  let data: NetworkData;
  try {
    data = await deps.network(input.start, radius, signal);
  } catch (err) {
    if (err instanceof Error && /trop grande/.test(err.message)) throw new RoutingError("TOO_LONG", err.message);
    throw new RoutingError("UPSTREAM", err instanceof Error ? err.message : "Carte indisponible");
  }
  signal?.throwIfAborted();
  const g = new WalkGraph(data.lines, networkCost(input.kind, input.preferences), input.start[1]);
  const access = startAccess(g, input.start, 400);
  if (access === null) throw new RoutingError("NOT_ROUTABLE", "Aucune voie praticable à moins de 400 m du départ");

  // Altitudes de toute la zone, chargées une seule fois.
  const dLon = radius / g.kx;
  const dLat = radius / g.ky;
  const corners: LngLat[] = [
    [input.start[0] - dLon, input.start[1] - dLat],
    [input.start[0] + dLon, input.start[1] + dLat],
  ];
  const elevation = deps.elevation ? await deps.elevation(corners).catch(() => null) : null;
  const ctx: Ctx = { g, start: input.start, elevation };
  const roads = record ? roadsFromLines(data.lines) : undefined;

  let candidates: Candidate[];
  if (input.shape === "outback") {
    candidates = outbackCandidates(ctx, input);
  } else {
    const count = record ? PLANNED_RECORD : PLANNED;
    // L'accès au premier carrefour (fond d'impasse…) est parcouru à l'aller et au retour.
    const accessM = access.distM > 30 ? 2 * access.distM : 0;
    const loops = planLoops(g, input.start, {
      targetM: lapM,
      minM: (input.targetDistanceM * 1.012 - accessM) / laps,
      maxM: (input.targetDistanceM * 1.04 - accessM) / laps,
      // Quelques boucles de réserve, au cas où l'accès décale la longueur.
      count: count + 4,
      seedOffset: input.variation,
      roads,
      laps,
    });
    signal?.throwIfAborted();
    const circuits =
      circuitLaps.length > 0
        ? planCircuits(g, input.start, data.areas, {
            minM: input.targetDistanceM * 1.012,
            maxM: input.targetDistanceM * 1.04,
            laps: circuitLaps,
            roads: roads ?? roadsFromLines(data.lines),
            labels: data.labels,
            count: 2,
            maxPartial: laps > 1 ? 0.5 : undefined,
          })
        : [];
    candidates = loopCandidates(ctx, input, loops, circuits, laps, count);
  }
  if (candidates.length === 0) throw new RoutingError("NO_ROUTE");
  if (roads) countCrossings(candidates, roads);
  return selectVariants(candidates, input.targetDistanceM, input.kind, input.preferences);
}
