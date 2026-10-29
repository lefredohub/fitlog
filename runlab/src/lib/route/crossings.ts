/**
 * Comptage des traversées de route d'un parcours, à partir du réseau routier
 * OpenStreetMap (tuiles vectorielles).
 *
 * Modèle « trottoir » : un coureur court d'un côté de la rue. À chaque carrefour,
 * il ne traverse que les rues qui partent du côté où il se trouve ; il peut changer
 * de côté, mais cela coûte une traversée de la rue qu'il suit. On retient le choix
 * de côtés le plus favorable sur tout le parcours (programmation dynamique) :
 * - une rue coupée (qui part des deux côtés) compte toujours ;
 * - une rue latérale ne compte que si l'on court de son côté ;
 * - tourner dans une rue en restant sur le trottoir intérieur ne coûte rien ;
 * - un demi-tour inverse les côtés (le trottoir de gauche devient celui de droite).
 * Ponts, tunnels et simples voies de service ne comptent pas.
 * C'est une estimation : elle sert surtout à comparer les propositions entre elles.
 */
import { cumulativeDistances, pointAtDistance } from "@/lib/geo/geo";
import type { NetworkLine } from "@/lib/network/graph";
import { lineAngle } from "./interruptions";
import type { LngLat, Position } from "./types";

export type RoadClass = "major" | "minor";

export interface RoadLine {
  coords: LngLat[];
  cls: RoadClass;
  /**
   * Pont ou tunnel (route ou passerelle) : jamais traversé ; et si le tracé l'emprunte,
   * les routes croisées dessous ou dessus ne sont pas traversées non plus.
   */
  grade: boolean;
}

export interface CrossingCount {
  crossings: number;
  majorCrossings: number;
  /** Emplacement de chaque traversée, dans l'ordre du parcours. */
  points: LngLat[];
}

/** Contact tracé / route à moins de cette distance (m). */
const TOUCH_M = 4;
/** En dessous de cet angle, le tracé suit la route au lieu de la croiser (degrés). */
const ALIGNED_DEG = 30;
/** Contacts regroupés en un seul carrefour (chaussées séparées, rues découpées). */
const JUNCTION_M = 12;
/** Distance pour mesurer la direction d'une branche ou du tracé (m). */
const ARM_M = 15;
/** Longueur minimale d'une branche de rue (m). */
const MIN_ARM_M = 3;
/** Deux branches plus proches que cet angle sont la même (degrés). */
const SAME_ARM_DEG = 25;
/** Coût d'une traversée selon le type de route (pour le choix des côtés). */
const COST: Record<RoadClass, number> = { minor: 1, major: 3 };
const CELL_M = 60;

type XY = [number, number];

function projector(refLat: number) {
  const kx = (Math.PI / 180) * 6_371_008.8 * Math.cos((refLat * Math.PI) / 180);
  const ky = (Math.PI / 180) * 6_371_008.8;
  return (p: LngLat | Position): XY => [p[0] * kx, p[1] * ky];
}

function bearingXY(a: XY, b: XY): number {
  return ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Distance du point p au segment ab, et paramètre t de la projection. */
function distToSegment(p: XY, a: XY, b: XY): { d: number; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return { d: Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)), t };
}

/** Intersection de deux segments : paramètres t (premier) et u (second), ou null. */
function intersect(a: XY, b: XY, c: XY, d: XY): { t: number; u: number } | null {
  const r: XY = [b[0] - a[0], b[1] - a[1]];
  const s: XY = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

/** Point situé à `m` mètres le long d'une polyligne (bornes comprises). */
function pointAlong(pts: readonly XY[], cum: readonly number[], m: number): XY {
  const total = cum[cum.length - 1]!;
  const d = Math.max(0, Math.min(total, m));
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1]! < d) i++;
  const span = cum[i + 1]! - cum[i]!;
  const t = span > 0 ? (d - cum[i]!) / span : 0;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function cumXY(pts: readonly XY[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return out;
}

interface Road {
  pts: XY[];
  cum: number[];
  cls: RoadClass;
  grade: boolean;
}

interface Contact {
  /** Position le long du tracé (m). */
  at: number;
  road: number;
  /** Position le long de la route (m). */
  roadM: number;
  point: XY;
}

interface Arm {
  bearing: number;
  cls: RoadClass;
}

type Step = { kind: "junction"; at: number; right: Arm[]; left: Arm[]; onRoad: RoadClass | null } | { kind: "uturn"; at: number };

interface State {
  cost: number;
  crossings: number;
  major: number;
  /** Positions des traversées le long du tracé (m). */
  at: number[];
}

function addArms(s: State, arms: readonly Arm[], at: number): State {
  if (arms.length === 0) return s;
  let { cost, crossings, major } = s;
  for (const a of arms) {
    cost += COST[a.cls];
    crossings++;
    if (a.cls === "major") major++;
  }
  return { cost, crossings, major, at: [...s.at, ...arms.map(() => at)] };
}

const better = (a: State, b: State) => (a.cost !== b.cost ? a.cost < b.cost : a.crossings <= b.crossings);

interface RoadIndex {
  proj: (p: LngLat | Position) => XY;
  roads: Road[];
  grid: Map<string, { road: number; seg: number }[]>;
}

/** Index spatial des routes, construit une fois par jeu de routes (réutilisé entre tracés). */
const indexCache = new WeakMap<readonly RoadLine[], RoadIndex>();

function roadIndex(roadLines: readonly RoadLine[], refLat: number): RoadIndex {
  const cached = indexCache.get(roadLines);
  if (cached) return cached;
  const proj = projector(roadLines[0]?.coords[0]?.[1] ?? refLat);
  const roads: Road[] = roadLines
    .filter((r) => r.coords.length >= 2)
    .map((r) => {
      const p = r.coords.map(proj);
      return { pts: p, cum: cumXY(p), cls: r.cls, grade: r.grade };
    });
  const grid = new Map<string, { road: number; seg: number }[]>();
  roads.forEach((road, ri) => {
    for (let k = 0; k < road.pts.length - 1; k++) {
      const a = road.pts[k]!;
      const b = road.pts[k + 1]!;
      for (let gx = Math.floor(Math.min(a[0], b[0]) / CELL_M); gx <= Math.floor(Math.max(a[0], b[0]) / CELL_M); gx++) {
        for (let gy = Math.floor(Math.min(a[1], b[1]) / CELL_M); gy <= Math.floor(Math.max(a[1], b[1]) / CELL_M); gy++) {
          const key = `${gx}:${gy}`;
          (grid.get(key) ?? grid.set(key, []).get(key)!).push({ road: ri, seg: k });
        }
      }
    }
  });
  const index = { proj, roads, grid };
  indexCache.set(roadLines, index);
  return index;
}

export function countRoadCrossings(route: readonly Position[], roadLines: readonly RoadLine[]): CrossingCount {
  if (route.length < 2) return { crossings: 0, majorCrossings: 0, points: [] };
  const { proj, roads, grid } = roadIndex(roadLines, route[0]![1]);
  const pts = route.map(proj);
  const cum = cumulativeDistances(route);
  const total = cum[cum.length - 1]!;

  /** Route suivie par le tracé à cet endroit (null : chemin, parc, voie piétonne). */
  const followedRoad = (p: XY, routeBearing: number, grade = false): RoadClass | null => {
    let found: RoadClass | null = null;
    const near = [-TOUCH_M, TOUCH_M].flatMap((dx) => [-TOUCH_M, TOUCH_M].map((dy) => `${Math.floor((p[0] + dx) / CELL_M)}:${Math.floor((p[1] + dy) / CELL_M)}`));
    for (const { road: ri, seg: k } of [...new Set(near)].flatMap((key) => grid.get(key) ?? [])) {
      const road = roads[ri]!;
      if (road.grade !== grade) continue;
      const a = road.pts[k]!;
      const b = road.pts[k + 1]!;
      if (distToSegment(p, a, b).d > TOUCH_M || lineAngle(routeBearing, bearingXY(a, b)) >= ALIGNED_DEG) continue;
      if (found === null || road.cls === "major") found = road.cls;
    }
    return found;
  };

  // 1. Contacts entre le tracé et les routes qui le croisent (pas celles qu'il suit).
  const contacts: Contact[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    const segLen = cum[i + 1]! - cum[i]!;
    if (segLen < 0.5) continue;
    const routeBearing = bearingXY(p, q);
    const seen = new Set<string>();
    for (let gx = Math.floor((Math.min(p[0], q[0]) - TOUCH_M) / CELL_M); gx <= Math.floor((Math.max(p[0], q[0]) + TOUCH_M) / CELL_M); gx++) {
      for (let gy = Math.floor((Math.min(p[1], q[1]) - TOUCH_M) / CELL_M); gy <= Math.floor((Math.max(p[1], q[1]) + TOUCH_M) / CELL_M); gy++) {
        for (const { road: ri, seg: k } of grid.get(`${gx}:${gy}`) ?? []) {
          const id = `${ri}:${k}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const road = roads[ri]!;
          if (road.grade) continue;
          const a = road.pts[k]!;
          const b = road.pts[k + 1]!;
          const segM = road.cum[k + 1]! - road.cum[k]!;
          if (segM < 0.1 || lineAngle(routeBearing, bearingXY(a, b)) < ALIGNED_DEG) continue;
          const add = (t: number, u: number) => {
            // Tracé sur un pont ou dans un tunnel : la route croisée est à un autre niveau.
            if (followedRoad([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], routeBearing, true)) return;
            contacts.push({
              at: cum[i]! + segLen * t,
              road: ri,
              roadM: road.cum[k]! + segM * u,
              point: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u],
            });
          };
          const x = intersect(p, q, a, b);
          if (x) {
            add(x.t, x.u);
            continue;
          }
          // Extrémité de segment de route au contact du tracé (rue qui débouche, carrefour).
          for (const [end, u] of [
            [a, 0],
            [b, 1],
          ] as const) {
            const { d, t } = distToSegment(end, p, q);
            if (d <= TOUCH_M) add(t, u);
          }
          // Point du tracé posé sur la route.
          const { d, t: u } = distToSegment(p, a, b);
          if (d <= TOUCH_M) add(0, u);
        }
      }
    }
  }
  contacts.sort((a, b) => a.at - b.at);

  // 2. Carrefours : contacts regroupés, branches de rue de chaque côté du tracé.
  const steps: Step[] = [];
  for (let c = 0; c < contacts.length; ) {
    const group: Contact[] = [];
    const first = contacts[c]!.at;
    while (c < contacts.length && contacts[c]!.at - first <= JUNCTION_M) group.push(contacts[c++]!);
    const start = group[0]!.at;
    const end = group[group.length - 1]!.at;
    // Départ et arrivée : on choisit librement son trottoir.
    if (start < ARM_M / 2 || end > total - ARM_M / 2) continue;
    const center = pointAlong(pts, cum, (start + end) / 2);
    const inB = bearingXY(center, pointAlong(pts, cum, start - ARM_M));
    const outB = bearingXY(center, pointAlong(pts, cum, end + ARM_M));
    const span = (inB - outB + 360) % 360;
    // Demi-tour au carrefour : on fait demi-tour avant de traverser.
    if (span < SAME_ARM_DEG || span > 360 - SAME_ARM_DEG) continue;

    const arms: Arm[] = [];
    const onRoad = followedRoad(pointAlong(pts, cum, start - ARM_M / 2), inB);
    const seenArm = new Set<string>();
    for (const ct of group) {
      const road = roads[ct.road]!;
      const len = road.cum[road.cum.length - 1]!;
      for (const dir of [1, -1]) {
        const avail = dir > 0 ? len - ct.roadM : ct.roadM;
        if (avail < MIN_ARM_M) continue;
        const key = `${ct.road}:${dir}:${Math.round(ct.roadM)}`;
        if (seenArm.has(key)) continue;
        seenArm.add(key);
        const tip = pointAlong(road.pts, road.cum, ct.roadM + dir * Math.min(ARM_M, avail));
        const b = bearingXY(ct.point, tip);
        // Branches empruntées par le tracé : ce sont les rues que l'on suit.
        if (angleDiff(b, inB) < ALIGNED_DEG || angleDiff(b, outB) < ALIGNED_DEG) continue;
        const same = arms.find((x) => angleDiff(x.bearing, b) < SAME_ARM_DEG);
        if (same) {
          if (road.cls === "major") same.cls = "major";
        } else arms.push({ bearing: b, cls: road.cls });
      }
    }
    if (arms.length === 0) continue;
    // Côté droit : branches rencontrées en tournant dans le sens horaire de la sortie vers l'entrée.
    const right = arms.filter((a) => (a.bearing - outB + 360) % 360 < span);
    const left = arms.filter((a) => (a.bearing - outB + 360) % 360 >= span);
    steps.push({ kind: "junction", at: start, right, left, onRoad });
  }

  // 3. Demi-tours en pleine rue (aller-retour) : le trottoir de droite devient celui de gauche.
  let lastUturn = -Infinity;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = cum[i]!;
    if (m < ARM_M || m > total - ARM_M || m - lastUturn < 2 * ARM_M) continue;
    const here = pts[i]!;
    const back = bearingXY(here, pointAlong(pts, cum, m - ARM_M));
    const fwd = bearingXY(here, pointAlong(pts, cum, m + ARM_M));
    if (angleDiff(back, fwd) < 30) {
      steps.push({ kind: "uturn", at: m });
      lastUturn = m;
    }
  }
  steps.sort((a, b) => a.at - b.at);

  // 4. Choix des côtés le plus favorable (droite / gauche) sur tout le parcours.
  let right: State = { cost: 0, crossings: 0, major: 0, at: [] };
  let left: State = { ...right };
  for (const s of steps) {
    if (s.kind === "uturn") {
      [right, left] = [left, right];
      continue;
    }
    // Changer de trottoir juste avant le carrefour : traverser la rue suivie.
    const switchArm: Arm[] = s.onRoad ? [{ bearing: 0, cls: s.onRoad }] : [];
    const toRight = addArms(left, switchArm, s.at);
    const toLeft = addArms(right, switchArm, s.at);
    const r0 = better(right, toRight) ? right : toRight;
    const l0 = better(left, toLeft) ? left : toLeft;
    right = addArms(r0, s.right, s.at);
    left = addArms(l0, s.left, s.at);
  }
  const best = better(right, left) ? right : left;
  // Plusieurs branches au même carrefour : un seul repère.
  const points = [...new Set(best.at)].map((m) => pointAtDistance(route, cum, m));
  return { crossings: best.crossings, majorCrossings: best.major, points };
}

const MAJOR = new Set(["trunk", "primary", "secondary"]);
const MINOR = new Set(["tertiary", "minor"]);

/** Routes au sens « traversées » : grands axes, petites rues, et ponts/tunnels de toute voie. */
export function roadsFromLines(lines: readonly NetworkLine[]): RoadLine[] {
  const out: RoadLine[] = [];
  for (const l of lines) {
    const grade = l.brunnel === "bridge" || l.brunnel === "tunnel";
    // Ponts et tunnels de toute voie praticable (passerelles comprises) : ils indiquent
    // que le tracé passe au-dessus ou en dessous des routes, sans les traverser.
    const cls: RoadClass | null = MAJOR.has(l.cls) ? "major" : MINOR.has(l.cls) || grade ? "minor" : null;
    if (cls) out.push({ coords: l.coords, cls, grade });
  }
  return out;
}
