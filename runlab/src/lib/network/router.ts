/**
 * Moteur d'itinéraires interne, sur le réseau piéton local (tuiles OpenStreetMap) :
 * aucun service externe, donc ni quota ni coût.
 *
 * - accrochage d'un point sur la voie la plus proche (au milieu d'une rue, pas
 *   seulement à un carrefour) ;
 * - plus court chemin (A*) entre des points, selon le coût des voies ;
 * - tracé complet : géométrie, altitude, revêtement, type de voie et consignes de
 *   guidage avec le nom des rues.
 *
 * Consignes : on n'annonce un virage qu'à un vrai carrefour, quand une autre voie
 * aurait pu être prise par erreur. Une rue qui tourne sans embranchement n'est pas
 * annoncée ; une fourche (deux voies presque droites) donne « restez à gauche/droite ».
 */
import { cumulativeDistances, haversine, pointAtDistance } from "@/lib/geo/geo";
import { maneuverFromTurn, simplifyJogs, turnInstruction, withDistances } from "@/lib/route/compose";
import { bearing } from "@/lib/route/interruptions";
import type { LngLat, Maneuver, Position, RoutedPath, RouteStep, Segment, SurfaceKind, WayKind } from "@/lib/route/types";
import type { WalkGraph } from "./graph";

/** Altitude (m) en un point, ou null si inconnue. */
export type ElevationSampler = (p: LngLat) => number | null;

/** Point accroché sur une arête brute du réseau (fraction `t` depuis son extrémité `ea`). */
export interface EdgePoint {
  e: number;
  t: number;
  point: LngLat;
  /** Distance entre le point demandé et la voie (m). */
  d: number;
}

/**
 * Tracé sur le réseau : points, nœud du graphe de chaque point (−1 : point posé sur une
 * voie) et arête brute de chaque portion (entre le point i et le point i + 1).
 */
export interface Trace {
  pts: LngLat[];
  node: number[];
  edge: number[];
}

/** Écart (m) de part et d'autre d'un carrefour pour mesurer les directions. */
const SPAN_M = 15;
/** Points intermédiaires pour l'altitude sur les longues portions droites (m). */
const ELEVATION_STEP_M = 30;

/** Voie la plus proche d'un point (dans la composante principale du réseau). */
export function snapToEdge(g: WalkGraph, p: LngLat, radiusM: number): EdgePoint | null {
  const px = p[0] * g.kx;
  const py = p[1] * g.ky;
  let best: EdgePoint | null = null;
  const seen = new Set<number>();
  // Les extrémités d'une longue portion droite peuvent être loin du point : marge de recherche.
  for (const { n } of g.nodesNear(p, radiusM + 300)) {
    for (const e of g.adj[n]!) {
      if (seen.has(e)) continue;
      seen.add(e);
      const a = g.ea[e]!;
      const b = g.eb[e]!;
      const ax = g.x(a);
      const ay = g.y(a);
      const dx = g.x(b) - ax;
      const dy = g.y(b) - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const d = Math.hypot(px - ax - dx * t, py - ay - dy * t);
      if (d <= radiusM && (!best || d < best.d)) {
        best = { e, t, d, point: [g.lon[a]! + (g.lon[b]! - g.lon[a]!) * t, g.lat[a]! + (g.lat[b]! - g.lat[a]!) * t] };
      }
    }
  }
  return best;
}

/**
 * Nœud de départ d'un parcours planifié : le point le plus proche, en suivant les voies
 * depuis la rue où l'on se trouve (et non le carrefour le plus proche à vol d'oiseau, qui
 * peut être de l'autre côté d'un mur), qui permet de boucler sans revenir sur ses pas :
 * depuis le fond d'une impasse, c'est le carrefour au bout de l'impasse.
 */
export function startNode(g: WalkGraph, p: LngLat, radiusM: number): number | null {
  return startAccess(g, p, radiusM)?.node ?? null;
}

/** Nœud de départ (voir `startNode`) et longueur de l'accès depuis le point (m). */
export function startAccess(g: WalkGraph, p: LngLat, radiusM: number): { node: number; distM: number } | null {
  const s = snapToEdge(g, p, radiusM);
  if (!s) return null;
  const dist = new Map<number, number>();
  const heap = new Heap();
  const seed = (v: number, d: number) => {
    if (d < (dist.get(v) ?? Infinity)) {
      dist.set(v, d);
      heap.push(v, d);
    }
  };
  seed(g.ea[s.e]!, s.t * g.elen[s.e]!);
  seed(g.eb[s.e]!, (1 - s.t) * g.elen[s.e]!);
  while (heap.size) {
    const [u, d] = heap.pop();
    if (d > (dist.get(u) ?? Infinity)) continue;
    if (g.core[u]) return { node: u, distM: d };
    if (d > 2000) break;
    for (const e of g.adj[u]!) seed(g.other(e, u), d + g.elen[e]!);
  }
  // Réseau sans boucle possible (une seule rue) : on part du bout de voie le plus proche.
  return s.t < 0.5 ? { node: g.ea[s.e]!, distM: s.t * g.elen[s.e]! } : { node: g.eb[s.e]!, distM: (1 - s.t) * g.elen[s.e]! };
}

/** Point du réseau placé exactement sur un nœud. */
export function nodePoint(g: WalkGraph, n: number): EdgePoint {
  const e = g.adj[n]![0]!;
  return { e, t: g.ea[e] === n ? 0 : 1, point: g.coord(n), d: 0 };
}

class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    let i = this.ids.length;
    this.ids.push(id);
    this.keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= key) break;
      this.ids[i] = this.ids[p]!;
      this.keys[i] = this.keys[p]!;
      i = p;
    }
    this.ids[i] = id;
    this.keys[i] = key;
  }
  pop(): [number, number] {
    const top: [number, number] = [this.ids[0]!, this.keys[0]!];
    const id = this.ids.pop()!;
    const key = this.keys.pop()!;
    const n = this.ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const c = l + 1 < n && this.keys[l + 1]! < this.keys[l]! ? l + 1 : l;
        if (this.keys[c]! >= key) break;
        this.ids[i] = this.ids[c]!;
        this.keys[i] = this.keys[c]!;
        i = c;
      }
      this.ids[i] = id;
      this.keys[i] = key;
    }
    return top;
  }
}

/** Plus court chemin (selon le coût des voies) entre deux points accrochés au réseau. */
export function routeBetween(g: WalkGraph, from: EdgePoint, to: EdgePoint): Trace | null {
  const n = g.size;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  let minFac = Infinity;
  for (let e = 0; e < g.efac.length; e++) minFac = Math.min(minFac, g.efac[e]!);
  if (!Number.isFinite(minFac)) return null;
  const tx = to.point[0] * g.kx;
  const ty = to.point[1] * g.ky;
  const h = (v: number) => Math.hypot(g.x(v) - tx, g.y(v) - ty) * minFac;
  const heap = new Heap();
  const seed = (v: number, c: number) => {
    if (c < cost[v]!) {
      cost[v] = c;
      heap.push(v, c + h(v));
    }
  };
  const fe = from.e;
  const fc = g.elen[fe]! * g.efac[fe]!;
  seed(g.ea[fe]!, from.t * fc);
  seed(g.eb[fe]!, (1 - from.t) * fc);
  const te = to.e;
  const tc = g.elen[te]! * g.efac[te]!;
  const ta = g.ea[te]!;
  const tb = g.eb[te]!;
  // Arrivée : par l'une ou l'autre extrémité de la voie d'arrivée, ou directement.
  let best = fe === te ? Math.abs(from.t - to.t) * fc : Infinity;
  let via = fe === te ? -2 : -1;
  while (heap.size) {
    const [u, key] = heap.pop();
    if (key >= best) break;
    const cu = cost[u]!;
    if (key > cu + h(u) + 1e-9) continue;
    if (u === ta && cu + to.t * tc < best) [best, via] = [cu + to.t * tc, ta];
    if (u === tb && cu + (1 - to.t) * tc < best) [best, via] = [cu + (1 - to.t) * tc, tb];
    for (const e of g.adj[u]!) {
      const v = g.other(e, u);
      const c = cu + g.elen[e]! * g.efac[e]!;
      if (c < cost[v]!) {
        cost[v] = c;
        prev[v] = e;
        heap.push(v, c + h(v));
      }
    }
  }
  if (via === -1) return null;
  if (via === -2) return { pts: [from.point, to.point], node: [-1, -1], edge: [fe] };
  // Remontée jusqu'à l'un des nœuds de départ.
  const nodes: number[] = [];
  const edges: number[] = [];
  let v = via;
  nodes.push(v);
  while (prev[v]! >= 0) {
    const e = prev[v]!;
    edges.push(e);
    v = g.other(e, v);
    nodes.push(v);
  }
  nodes.reverse();
  edges.reverse();
  const trace: Trace = { pts: [from.point], node: [-1], edge: [fe] };
  nodes.forEach((m, i) => {
    trace.pts.push(g.coord(m));
    trace.node.push(m);
    if (i < edges.length) trace.edge.push(edges[i]!);
  });
  trace.edge.push(te);
  trace.pts.push(to.point);
  trace.node.push(-1);
  return cleanTrace(trace);
}

/** Plus courts chemins (selon le coût) depuis un nœud : coût, longueur et arête d'arrivée. */
export interface RawTree {
  cost: Float64Array;
  len: Float64Array;
  prev: Int32Array;
}

export function shortestTree(g: WalkGraph, src: number, maxLenM = Infinity): RawTree {
  const n = g.size;
  const cost = new Float64Array(n).fill(Infinity);
  const len = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  cost[src] = 0;
  len[src] = 0;
  const heap = new Heap();
  heap.push(src, 0);
  while (heap.size) {
    const [u, d] = heap.pop();
    if (d > cost[u]!) continue;
    if (len[u]! > maxLenM) continue;
    for (const e of g.adj[u]!) {
      const v = g.other(e, u);
      const c = d + g.elen[e]! * g.efac[e]!;
      if (c < cost[v]!) {
        cost[v] = c;
        len[v] = len[u]! + g.elen[e]!;
        prev[v] = e;
        heap.push(v, c);
      }
    }
  }
  return { cost, len, prev };
}

/** Nœuds du chemin de la racine de l'arbre jusqu'à `dst`. */
export function treePath(g: WalkGraph, tree: RawTree, dst: number): number[] {
  const out = [dst];
  let v = dst;
  while (tree.prev[v]! >= 0) {
    v = g.other(tree.prev[v]!, v);
    out.push(v);
  }
  return out.reverse();
}

/** Tracé d'une suite de nœuds du réseau, reliés deux à deux par une arête. */
export function traceFromNodes(g: WalkGraph, nodes: readonly number[]): Trace {
  const trace: Trace = { pts: [], node: [], edge: [] };
  nodes.forEach((n, i) => {
    trace.pts.push(g.coord(n));
    trace.node.push(n);
    if (i === 0) return;
    const u = nodes[i - 1]!;
    const e = g.adj[u]!.find((x) => g.other(x, u) === n);
    if (e === undefined) throw new Error(`Nœuds ${u} et ${n} non reliés`);
    trace.edge.push(e);
  });
  return trace;
}

/** Enchaîne deux tracés (le second part de la fin du premier). */
export function joinTraces(a: Trace, b: Trace): Trace {
  if (a.pts.length === 0) return b;
  return cleanTrace({ pts: [...a.pts, ...b.pts.slice(1)], node: [...a.node, ...b.node.slice(1)], edge: [...a.edge, ...b.edge] });
}

/**
 * Retire les demi-tours sur une même voie autour d'un point posé au milieu d'une rue :
 * partir vers un carrefour pour revenir aussitôt sur ses pas revient à partir
 * directement dans l'autre sens. Supprime aussi les points en double. Les impasses
 * entre deux carrefours (point de passage voulu au fond d'une impasse) sont conservées.
 */
export function cleanTrace(trace: Trace): Trace {
  const same = (a: LngLat, b: LngLat) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  const out: Trace = { pts: [trace.pts[0]!], node: [trace.node[0]!], edge: [] };
  for (let i = 1; i < trace.pts.length; i++) {
    const p = trace.pts[i]!;
    const n = trace.node[i]!;
    const e = trace.edge[i - 1]!;
    const k = out.pts.length - 1;
    if (same(p, out.pts[k]!)) {
      if (n >= 0) out.node[k] = n;
      continue;
    }
    // Même voie dans les deux sens de part et d'autre du dernier point, près d'un point posé sur la voie.
    if (k >= 1 && out.edge[k - 1] === e && (n < 0 || out.node[k - 1]! < 0)) {
      out.pts.pop();
      out.node.pop();
      out.edge.pop();
      if (same(p, out.pts[k - 1]!)) {
        if (n >= 0) out.node[k - 1] = n;
        continue;
      }
    }
    out.pts.push(p);
    out.node.push(n);
    out.edge.push(e);
  }
  return out;
}

/** Tracé passant par les points donnés, dans l'ordre (chaque point accroché à la voie la plus proche). */
export function routeThrough(g: WalkGraph, points: readonly LngLat[], snapM = 500): Trace | null {
  const snapped = points.map((p) => snapToEdge(g, p, snapM));
  if (snapped.some((s) => s === null)) return null;
  let trace: Trace | null = null;
  for (let i = 1; i < snapped.length; i++) {
    const leg = routeBetween(g, snapped[i - 1]!, snapped[i]!);
    if (!leg) return null;
    trace = trace ? joinTraces(trace, leg) : leg;
  }
  return trace;
}

/**
 * Raccorde un tracé planifié (suite de nœuds) au point de départ réel et y revient :
 * on part de la voie la plus proche du point, pas du carrefour le plus proche.
 * `shift` : décalage des indices du tracé planifié (point i → i + shift), valable pour
 * ses points intérieurs (le premier et le dernier peuvent disparaître dans un demi-tour).
 */
export function attachEnds(g: WalkGraph, core: Trace, start: LngLat, end: LngLat = start): { trace: Trace; shift: number } {
  let out = core;
  let shift = 0;
  const s = snapToEdge(g, start, 500);
  if (s && core.node[0]! >= 0) {
    const head = routeBetween(g, s, nodePoint(g, core.node[0]!));
    if (head) {
      out = joinTraces(head, out);
      // Points du tracé joint : ceux de l'amorce, puis ceux du tracé moins un éventuel demi-tour.
      shift = out.pts.length - core.pts.length;
    }
  }
  const e = snapToEdge(g, end, 500);
  const last = core.node[core.node.length - 1]!;
  if (e && last >= 0) {
    const tail = routeBetween(g, nodePoint(g, last), e);
    if (tail) out = joinTraces(out, tail);
  }
  return { trace: out, shift };
}

/** Longueur d'un tracé (m). */
export function traceLength(g: WalkGraph, trace: Trace): number {
  let len = 0;
  for (let i = 0; i + 1 < trace.pts.length; i++) {
    const a = trace.pts[i]!;
    const b = trace.pts[i + 1]!;
    len += Math.hypot((a[0] - b[0]) * g.kx, (a[1] - b[1]) * g.ky);
  }
  return len;
}

/** Point situé à `distM` du nœud `n` en suivant l'arête `e` (puis la suite de la voie). */
function branchPoint(g: WalkGraph, n: number, e: number, distM: number): LngLat {
  let u = n;
  let edge = e;
  let left = distM;
  for (let guard = 0; guard < 50; guard++) {
    const v = g.other(edge, u);
    const len = g.elen[edge]!;
    if (len >= left) {
      const t = left / len;
      return [g.lon[u]! + (g.lon[v]! - g.lon[u]!) * t, g.lat[u]! + (g.lat[v]! - g.lat[u]!) * t];
    }
    left -= len;
    if (g.adj[v]!.length !== 2) return g.coord(v);
    edge = g.adj[v]!.find((x) => x !== edge)!;
    u = v;
  }
  return g.coord(u);
}

/** Écart signé entre deux directions, dans ]−180, 180] (positif = à droite). */
function signedTurn(inB: number, outB: number) {
  return ((outB - inB + 540) % 360) - 180;
}

const CARDINAL = ["le nord", "le nord-est", "l'est", "le sud-est", "le sud", "le sud-ouest", "l'ouest", "le nord-ouest"];

function surfaceOf(g: WalkGraph, e: number): SurfaceKind {
  const line = g.lines[g.eline[e]!]!;
  if (line.surface === "paved") return "paved";
  if (line.surface === "unpaved") return "unpaved";
  // Les rues sont revêtues ; un chemin sans indication reste inconnu.
  return ["primary", "secondary", "tertiary", "minor", "service"].includes(line.cls) ? "paved" : "unknown";
}

function wayOf(g: WalkGraph, e: number): WayKind {
  const line = g.lines[g.eline[e]!]!;
  switch (line.cls) {
    case "primary":
    case "secondary":
    case "tertiary":
      return "road";
    case "minor":
    case "service":
      return "street";
    case "track":
      return "track";
    case "path":
      if (line.subclass === "steps") return "steps";
      if (line.subclass === "cycleway") return "cycleway";
      if (line.subclass === "footway" || line.subclass === "pedestrian") return "footway";
      return "path";
    default:
      return "other";
  }
}

export function nameOf(g: WalkGraph, e: number): string {
  return g.lines[g.eline[e]!]?.name ?? "";
}

function segmentsOf<T>(trace: Trace, value: (e: number) => T): Segment<T>[] {
  const out: Segment<T>[] = [];
  trace.edge.forEach((e, i) => {
    const v = value(e);
    const last = out[out.length - 1];
    if (last && last.value === v) last.to = i + 1;
    else out.push({ from: i, to: i + 1, value: v });
  });
  return out;
}

/** Ajoute des points intermédiaires sur les longues portions (profil d'altitude fidèle). */
function densify(g: WalkGraph, trace: Trace, index: number[]): Trace {
  const out: Trace = { pts: [], node: [], edge: [] };
  for (let i = 0; i < trace.pts.length; i++) {
    const a = trace.pts[i]!;
    index.push(out.pts.length);
    out.pts.push(a);
    out.node.push(trace.node[i]!);
    if (i + 1 >= trace.pts.length) break;
    const b = trace.pts[i + 1]!;
    const e = trace.edge[i]!;
    const len = Math.hypot((a[0] - b[0]) * g.kx, (a[1] - b[1]) * g.ky);
    const parts = Math.floor(len / ELEVATION_STEP_M);
    out.edge.push(e);
    for (let k = 1; k < parts; k++) {
      const t = k / parts;
      out.pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      out.node.push(-1);
      out.edge.push(e);
    }
  }
  return out;
}

/** Consignes de guidage d'un tracé (départ, virages aux carrefours, arrivée). */
function stepsOf(g: WalkGraph, trace: Trace, coords: readonly Position[], cum: readonly number[]): RouteStep[] {
  const total = cum[cum.length - 1] ?? 0;
  const at = (m: number) => pointAtDistance(coords, cum, Math.max(0, Math.min(total, m)));
  const last = coords.length - 1;
  const steps: RouteStep[] = [];
  const firstName = trace.edge.length > 0 ? nameOf(g, trace.edge[0]!) : "";
  const dir = CARDINAL[Math.round(bearing(coords[0]!, at(SPAN_M * 2)) / 45) % 8]!;
  steps.push({
    instruction: firstName ? `Partez vers ${dir} sur ${firstName}` : `Partez vers ${dir}`,
    name: firstName,
    maneuver: "depart",
    distanceM: 0,
    fromIndex: 0,
    toIndex: 0,
  });
  let currentName = firstName;
  for (let i = 1; i < last; i++) {
    const n = trace.node[i]!;
    if (n < 0) continue;
    const inEdge = trace.edge[i - 1]!;
    const outEdge = trace.edge[i]!;
    const outName = nameOf(g, outEdge);
    const others = g.adj[n]!.filter((e) => e !== inEdge && e !== outEdge);
    if (others.length === 0) {
      // Pas d'embranchement : la voie tourne d'elle-même, rien à annoncer.
      if (outName) currentName = outName;
      continue;
    }
    const m = cum[i]!;
    const here = coords[i]!;
    const inB = bearing(at(m - SPAN_M), here);
    const ours = signedTurn(inB, bearing(here, at(m + SPAN_M)));
    const alts = others.map((e) => signedTurn(inB, bearing(here, branchPoint(g, n, e, SPAN_M))));
    const a = Math.abs(ours);
    let maneuver: Maneuver | null = null;
    if (a < 25) {
      // Tout droit ; une autre voie presque droite fait une fourche à préciser (sauf les
      // deux chaussées d'une même avenue, qui se rejoignent).
      const fork = alts.find((x, k) => Math.abs(x) < 35 && !(outName && nameOf(g, others[k]!) === outName));
      if (fork !== undefined) maneuver = ours < fork ? "keep-left" : "keep-right";
    } else if (!(a < 45 && alts.every((x) => Math.abs(x) > a + 30)) && alts.some((x) => Math.abs(x) < 120)) {
      // Vrai virage, quand une autre voie plausible aurait pu être prise.
      maneuver = maneuverFromTurn(inB, bearing(here, at(m + SPAN_M)));
      // Épingle sur une autre voie : un virage serré, pas un demi-tour sur ses pas.
      if (maneuver === "uturn" && inEdge !== outEdge && haversine(at(m - 2 * SPAN_M), at(m + 2 * SPAN_M)) > 3) maneuver = ours > 0 ? "sharp-right" : "sharp-left";
    }
    if (maneuver === null && outName && currentName && outName !== currentName) maneuver = "straight";
    if (outName) currentName = outName;
    if (maneuver === null) continue;
    steps.push({ instruction: turnInstruction(maneuver, outName), name: outName, maneuver, distanceM: 0, fromIndex: i, toIndex: i });
  }
  steps.push({ instruction: "Arrivée", name: "", maneuver: "arrive", distanceM: 0, fromIndex: last, toIndex: last });
  for (let k = 0; k < steps.length - 1; k++) steps[k]!.toIndex = Math.max(steps[k]!.fromIndex, steps[k + 1]!.fromIndex);
  return withDistances(steps, cum);
}

/** Itinéraire complet (au format commun à tous les moteurs) à partir d'un tracé sur le réseau. */
export function pathFromTrace(g: WalkGraph, input: Trace, elevation?: ElevationSampler | null): RoutedPath {
  return buildPath(g, input, elevation).path;
}

/**
 * Itinéraire complet, et nouvel indice de chaque point du tracé (des points intermédiaires
 * sont ajoutés pour l'altitude).
 */
export function buildPath(g: WalkGraph, input: Trace, elevation?: ElevationSampler | null): { path: RoutedPath; index: number[] } {
  const index: number[] = [];
  const trace = elevation ? densify(g, input, index) : input;
  if (!elevation) for (let i = 0; i < input.pts.length; i++) index.push(i);
  const heights = elevation ? trace.pts.map((p) => elevation(p)) : [];
  const hasElevation = Boolean(elevation) && heights.every((h) => h !== null && Number.isFinite(h));
  const coordinates: Position[] = trace.pts.map((p, i) => (hasElevation ? [p[0], p[1], Math.round(heights[i]! * 10) / 10] : [p[0], p[1]]));
  const cum = cumulativeDistances(coordinates);
  const path = simplifyJogs({
    coordinates,
    engineDistanceM: cum[cum.length - 1] ?? 0,
    surfaces: segmentsOf(trace, (e) => surfaceOf(g, e)),
    waytypes: segmentsOf(trace, (e) => wayOf(g, e)),
    steps: stepsOf(g, trace, coordinates, cum),
    hasElevation,
  });
  return { path, index };
}
