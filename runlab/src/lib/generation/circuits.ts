/**
 * Circuits à répéter : faire plusieurs fois le tour d'un lieu piéton proche (étang, parc,
 * bois, boucle de chemins), plutôt qu'une grande boucle dans les rues.
 *
 * 1. Tours candidats, de deux sources :
 *    - les lieux de la carte (plans d'eau, parcs, bois) : points de passage posés sur le
 *      bord, de préférence sur un chemin piéton, reliés par les plus courts chemins ;
 *    - les boucles de chemins piétons (promenades, allées, voies vertes) : pour chaque
 *      chemin, la boucle la plus « piétonne » qui passe par lui.
 * 2. Chaque tour est nommé si un nom de lieu (étang, parc, jardin) se trouve à l'intérieur.
 * 3. Parcours complet : accès depuis le départ, N tours, un morceau de tour pour ajuster
 *    la distance, retour au départ ; jamais de demi-tour à l'entrée ni à la sortie.
 * 4. Classement : le moins de traversées de route par km, puis la part de chemins piétons.
 */
import { countRoadCrossings, type CrossingCount, type RoadLine } from "@/lib/route/crossings";
import { stopWeight } from "@/lib/route/interruptions";
import type { LngLat } from "@/lib/route/types";
import type { AreaKind, ContractedGraph, NetworkArea, NetworkLabel, ShortestTree, WalkGraph } from "@/lib/network/graph";
import { startNode } from "@/lib/network/router";
import { countHairpins, despurWalk, loopNodes, turnsPerKm, viaPoints, type Walk } from "./loopPlanner";

/** Nature du lieu dont on fait le tour (« path » : boucle de chemins sans lieu nommé). */
export type CircuitKind = AreaKind | "path";

export interface PlannedCircuit {
  kind: CircuitKind;
  /** Nom du lieu, si la carte en donne un. */
  name?: string;
  /** Point d'entrée du tour (début et fin de chaque tour). */
  anchor: LngLat;
  /** Accès depuis le départ (null si le tour passe par le départ). */
  approach: { coords: LngLat[]; nodes: number[]; lengthM: number } | null;
  lap: { coords: LngLat[]; nodes: number[]; via: LngLat[]; lengthM: number; crossings: CrossingCount; offRoad: number };
  laps: number;
  /** Morceau de tour supplémentaire après les tours complets (m), pour ajuster la distance. */
  partialM: number;
  /** Nœuds du morceau de tour (vide s'il n'y en a pas). */
  partialNodes: number[];
  /** Retour vers le départ depuis la fin du morceau de tour (null : on finit au départ). */
  back: { coords: LngLat[]; nodes: number[]; lengthM: number } | null;
  /**
   * Sorties possibles sur le tour (position depuis l'entrée, retour estimé), sans
   * demi-tour : permettent de réajuster la distance sur les longueurs réelles du moteur.
   */
  exits: { m: number; b: number; coord: LngLat }[];
  totalM: number;
  crossings: CrossingCount;
  score: number;
}

export interface CircuitOptions {
  /** Fourchette visée pour le parcours complet (accès + tours + retour), en m. */
  minM: number;
  maxM: number;
  /** Nombres de tours envisagés. */
  laps: number[];
  roads: readonly RoadLine[];
  labels?: readonly NetworkLabel[];
  count: number;
  /**
   * Nombre de tours imposé par le coureur : le morceau de tour final reste sous ce
   * pourcentage d'un tour (sinon il compterait comme un tour de plus).
   */
  maxPartial?: number;
}

/** Chemins piétons (classe OpenMapTiles « path » : allées, promenades, voies vertes…). */
const OFF_ROAD = new Set(["path", "track"]);
/** Coût relatif pour chercher des boucles piétonnes : les rues ne servent que de liaisons. */
const PATH_COST: Record<string, number> = { path: 1, track: 1.2, service: 2.5, minor: 2.5, tertiary: 6, secondary: 20, primary: 20 };
const SECTORS = 12;
/** Points de passage : à moins de 80 m du bord du lieu. */
const SHORE_SNAP_M = 80;
const MAX_SEEDS = 160;
/** Accès + retour : au plus 45 % du parcours. */
const MAX_ACCESS_SHARE = 0.45;
/** Pénalité du morceau de tour final (préférer un tour de plus et un petit morceau). */
const ARC_WEIGHT = 0.3;
/** Un tour doit être calme : au plus 2,5 traversées pondérées par km, 40 % de chemins piétons. */
const MAX_LAP_STOPS_PER_KM = 2.5;
const MIN_LAP_OFF_ROAD = 0.4;

/** Retire les allers-retours d'une boucle fermée, y compris à la jonction fin/début. */
export function despurCycle(walk: Walk): Walk {
  let w = despurWalk(walk);
  for (let guard = 0; guard < walk.length && w.length > 1; guard++) {
    const first = w[0]!;
    const last = w[w.length - 1]!;
    if (first.e !== last.e || first.fwd === last.fwd) break;
    w = w.slice(1, -1);
  }
  return w;
}

/** Le point est-il à l'intérieur du polygone (règle du nombre de croisements) ? */
export function inside(p: LngLat, poly: readonly LngLat[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

interface AreaShape {
  kind: AreaKind;
  center: LngLat;
  /** Point du bord le plus éloigné du centre dans chaque secteur. */
  rim: (LngLat | null)[];
  meanRadius: number;
}

/** Regroupe les morceaux d'un même lieu (découpage des tuiles) et décrit sa forme. */
export function areaShapes(areas: readonly NetworkArea[], g: WalkGraph): AreaShape[] {
  const byKey = new Map<string, { kind: AreaKind; points: LngLat[] }>();
  for (const a of areas) {
    const cur = byKey.get(a.key) ?? { kind: a.kind, points: [] };
    cur.points.push(...a.points);
    byKey.set(a.key, cur);
  }
  const out: AreaShape[] = [];
  for (const { kind, points } of byKey.values()) {
    let cx = 0;
    let cy = 0;
    for (const p of points) {
      cx += p[0];
      cy += p[1];
    }
    const center: LngLat = [cx / points.length, cy / points.length];
    const extent = new Array<number>(SECTORS).fill(0);
    const rim = new Array<LngLat | null>(SECTORS).fill(null);
    let sum = 0;
    for (const p of points) {
      const dx = (p[0] - center[0]) * g.kx;
      const dy = (p[1] - center[1]) * g.ky;
      const d = Math.hypot(dx, dy);
      sum += d;
      const sector = Math.round((((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360) / (360 / SECTORS)) % SECTORS;
      if (d > extent[sector]!) {
        extent[sector] = d;
        rim[sector] = p;
      }
    }
    out.push({ kind, center, rim, meanRadius: sum / points.length });
  }
  return out;
}

const BIG_ROADS = new Set(["primary", "secondary", "tertiary"]);

/** Point de passage près d'un bord : on préfère un chemin piéton à une grande route. */
export function shoreNode(g: WalkGraph, p: LngLat): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  for (const { n, d } of g.nodesNear(p, SHORE_SNAP_M)) {
    let penalty = 40;
    for (const e of g.adj[n]!) {
      const cls = g.lines[g.eline[e]!]!.cls;
      if (OFF_ROAD.has(cls)) penalty = Math.min(penalty, 0);
      else if (BIG_ROADS.has(cls)) penalty = Math.max(penalty, 150);
    }
    if (d + penalty < bestScore) {
      bestScore = d + penalty;
      best = n;
    }
  }
  return best;
}

/** Longueur sur chemins piétons et coût « boucle piétonne » de chaque arête contractée. */
function edgeProfiles(cg: ContractedGraph) {
  const g = cg.g;
  const offRoad = new Float64Array(cg.edges.length);
  const cost = new Float64Array(cg.edges.length);
  cg.edges.forEach((e, ce) => {
    for (let i = 0; i < e.nodes.length - 1; i++) {
      const a = e.nodes[i]!;
      const b = e.nodes[i + 1]!;
      const raw = g.adj[a]!.find((x) => g.other(x, a) === b);
      if (raw === undefined) continue;
      const cls = g.lines[g.eline[raw]!]!.cls;
      if (OFF_ROAD.has(cls)) offRoad[ce] = offRoad[ce]! + g.elen[raw]!;
      cost[ce] = cost[ce]! + g.elen[raw]! * (PATH_COST[cls] ?? 3);
    }
  });
  return { offRoad, cost };
}

interface LapCandidate {
  walk: Walk;
  L: number;
  kind: CircuitKind;
  /** Part du tour sur chemins piétons (0 à 1). */
  offRoad: number;
  coords: LngLat[];
}

function measure(cg: ContractedGraph, walk: Walk, offRoad: Float64Array) {
  let L = 0;
  let off = 0;
  const uses = new Map<number, number>();
  for (const st of walk) {
    L += cg.edges[st.e]!.len;
    off += offRoad[st.e]!;
    uses.set(st.e, (uses.get(st.e) ?? 0) + 1);
  }
  let re = 0;
  for (const [e, n] of uses) if (n > 1) re += cg.edges[e]!.len * (n - 1);
  const nodes = loopNodes(cg, walk);
  const seen = new Set<number>();
  let touches = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (seen.has(nodes[i]!)) touches++;
    seen.add(nodes[i]!);
  }
  return { L, offRoad: L > 0 ? off / L : 0, retrace: L > 0 ? re / L : 1, touches };
}

/** Rapport aire / périmètre (1 = cercle) d'une boucle. */
function roundness(coords: readonly LngLat[], g: WalkGraph, L: number): number {
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    area += coords[i]![0] * g.kx * coords[i + 1]![1] * g.ky - coords[i + 1]![0] * g.kx * coords[i]![1] * g.ky;
  }
  return (4 * Math.PI * Math.abs(area / 2)) / (L * L);
}

/** Recouvrement (part de la longueur de a) entre deux tours. */
function overlap(a: LapCandidate, b: LapCandidate, cg: ContractedGraph): number {
  const set = new Set(b.walk.map((s) => s.e));
  let shared = 0;
  for (const s of a.walk) if (set.has(s.e)) shared += cg.edges[s.e]!.len;
  return shared / a.L;
}

export function planCircuits(g: WalkGraph, start: LngLat, areas: readonly NetworkArea[], opts: CircuitOptions): PlannedCircuit[] {
  const s = startNode(g, start, 400);
  if (s === null) return [];
  const aim = (opts.minM + opts.maxM) / 2;
  const reach = Math.min(3000, aim * 0.3);
  const maxLap = opts.maxM / Math.min(...opts.laps);
  // Un tour trop court tourne en rond : au moins 600 m, et pas plus d'une dizaine de tours.
  const minLap = Math.max(600, opts.minM / Math.max(...opts.laps) - reach);
  const near = (p: LngLat, extra = 0) => Math.hypot((p[0] - start[0]) * g.kx, (p[1] - start[1]) * g.ky) <= reach + extra;

  // 1a. Lieux proches dont le tour a une longueur utile.
  const shapes = areaShapes(areas, g)
    .filter((a) => {
      const lap = 2 * Math.PI * a.meanRadius * 1.1;
      return a.meanRadius >= 60 && lap >= minLap * 0.7 && lap <= maxLap * 1.3 && near(a.center, a.meanRadius);
    })
    .sort((a, b) => b.meanRadius - a.meanRadius)
    .slice(0, 20);
  const rings = shapes.map((a) => {
    const nodes: number[] = [];
    for (const p of a.rim) {
      if (!p) continue;
      const n = shoreNode(g, p);
      if (n !== null && nodes[nodes.length - 1] !== n && nodes[0] !== n) nodes.push(n);
    }
    return nodes;
  });
  const cg = g.contract([s, ...rings.flat()]);
  const cs = cg.index[s]!;
  const { offRoad, cost } = edgeProfiles(cg);
  const candidates: LapCandidate[] = [];
  const accept = (walk: Walk, kind: CircuitKind, center?: LngLat): boolean => {
    const m = measure(cg, walk, offRoad);
    if (m.L < minLap || m.L > maxLap || m.retrace > 0.08 || m.touches > 1) return false;
    const coords = cg.coords(walk);
    if (center && !inside(center, coords)) return false;
    if (roundness(coords, g, m.L) < 0.15) return false;
    candidates.push({ walk, L: m.L, kind, offRoad: m.offRoad, coords });
    return true;
  };

  // 1b. Tour de chaque lieu : de point en point par les plus courts chemins.
  const trees = new Map<number, ShortestTree>();
  shapes.forEach((area, ai) => {
    const ring = rings[ai]!.map((n) => cg.index[n]!);
    if (ring.length < 4) return;
    const raw: Walk = [];
    for (let i = 0; i < ring.length; i++) {
      const from = ring[i]!;
      if (!trees.has(from)) trees.set(from, cg.tree(from, maxLap));
      const leg = cg.pathEdges(trees.get(from)!, ring[(i + 1) % ring.length]!);
      if (!leg) return;
      raw.push(...leg);
    }
    accept(despurCycle(raw), area.kind, area.center);
  });

  // 1c. Boucles de chemins piétons : pour chaque chemin proche, la boucle la plus
  //     piétonne qui l'emprunte (les chemins déjà couverts par une boucle sont sautés).
  const seeds = cg.edges
    .map((e, ce) => ({ ce, e }))
    .filter(({ ce, e }) => e.len >= 40 && offRoad[ce]! >= 0.8 * e.len && near(g.coord(e.nodes[Math.floor(e.nodes.length / 2)]!)))
    .sort((x, y) => {
      const dx = (p: number) => Math.hypot(g.x(p) - g.x(s), g.y(p) - g.y(s));
      return dx(x.e.nodes[0]!) - dx(y.e.nodes[0]!);
    })
    .slice(0, MAX_SEEDS);
  const covered = new Set<number>();
  for (const { ce, e } of seeds) {
    if (covered.has(ce)) continue;
    covered.add(ce);
    let walk: Walk;
    if (e.a === e.b) {
      // Chemin qui se referme sur lui-même (tour d'étang relié au reste en un seul point).
      walk = [{ e: ce, fwd: true }];
    } else {
      const tree = cg.tree(e.a, maxLap, { cost, banned: ce });
      const path = cg.pathEdges(tree, e.b);
      if (!path || path.length === 0) continue;
      walk = despurCycle([...path, { e: ce, fwd: false }]);
    }
    const m = measure(cg, walk, offRoad);
    if (m.offRoad < 0.6) continue;
    if (accept(walk, "path")) for (const st of walk) covered.add(st.e);
  }

  // 2. Doublons (même boucle trouvée par deux sources) : on garde la plus piétonne.
  candidates.sort((a, b) => b.offRoad - a.offRoad);
  const laps: LapCandidate[] = [];
  for (const c of candidates) if (!laps.some((k) => overlap(c, k, cg) > 0.6)) laps.push(c);

  // 3. Tours calmes seulement, le plus tranquille d'abord.
  const scoredLaps = laps
    .map((lap) => {
      const crossings = countRoadCrossings(lap.coords, opts.roads);
      const stopsPerKm = stopWeight(crossings) / (lap.L / 1000);
      // Un tour se répète : une épingle ou un zigzag s'y répète aussi.
      const hairpins = countHairpins(lap.coords);
      const turns = turnsPerKm(lap.coords);
      return { lap, crossings, stopsPerKm, hairpins, quiet: -stopsPerKm + lap.offRoad - 0.05 * turns };
    })
    .filter((l) => l.stopsPerKm <= MAX_LAP_STOPS_PER_KM && l.lap.offRoad >= MIN_LAP_OFF_ROAD && l.hairpins === 0)
    .sort((a, b) => b.quiet - a.quiet)
    .slice(0, 12);

  // 4. Parcours complets : accès, N tours, morceau de tour, retour.
  const fromStart = cg.tree(cs, reach * 2 + maxLap);
  const found: PlannedCircuit[] = [];
  for (const { lap, crossings: lapCrossings } of scoredLaps) {
    const reversed: Walk = [...lap.walk].reverse().map((st) => ({ e: st.e, fwd: !st.fwd }));
    for (const orient of [lap.walk, reversed]) {
      const pos: { node: number; m: number; step: number }[] = [];
      let acc = 0;
      orient.forEach((st, k) => {
        const e = cg.edges[st.e]!;
        pos.push({ node: st.fwd ? e.a : e.b, m: acc, step: k });
        acc += e.len;
      });
      // Pas de demi-tour : l'accès n'arrive pas par la première portion du tour,
      // et le retour ne repart pas par la portion qu'on vient de courir.
      const entries = pos.filter((p) => Number.isFinite(fromStart.len[p.node]!) && fromStart.prev[p.node] !== orient[p.step]!.e);
      const reachable = pos.filter((p) => Number.isFinite(fromStart.len[p.node]!));
      const exits = reachable.filter((p) => fromStart.prev[p.node] !== orient[(p.step - 1 + orient.length) % orient.length]!.e);
      for (const n of opts.laps) {
        // Parmi les combinaisons dans la fourchette, la plus courte en rues (accès + retour).
        // En dernier recours (un seul accès au lieu : sinon la distance ne varie que par
        // tours entiers), demi-tour autorisé à la sortie.
        type Choice = { e: (typeof pos)[number]; x: (typeof pos)[number]; arc: number; a: number; b: number };
        const choose = (candidates: typeof pos): Choice | null => {
          let best: Choice | null = null;
          for (const e of entries) {
            const a = fromStart.len[e.node]!;
            for (const x of candidates) {
              const b = fromStart.len[x.node]!;
              const arc = (x.m - e.m + lap.L) % lap.L;
              if (opts.maxPartial !== undefined && arc >= opts.maxPartial * lap.L) continue;
              const total = a + n * lap.L + arc + b;
              // Un circuit, c'est surtout des tours : accès et retour restent minoritaires.
              if (total < opts.minM || total > opts.maxM || a + b > MAX_ACCESS_SHARE * total) continue;
              // Le moins de rues possible, et un morceau de tour final plutôt court.
              const cost = a + b + ARC_WEIGHT * arc;
              if (!best || cost < best.a + best.b + ARC_WEIGHT * best.arc - 1) best = { e, x, arc, a, b };
            }
          }
          return best;
        };
        const strict = choose(exits);
        const uturn = strict === null;
        const best = strict ?? choose(reachable);
        if (!best) continue;
        const { e, x, arc, a, b } = best;
        const lapWalk = [...orient.slice(e.step), ...orient.slice(0, e.step)];
        const lapCoords = cg.coords(lapWalk);
        const steps = (x.step - e.step + orient.length) % orient.length;
        const partialWalk = arc > 0 ? lapWalk.slice(0, steps) : [];
        const approachWalk = e.node === cs ? [] : (cg.pathEdges(fromStart, e.node) ?? []);
        const backWalk = x.node === cs ? [] : [...(cg.pathEdges(fromStart, x.node) ?? [])].reverse().map((st) => ({ e: st.e, fwd: !st.fwd }));
        const approachCoords = approachWalk.length > 0 ? cg.coords(approachWalk) : [];
        const backCoords = backWalk.length > 0 ? cg.coords(backWalk) : [];
        const route: LngLat[] = [...approachCoords];
        const add = (c: LngLat[]) => route.push(...(route.length ? c.slice(1) : c));
        for (let i = 0; i < n; i++) add(lapCoords);
        if (partialWalk.length > 0) add(cg.coords(partialWalk));
        if (backCoords.length > 0) add(backCoords);
        const crossings = countRoadCrossings(route, opts.roads);
        const totalM = a + n * lap.L + arc + b;
        const label = labelOf(lap, opts.labels);
        found.push({
          // Une boucle de chemins autour d'un étang ou d'un parc nommé en prend la nature.
          kind: lap.kind === "path" && label ? label.kind : lap.kind,
          name: label?.name,
          anchor: g.coord(cg.raw[e.node]!),
          approach: approachCoords.length > 0 ? { coords: approachCoords, nodes: cg.rawNodes(approachWalk), lengthM: a } : null,
          lap: { coords: lapCoords, nodes: cg.rawNodes(lapWalk), via: viaPoints(cg, lapWalk, lap.L), lengthM: lap.L, crossings: lapCrossings, offRoad: lap.offRoad },
          laps: n,
          partialM: arc,
          partialNodes: partialWalk.length > 0 ? cg.rawNodes(partialWalk) : [],
          back: backCoords.length > 0 ? { coords: backCoords, nodes: cg.rawNodes(backWalk), lengthM: b } : null,
          exits: (uturn ? reachable : exits).map((p) => ({ m: (p.m - e.m + lap.L) % lap.L, b: fromStart.len[p.node]!, coord: g.coord(cg.raw[p.node]!) })),
          totalM,
          crossings,
          // Le moins d'arrêts par km ; puis le plus de chemins piétons, et peu de tours.
          // Les épingles de l'accès ou du retour (crochets entre deux allées) sont pénalisées.
          score: -stopWeight(crossings) / (totalM / 1000) + 0.5 * lap.offRoad - 0.04 * n - (uturn ? 0.3 : 0) - 0.3 * countHairpins(route),
        });
      }
    }
  }
  found.sort((x, y) => y.score - x.score);
  const result: PlannedCircuit[] = [];
  for (const c of found) {
    if (result.length >= opts.count) break;
    // Un seul parcours par tour.
    if (result.some((r) => r.lap.lengthM === c.lap.lengthM)) continue;
    result.push(c);
  }
  return result;
}

/**
 * Nom du lieu : une étiquette (étang, parc, jardin) au cœur du tour. Un nom posé dans
 * un coin de la boucle désignerait un autre lieu que celui dont on fait le tour.
 */
function labelOf(lap: LapCandidate, labels: readonly NetworkLabel[] = []): NetworkLabel | undefined {
  let cx = 0;
  let cy = 0;
  for (const c of lap.coords) {
    cx += c[0];
    cy += c[1];
  }
  const center: LngLat = [cx / lap.coords.length, cy / lap.coords.length];
  const kx = 111_320 * Math.cos((center[1] * Math.PI) / 180);
  // Rayon d'un cercle de même périmètre.
  const radius = lap.L / (2 * Math.PI);
  const central = labels.filter(
    (l) => inside(l.coord, lap.coords) && Math.hypot((l.coord[0] - center[0]) * kx, (l.coord[1] - center[1]) * 111_320) <= 0.6 * radius,
  );
  return central.find((l) => (lap.kind === "water" ? l.kind === "water" : l.kind === "park")) ?? central[0];
}
