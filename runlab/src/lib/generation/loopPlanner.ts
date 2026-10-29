/**
 * Planification de boucles sur le réseau piéton local.
 *
 * Principe : autour du départ, une cinquantaine de points de passage possibles sur
 * des rues « traversantes » (hors impasses). Pour chaque combinaison de 2 ou 3 points,
 * la boucle départ → points → départ est calculée par plus courts chemins, ses
 * allers-retours sont retirés, puis elle est jugée :
 * - distance dans la fourchette demandée (sur le réseau local) ;
 * - pas de rue parcourue deux fois, pas de passage répété au même carrefour (boucle en 8) ;
 * - forme ronde plutôt qu'étirée (rapport aire / périmètre) ;
 * - pas d'épingle (demi-tour sec) ;
 * - en mode record : le moins de traversées de route possible.
 * Les meilleures boucles, de directions différentes, sont retenues.
 */
import { cumulativeDistances, destination } from "@/lib/geo/geo";
import { countRoadCrossings, type RoadLine } from "@/lib/route/crossings";
import { bearing, stopWeight } from "@/lib/route/interruptions";
import type { LngLat } from "@/lib/route/types";
import type { ContractedGraph, ShortestTree, WalkGraph } from "@/lib/network/graph";
import { startNode } from "@/lib/network/router";

export interface PlannedLoop {
  coords: LngLat[];
  /** Nœuds du réseau, du départ au départ (tracé exact pour le moteur interne). */
  nodes: number[];
  lengthM: number;
  /** Points de passage à transmettre au moteur pour qu'il suive cette boucle. */
  via: LngLat[];
  /** Rapport isopérimétrique (1 = cercle). */
  roundness: number;
  /** Part de la longueur parcourue deux fois. */
  retrace: number;
  /** Part du tracé longeant de près une autre portion de la boucle (doigts, pincements). */
  proximity: number;
  crossings?: { crossings: number; majorCrossings: number };
  score: number;
}

export interface PlanOptions {
  /** Distance visée pour UNE boucle (m). */
  targetM: number;
  /** Fourchette acceptée sur le réseau local (marge de sécurité pour le moteur). */
  minM: number;
  maxM: number;
  count: number;
  /** Recherche allégée (petits circuits) : moins de points de passage candidats. */
  light?: boolean;
  /** « Autres propositions » : on saute les boucles déjà proposées (0, 1, 2…). */
  seedOffset?: number;
  /** Mode record : routes (grands axes / petites rues) pour compter les traversées. */
  roads?: readonly RoadLine[];
  /**
   * Boucle à répéter `laps` fois. Une « queue » (même rue au départ et au retour) n'est
   * alors parcourue qu'une fois, comme accès : la fourchette s'applique à la longueur
   * moyenne d'un tour, queue comprise une seule fois.
   */
  laps?: number;
}

/** Rapport typique entre longueur d'une boucle et périmètre du cercle qu'elle suit. */
const DETOUR = 1.25;
const RINGS = [0.3, 0.5, 0.7, 0.9];
const BEARINGS = 16;
const MAX_VIA = 40;

export type Walk = { e: number; fwd: boolean }[];

/** Retire les allers-retours immédiats (impasses) : une arête reprise aussitôt en sens inverse. */
export function despurWalk(walk: Walk): Walk {
  const out: Walk = [];
  for (const step of walk) {
    const top = out[out.length - 1];
    if (top && top.e === step.e && top.fwd !== step.fwd) out.pop();
    else out.push(step);
  }
  return out;
}

export function loopNodes(cg: ContractedGraph, walk: Walk): number[] {
  const nodes: number[] = [];
  for (const { e, fwd } of walk) {
    const edge = cg.edges[e]!;
    if (nodes.length === 0) nodes.push(fwd ? edge.a : edge.b);
    nodes.push(fwd ? edge.b : edge.a);
  }
  return nodes;
}

/** Nombre de demi-tours secs (> 150°) le long du tracé, hors départ et arrivée. */
export function countHairpins(coords: readonly LngLat[]): number {
  const cum = cumulativeDistances(coords);
  const total = cum[cum.length - 1] ?? 0;
  let count = 0;
  let last = -Infinity;
  let j0 = 0;
  let j1 = 0;
  for (let i = 1; i < coords.length - 1; i++) {
    const m = cum[i]!;
    // Près du départ, un virage serré vers la première rue est inévitable.
    if (m < 120 || m > total - 120 || m - last < 60) continue;
    while (cum[j0]! < m - 30) j0++;
    while (j1 < coords.length - 1 && cum[j1]! < m + 30) j1++;
    const back = bearing(coords[i]!, coords[Math.max(0, j0 - 1)]!);
    const fwd = bearing(coords[i]!, coords[j1]!);
    const d = Math.abs(back - fwd) % 360;
    if ((d > 180 ? 360 - d : d) < 30) {
      count++;
      last = m;
    }
  }
  return count;
}

/**
 * Part du tracé qui passe près d'une autre portion de la boucle (à l'échelle de la boucle),
 * éloignée d'au moins trois fois cette distance le long du parcours : « doigts » (aller par une rue, retour par la
 * rue parallèle), pincements, rues reprises. Le voisinage du départ est ignoré.
 */
export function selfProximity(coords: readonly LngLat[], tol?: number): number {
  const cum = cumulativeDistances(coords);
  const total = cum[cum.length - 1] ?? 0;
  // Échelle de la boucle : environ 1/12 de son diamètre.
  const tolM = tol ?? Math.max(70, Math.min(250, total / (12 * Math.PI)));
  const gapM = 3 * tolM;
  if (total < 4 * gapM) return 0;
  const kx = 111_320 * Math.cos((coords[0]![1] * Math.PI) / 180);
  const step = 20;
  const pts: { x: number; y: number; m: number }[] = [];
  let j = 0;
  for (let m = 0; m <= total; m += step) {
    while (j < cum.length - 2 && cum[j + 1]! < m) j++;
    const span = cum[j + 1]! - cum[j]!;
    const t = span > 0 ? (m - cum[j]!) / span : 0;
    const a = coords[j]!;
    const b = coords[j + 1]!;
    pts.push({
      x: (a[0] + (b[0] - a[0]) * t) * kx,
      y: (a[1] + (b[1] - a[1]) * t) * 111_320,
      m,
    });
  }
  const grid = new Map<string, number[]>();
  pts.forEach((p, i) => {
    const k = `${Math.floor(p.x / tolM)}:${Math.floor(p.y / tolM)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  });
  const nearStart = (m: number) => m < 200 || m > total - 200;
  let close = 0;
  for (const p of pts) {
    if (nearStart(p.m)) continue;
    const gx = Math.floor(p.x / tolM);
    const gy = Math.floor(p.y / tolM);
    let hit = false;
    for (let dx = -1; dx <= 1 && !hit; dx++) {
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (const i of grid.get(`${gx + dx}:${gy + dy}`) ?? []) {
          const q = pts[i]!;
          const along = Math.abs(q.m - p.m);
          if (Math.min(along, total - along) < gapM || nearStart(q.m)) continue;
          if (Math.hypot(q.x - p.x, q.y - p.y) <= tolM) {
            hit = true;
            break;
          }
        }
      }
    }
    if (hit) close++;
  }
  return (close * step) / total;
}

/** Changements de direction nets (> 50°) par kilomètre, mesurés sur ±15 m. */
export function turnsPerKm(coords: readonly LngLat[]): number {
  const cum = cumulativeDistances(coords);
  const total = cum[cum.length - 1] ?? 0;
  if (total < 100) return 0;
  let turns = 0;
  let last = -Infinity;
  let j0 = 0;
  let j1 = 0;
  for (let i = 1; i < coords.length - 1; i++) {
    const m = cum[i]!;
    if (m - last < 25) continue;
    while (cum[j0]! < m - 15) j0++;
    while (j1 < coords.length - 1 && cum[j1]! < m + 15) j1++;
    const inB = bearing(coords[Math.max(0, j0 - 1)]!, coords[i]!);
    const outB = bearing(coords[i]!, coords[j1]!);
    const d = Math.abs(inB - outB) % 360;
    if ((d > 180 ? 360 - d : d) > 50) {
      turns++;
      last = m;
    }
  }
  return turns / (total / 1000);
}

export function viaPoints(cg: ContractedGraph, walk: Walk, lengthM: number): LngLat[] {
  const spacing = Math.max(200, lengthM / MAX_VIA);
  const out: LngLat[] = [];
  let acc = 0;
  let next = spacing / 2;
  for (const { e, fwd } of walk) {
    const edge = cg.edges[e]!;
    const mid = acc + edge.len / 2;
    if (mid >= next && edge.len >= 30 && mid > 80 && mid < lengthM - 80) {
      // Milieu de l'arête : sur la voie elle-même, loin des carrefours.
      const nodes = fwd ? edge.nodes : [...edge.nodes].reverse();
      const pts = nodes.map((n) => cg.g.coord(n));
      const cum = cumulativeDistances(pts);
      const half = cum[cum.length - 1]! / 2;
      let k = 0;
      while (k < cum.length - 2 && cum[k + 1]! < half) k++;
      const span = cum[k + 1]! - cum[k]!;
      const t = span > 0 ? (half - cum[k]!) / span : 0;
      const a = pts[k]!;
      const b = pts[k + 1]!;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      next = mid + spacing;
    }
    acc += edge.len;
  }
  return out;
}

function edgeShare(a: Walk, b: Walk, cg: ContractedGraph): number {
  const set = new Set(b.map((s) => s.e));
  let shared = 0;
  let total = 0;
  for (const s of a) {
    const l = cg.edges[s.e]!.len;
    total += l;
    if (set.has(s.e)) shared += l;
  }
  return total > 0 ? shared / total : 0;
}

export function planLoops(g: WalkGraph, start: LngLat, opts: PlanOptions): PlannedLoop[] {
  const s = startNode(g, start, 400);
  if (s === null) return [];
  const T = opts.targetM;
  const radius = T / DETOUR / Math.PI;

  // 1. Points de passage possibles, sur des rues hors impasses.
  const cands: number[] = [];
  const rings = opts.light ? [0.35, 0.6, 0.85] : RINGS;
  const bearings = opts.light ? 12 : BEARINGS;
  for (const f of rings) {
    for (let k = 0; k < bearings; k++) {
      const p = destination(start, radius * f, (k * 360) / bearings + f * 40);
      const n = g.snap(p, Math.max(150, radius * 0.15), true);
      if (n !== null && n !== s && !cands.includes(n)) cands.push(n);
    }
  }
  if (cands.length < 3) return [];
  const cg = g.contract([s, ...cands]);
  const cs = cg.index[s]!;
  const cc = cands.map((n) => cg.index[n]!);
  const theta = new Map(cc.map((c, i) => [c, bearing(start, g.coord(cands[i]!))]));
  const trees = new Map<number, ShortestTree>();
  for (const c of [cs, ...cc]) trees.set(c, cg.tree(c, opts.maxM));
  const len = (a: number, b: number) => trees.get(a)!.len[b]!;
  const pathCache = new Map<string, Walk | null>();
  const legs = (a: number, b: number) => {
    const k = `${a}:${b}`;
    if (!pathCache.has(k)) pathCache.set(k, cg.pathEdges(trees.get(a)!, b));
    return pathCache.get(k)!;
  };
  // Sens horaire uniquement : la boucle inverse a la même forme.
  const turn = (a: number, b: number) => (theta.get(b)! - theta.get(a)! + 360) % 360;

  // 2. Combinaisons de 2 ou 3 points, jugées sur le réseau.
  interface Eval {
    walk: Walk;
    L: number;
    retrace: number;
    touches: number;
    roundness: number;
    centroid: number;
    proximity: number;
    score: number;
  }
  const evals: Eval[] = [];
  const aim = (opts.minM + opts.maxM) / 2;
  const evaluate = (seq: number[]) => {
    const raw: Walk = [];
    for (let i = 0; i < seq.length - 1; i++) {
      const leg = legs(seq[i]!, seq[i + 1]!);
      if (!leg) return;
      raw.push(...leg);
    }
    const walk = despurWalk(raw);
    let L = 0;
    let cost = 0;
    const uses = new Map<number, number>();
    for (const st of walk) {
      L += cg.edges[st.e]!.len;
      cost += cg.edges[st.e]!.cost;
      uses.set(st.e, (uses.get(st.e) ?? 0) + 1);
    }
    let stem = 0;
    for (let k = 0; k < walk.length / 2 - 1 && walk[k]!.e === walk[walk.length - 1 - k]!.e; k++) stem += cg.edges[walk[k]!.e]!.len;
    // Plusieurs tours : la queue n'est parcourue qu'une fois (aller et retour).
    const laps = opts.laps ?? 1;
    const perLap = L - 2 * stem + (2 * stem) / laps;
    if (perLap < opts.minM || perLap > opts.maxM) return;
    let re = 0;
    for (const [e, n] of uses) if (n > 1) re += cg.edges[e]!.len * (n - 1);
    const retrace = re / L;
    if (retrace > 0.08) return;
    const nodes = loopNodes(cg, walk);
    const seen = new Set<number>();
    let touches = 0;
    for (let i = 1; i < nodes.length - 1; i++) {
      if (seen.has(nodes[i]!)) touches++;
      seen.add(nodes[i]!);
    }
    // Forme : aire du polygone des carrefours / périmètre réel.
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < nodes.length; i++) {
      const p = cg.raw[nodes[i]!]!;
      const q = cg.raw[nodes[(i + 1) % nodes.length]!]!;
      area += g.x(p) * g.y(q) - g.x(q) * g.y(p);
      cx += g.lon[p]!;
      cy += g.lat[p]!;
    }
    const roundness = (4 * Math.PI * Math.abs(area / 2)) / (L * L);
    const centroid = bearing(start, [cx / nodes.length, cy / nodes.length]);
    // Plusieurs tours : une queue oblige à un accès ; on préfère les boucles qui en sont dépourvues.
    // Agrément : le coût moyen des voies (grands axes, terre… selon le profil) par rapport
    // à la longueur. 1 = rues calmes ; au-dessus, la boucle emprunte des voies évitées.
    const unpleasant = Math.max(0, cost / L - 1);
    const score =
      roundness - 4 * retrace - 0.15 * touches - Math.abs(perLap - aim) / aim - (laps > 1 ? (4 * stem) / L : 0) - 1.5 * unpleasant;
    evals.push({
      walk,
      L,
      retrace,
      touches,
      roundness,
      centroid,
      proximity: 0,
      score,
    });
  };
  for (const i of cc) {
    if (!Number.isFinite(len(cs, i))) continue;
    for (const j of cc) {
      const tij = turn(i, j);
      if (j === i || tij < 15 || tij > 200) continue;
      const lij = len(cs, i) + len(i, j);
      if (!Number.isFinite(lij) || lij > T * 1.4) continue;
      const l2 = lij + len(j, cs);
      if (l2 >= T * 0.98 && l2 <= T * 1.4) evaluate([cs, i, j, cs]);
      for (const k of cc) {
        const tjk = turn(j, k);
        if (k === i || k === j || tjk < 15 || tjk > 200 || tij + tjk > 330) continue;
        const l3 = lij + len(j, k) + len(k, cs);
        if (l3 >= T * 0.98 && l3 <= T * 1.4) evaluate([cs, i, j, k, cs]);
      }
    }
  }
  evals.sort((a, b) => b.score - a.score);

  // 3. Doigts et pincements, sur la géométrie réelle des meilleures candidates.
  const pool = evals.slice(0, 600);
  const coordsOf = new Map<Eval, LngLat[]>();
  for (const ev of pool) {
    const coords = cg.coords(ev.walk);
    coordsOf.set(ev, coords);
    ev.proximity = selfProximity(coords);
    // Tracé fluide : peu de virages (les allées en zigzag des lotissements cassent le rythme).
    ev.score -= 4 * ev.proximity + 0.04 * turnsPerKm(coords);
  }
  pool.sort((a, b) => b.score - a.score);
  if (opts.roads) pool.length = Math.min(pool.length, 200);
  // Mode record : les traversées départagent les meilleures formes.
  const crossingsOf = new Map<Eval, { crossings: number; majorCrossings: number }>();
  if (opts.roads) {
    for (const ev of pool) {
      const c = countRoadCrossings(coordsOf.get(ev)!, opts.roads);
      crossingsOf.set(ev, c);
      ev.score -= (stopWeight(c) / (ev.L / 1000)) * 0.6;
    }
    pool.sort((a, b) => b.score - a.score);
  }

  // 4. Sélection : belles formes, directions et rues différentes.
  const chosen: { ev: Eval; coords: LngLat[] }[] = [];
  const skip = (opts.seedOffset ?? 0) * opts.count;
  const wanted = skip + opts.count;
  const rejected = new Set<Eval>();
  // 1er passage : directions bien distinctes ; 2e : d'autres rues ; 3e, en dernier recours :
  // boucles avec un demi-tour serré.
  for (const [gap, maxShare, allowHairpin] of [
    [360 / (wanted + 3), 0.5, false],
    [0, 0.7, false],
    [0, 0.7, true],
  ] as const) {
    for (const ev of pool) {
      if (chosen.length >= wanted) break;
      if ((rejected.has(ev) && !allowHairpin) || chosen.some((c) => c.ev === ev)) continue;
      const angleOk = chosen.every((c) => {
        const d = Math.abs(c.ev.centroid - ev.centroid) % 360;
        return (d > 180 ? 360 - d : d) >= gap;
      });
      if (!angleOk || chosen.some((c) => edgeShare(ev.walk, c.ev.walk, cg) > maxShare)) continue;
      const coords = coordsOf.get(ev)!;
      if (!allowHairpin && countHairpins(coords) > 0) {
        rejected.add(ev);
        continue;
      }
      chosen.push({ ev, coords });
    }
  }
  return chosen.slice(skip).map(({ ev, coords }) => ({
    coords,
    nodes: cg.rawNodes(ev.walk),
    lengthM: ev.L,
    via: viaPoints(cg, ev.walk, ev.L),
    roundness: ev.roundness,
    retrace: ev.retrace,
    proximity: ev.proximity,
    crossings: crossingsOf.get(ev),
    score: ev.score,
  }));
}
