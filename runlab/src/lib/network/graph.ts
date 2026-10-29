/**
 * Réseau piéton local, construit à partir des lignes OpenStreetMap des tuiles
 * vectorielles (rues, chemins, sentiers). Il sert à PLANIFIER les boucles : on y
 * calcule des milliers de boucles possibles sans consommer de quota, puis le moteur
 * de routage ne fait que « matérialiser » les meilleures.
 *
 * Étapes :
 * 1. graphe brut (un nœud par sommet de ligne, les carrefours partagés sont fusionnés) ;
 * 2. raccord des jonctions en T dont le point commun manque dans les tuiles ;
 * 3. composante principale et « 2-cœur » (le réseau sans ses impasses) ;
 * 4. contraction des chaînes de nœuds de degré 2 en arêtes uniques (calcul rapide).
 */
import type { LngLat } from "@/lib/route/types";

/** Ligne du réseau, telle que lue dans la couche « transportation » des tuiles. */
export interface NetworkLine {
  coords: LngLat[];
  /** Classe OpenMapTiles : primary, secondary, tertiary, minor, service, track, path… */
  cls: string;
  subclass?: string;
  brunnel?: string;
  surface?: string;
  access?: string;
  /** Accès piéton (« no » : interdit aux piétons). */
  foot?: string;
  /** Type de voie de service (driveway, parking_aisle…). */
  service?: string;
  /** Nom de la voie (rue, allée…), si la carte en donne un. */
  name?: string;
}

/**
 * Lieu remarquable autour duquel on peut tourner : plan d'eau ou parc (contour approché
 * par ses sommets ; un même lieu découpé entre plusieurs tuiles est regroupé par `key`).
 */
export interface NetworkArea {
  kind: AreaKind;
  key: string;
  /** Contour extérieur (ou morceau de contour, pour un lieu découpé entre tuiles). */
  points: LngLat[];
}

/** Plan d'eau, parc ou bois. */
export type AreaKind = "water" | "park" | "wood";

/** Nom d'un lieu (étang, parc, jardin…), placé en un point. */
export interface NetworkLabel {
  name: string;
  kind: "water" | "park";
  coord: LngLat;
}

/** Réseau piéton et lieux remarquables d'une zone. */
export interface NetworkData {
  lines: NetworkLine[];
  areas: NetworkArea[];
  labels?: NetworkLabel[];
}

/** Classes praticables à pied (les autoroutes et voies express sont exclues). */
export const WALKABLE = new Set(["primary", "secondary", "tertiary", "minor", "service", "track", "path"]);

const R = 6_371_008.8;
const KEY_SCALE = 2e5; // ≈ 0,5 m : fusion des sommets identiques d'une tuile à l'autre
const HEAL_M = 3;

/** Coût relatif d'une ligne selon les préférences (1 = neutre, > 1 = évité). */
export type CostFactor = (line: NetworkLine) => number | null;

export class WalkGraph {
  readonly lon: number[] = [];
  readonly lat: number[] = [];
  /** Arêtes brutes : extrémités, longueur (m), facteur de coût, ligne d'origine. */
  readonly ea: number[] = [];
  readonly eb: number[] = [];
  readonly elen: number[] = [];
  readonly efac: number[] = [];
  readonly eline: number[] = [];
  readonly adj: number[][] = [];
  private readonly keys = new Map<string, number>();
  private readonly pairs = new Set<string>();
  readonly kx: number;
  readonly ky = (Math.PI / 180) * R;
  /** Nœuds de la composante principale. */
  main: Uint8Array = new Uint8Array(0);
  /** Nœuds du 2-cœur (hors impasses). */
  core: Uint8Array = new Uint8Array(0);
  private grid = new Map<string, number[]>();

  constructor(
    readonly lines: readonly NetworkLine[],
    factor: CostFactor,
    refLat: number,
  ) {
    this.kx = (Math.PI / 180) * R * Math.cos((refLat * Math.PI) / 180);
    lines.forEach((line, li) => {
      const f = factor(line);
      if (f === null) return;
      let prev = -1;
      for (const c of line.coords) {
        const n = this.node(c);
        if (prev >= 0 && prev !== n) this.addEdge(prev, n, f, li);
        prev = n;
      }
    });
    this.heal();
    this.computeMain();
    this.computeCore();
    for (let i = 0; i < this.lon.length; i++) {
      if (!this.main[i]) continue;
      const k = this.cellKey(this.x(i), this.y(i), 100);
      (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(i);
    }
  }

  get size() {
    return this.lon.length;
  }

  x(i: number) {
    return this.lon[i]! * this.kx;
  }
  y(i: number) {
    return this.lat[i]! * this.ky;
  }
  coord(i: number): LngLat {
    return [this.lon[i]!, this.lat[i]!];
  }

  private cellKey(x: number, y: number, cell: number) {
    return `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
  }

  private node(c: LngLat): number {
    const key = `${Math.round(c[0] * KEY_SCALE)}:${Math.round(c[1] * KEY_SCALE)}`;
    let n = this.keys.get(key);
    if (n === undefined) {
      n = this.lon.length;
      this.keys.set(key, n);
      this.lon.push(c[0]);
      this.lat.push(c[1]);
      this.adj.push([]);
    }
    return n;
  }

  private dist(a: number, b: number) {
    return Math.hypot(this.x(a) - this.x(b), this.y(a) - this.y(b));
  }

  private addEdge(a: number, b: number, fac: number, line: number) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (this.pairs.has(key)) return; // doublon (recouvrement des tuiles)
    this.pairs.add(key);
    const e = this.ea.length;
    this.ea.push(a);
    this.eb.push(b);
    this.elen.push(Math.max(0.05, this.dist(a, b)));
    this.efac.push(fac);
    this.eline.push(line);
    this.adj[a]!.push(e);
    this.adj[b]!.push(e);
  }

  private removeEdge(e: number) {
    const a = this.ea[e]!;
    const b = this.eb[e]!;
    this.adj[a] = this.adj[a]!.filter((x) => x !== e);
    this.adj[b] = this.adj[b]!.filter((x) => x !== e);
    this.pairs.delete(a < b ? `${a}:${b}` : `${b}:${a}`);
  }

  other(e: number, n: number) {
    return this.ea[e] === n ? this.eb[e]! : this.ea[e]!;
  }

  /** Relie les extrémités de ligne posées sur une autre ligne sans sommet commun. */
  private heal() {
    const cell = 20;
    const segs = new Map<string, number[]>();
    for (let e = 0; e < this.ea.length; e++) {
      const a = this.ea[e]!;
      const b = this.eb[e]!;
      for (let gx = Math.floor(Math.min(this.x(a), this.x(b)) / cell); gx <= Math.floor(Math.max(this.x(a), this.x(b)) / cell); gx++) {
        for (let gy = Math.floor(Math.min(this.y(a), this.y(b)) / cell); gy <= Math.floor(Math.max(this.y(a), this.y(b)) / cell); gy++) {
          const k = `${gx}:${gy}`;
          (segs.get(k) ?? segs.set(k, []).get(k)!).push(e);
        }
      }
    }
    const ends: number[] = [];
    for (let i = 0; i < this.adj.length; i++) if (this.adj[i]!.length === 1) ends.push(i);
    for (const i of ends) {
      const px = this.x(i);
      const py = this.y(i);
      let best: { d: number; e: number; t: number } | null = null;
      for (let gx = Math.floor(px / cell) - 1; gx <= Math.floor(px / cell) + 1; gx++) {
        for (let gy = Math.floor(py / cell) - 1; gy <= Math.floor(py / cell) + 1; gy++) {
          for (const e of segs.get(`${gx}:${gy}`) ?? []) {
            const a = this.ea[e]!;
            const b = this.eb[e]!;
            if (a === i || b === i || !this.adj[a]!.includes(e)) continue;
            const dx = this.x(b) - this.x(a);
            const dy = this.y(b) - this.y(a);
            const l2 = dx * dx + dy * dy;
            const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - this.x(a)) * dx + (py - this.y(a)) * dy) / l2)) : 0;
            const d = Math.hypot(px - this.x(a) - dx * t, py - this.y(a) - dy * t);
            if (d <= HEAL_M && (!best || d < best.d)) best = { d, e, t };
          }
        }
      }
      if (!best) continue;
      const { e, t } = best;
      const a = this.ea[e]!;
      const b = this.eb[e]!;
      const fac = this.efac[e]!;
      const line = this.eline[e]!;
      let j: number;
      if (t < 0.05) j = a;
      else if (t > 0.95) j = b;
      else {
        j = this.lon.length;
        this.lon.push(this.lon[a]! + (this.lon[b]! - this.lon[a]!) * t);
        this.lat.push(this.lat[a]! + (this.lat[b]! - this.lat[a]!) * t);
        this.adj.push([]);
        this.removeEdge(e);
        this.addEdge(a, j, fac, line);
        this.addEdge(j, b, fac, line);
      }
      if (j !== i) this.addEdge(i, j, this.efac[this.adj[i]![0]!] ?? 1, this.eline[this.adj[i]![0]!] ?? line);
    }
  }

  private computeMain() {
    const n = this.lon.length;
    const comp = new Int32Array(n).fill(-1);
    let best = -1;
    let bestSize = 0;
    let c = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] !== -1 || this.adj[s]!.length === 0) continue;
      const stack = [s];
      comp[s] = c;
      let size = 0;
      while (stack.length) {
        const u = stack.pop()!;
        size++;
        for (const e of this.adj[u]!) {
          const v = this.other(e, u);
          if (comp[v] === -1) {
            comp[v] = c;
            stack.push(v);
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        best = c;
      }
      c++;
    }
    this.main = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (comp[i] === best) this.main[i] = 1;
  }

  private computeCore() {
    const n = this.lon.length;
    const deg = new Int32Array(n);
    const alive = new Uint8Array(n);
    const stack: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!this.main[i]) continue;
      deg[i] = this.adj[i]!.length;
      alive[i] = 1;
      if (deg[i]! <= 1) stack.push(i);
    }
    while (stack.length) {
      const u = stack.pop()!;
      if (!alive[u]) continue;
      alive[u] = 0;
      for (const e of this.adj[u]!) {
        const v = this.other(e, u);
        if (alive[v] && --deg[v]! === 1) stack.push(v);
      }
    }
    this.core = alive;
  }

  /** Nœud le plus proche (composante principale, éventuellement limité au 2-cœur). */
  snap(p: LngLat, radiusM: number, coreOnly = false): number | null {
    const px = p[0] * this.kx;
    const py = p[1] * this.ky;
    const r = Math.ceil(radiusM / 100);
    let best = -1;
    let bestD = radiusM;
    for (let gx = Math.floor(px / 100) - r; gx <= Math.floor(px / 100) + r; gx++) {
      for (let gy = Math.floor(py / 100) - r; gy <= Math.floor(py / 100) + r; gy++) {
        for (const i of this.grid.get(`${gx}:${gy}`) ?? []) {
          if (coreOnly && !this.core[i]) continue;
          const d = Math.hypot(this.x(i) - px, this.y(i) - py);
          if (d <= bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best >= 0 ? best : null;
  }

  /** Nœuds de la composante principale à moins de `radiusM` d'un point, avec leur distance. */
  nodesNear(p: LngLat, radiusM: number): { n: number; d: number }[] {
    const px = p[0] * this.kx;
    const py = p[1] * this.ky;
    const r = Math.ceil(radiusM / 100);
    const out: { n: number; d: number }[] = [];
    for (let gx = Math.floor(px / 100) - r; gx <= Math.floor(px / 100) + r; gx++) {
      for (let gy = Math.floor(py / 100) - r; gy <= Math.floor(py / 100) + r; gy++) {
        for (const i of this.grid.get(`${gx}:${gy}`) ?? []) {
          const d = Math.hypot(this.x(i) - px, this.y(i) - py);
          if (d <= radiusM) out.push({ n: i, d });
        }
      }
    }
    return out;
  }

  /** Graphe contracté : les chaînes de degré 2 deviennent des arêtes uniques. */
  contract(keep: Iterable<number>): ContractedGraph {
    return new ContractedGraph(this, new Set(keep));
  }
}

export interface CEdge {
  a: number;
  b: number;
  len: number;
  cost: number;
  /** Nœuds bruts de a vers b. */
  nodes: number[];
}

export class ContractedGraph {
  /** Nœud brut → indice contracté (-1 si contracté dans une arête). */
  readonly index: Int32Array;
  readonly raw: number[] = [];
  readonly edges: CEdge[] = [];
  readonly adj: number[][] = [];

  constructor(
    readonly g: WalkGraph,
    keep: Set<number>,
  ) {
    const n = g.size;
    this.index = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      if (!g.main[i]) continue;
      if (g.adj[i]!.length !== 2 || keep.has(i)) {
        this.index[i] = this.raw.length;
        this.raw.push(i);
        this.adj.push([]);
      }
    }
    // Boucles isolées sans nœud conservé : on en garde un nœud.
    const seen = new Uint8Array(g.ea.length);
    const walkFrom = (start: number, e0: number) => {
      const nodes = [start];
      let len = 0;
      let cost = 0;
      let e = e0;
      let u = start;
      for (;;) {
        seen[e] = 1;
        len += g.elen[e]!;
        cost += g.elen[e]! * g.efac[e]!;
        const v = g.other(e, u);
        nodes.push(v);
        if (this.index[v]! >= 0) break;
        const next = g.adj[v]!.find((x) => x !== e);
        if (next === undefined || seen[next]) break;
        u = v;
        e = next;
      }
      const end = nodes[nodes.length - 1]!;
      if (this.index[end]! < 0 || end === start && nodes.length < 3) return;
      const ce = this.edges.length;
      this.edges.push({ a: this.index[start]!, b: this.index[end]!, len, cost, nodes });
      this.adj[this.index[start]!]!.push(ce);
      if (end !== start) this.adj[this.index[end]!]!.push(ce);
    };
    for (const r of this.raw) for (const e of g.adj[r]!) if (!seen[e]) walkFrom(r, e);
  }

  get size() {
    return this.raw.length;
  }

  other(ce: number, c: number) {
    const e = this.edges[ce]!;
    return e.a === c ? e.b : e.a;
  }

  /** Plus courts chemins (selon le coût) depuis `src` : coût, longueur réelle, arête précédente. */
  /**
   * @param opts.cost coût de chaque arête contractée (par défaut : préférences du graphe)
   * @param opts.banned arête interdite (pour trouver une boucle passant par elle)
   */
  tree(src: number, maxLenM = Infinity, opts: { cost?: Float64Array; banned?: number } = {}): ShortestTree {
    const n = this.raw.length;
    const cost = new Float64Array(n).fill(Infinity);
    const len = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    cost[src] = 0;
    len[src] = 0;
    const heap = new MinHeap();
    heap.push(src, 0);
    while (heap.size) {
      const [u, d] = heap.pop();
      if (d > cost[u]!) continue;
      // Au-delà de la longueur utile, inutile d'explorer plus loin.
      if (len[u]! > maxLenM) continue;
      for (const ce of this.adj[u]!) {
        if (ce === opts.banned) continue;
        const e = this.edges[ce]!;
        const v = e.a === u ? e.b : e.a;
        const nd = d + (opts.cost ? opts.cost[ce]! : e.cost);
        if (nd < cost[v]!) {
          cost[v] = nd;
          len[v] = len[u]! + e.len;
          prev[v] = ce;
          heap.push(v, nd);
        }
      }
    }
    return { src, cost, len, prev };
  }

  /** Arêtes (orientées) du chemin src → dst, d'après l'arbre de src. */
  pathEdges(t: ShortestTree, dst: number): { e: number; fwd: boolean }[] | null {
    if (!Number.isFinite(t.len[dst]!)) return null;
    const out: { e: number; fwd: boolean }[] = [];
    let v = dst;
    while (v !== t.src) {
      const ce = t.prev[v]!;
      const e = this.edges[ce]!;
      // On arrive en v par l'arête ce : sens « a → b » si v est b.
      const fwd = e.b === v;
      out.push({ e: ce, fwd });
      v = fwd ? e.a : e.b;
    }
    return out.reverse();
  }

  /** Coordonnées d'une suite d'arêtes orientées. */
  coords(walk: readonly { e: number; fwd: boolean }[]): LngLat[] {
    return this.rawNodes(walk).map((n) => this.g.coord(n));
  }

  /** Nœuds bruts (réseau complet) d'une suite d'arêtes orientées. */
  rawNodes(walk: readonly { e: number; fwd: boolean }[]): number[] {
    const out: number[] = [];
    for (const { e, fwd } of walk) {
      const nodes = this.edges[e]!.nodes;
      const seq = fwd ? nodes : [...nodes].reverse();
      for (let i = out.length === 0 ? 0 : 1; i < seq.length; i++) out.push(seq[i]!);
    }
    return out;
  }
}

export interface ShortestTree {
  src: number;
  cost: Float64Array;
  len: Float64Array;
  prev: Int32Array;
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      ids[i] = ids[p]!;
      keys[i] = keys[p]!;
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): [number, number] {
    const ids = this.ids;
    const keys = this.keys;
    const top: [number, number] = [ids[0]!, keys[0]!];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    if (ids.length > 0) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r]! < keys[l]! ? r : l;
        if (keys[c]! >= lastKey) break;
        ids[i] = ids[c]!;
        keys[i] = keys[c]!;
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}
