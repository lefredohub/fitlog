import { describe, expect, it } from "vitest";
import { destination, pathLength } from "@/lib/geo/geo";
import { GRID_ORIGIN, gridNetwork } from "@/test/grid-network";
import type { LngLat } from "@/lib/route/types";
import { WalkGraph, type NetworkLine } from "./graph";
import { attachEnds, cleanTrace, pathFromTrace, routeThrough, snapToEdge, startNode, traceFromNodes, traceLength } from "./router";

const at = (n: number, e: number): LngLat => destination(destination(GRID_ORIGIN, n, 0), e, 90);
const flat = () => 1;

/** Quadrillage dont les rues portent un nom : « Rue N<i> » (est-ouest), « Rue E<i> » (nord-sud). */
function namedGrid(blockM = 100, halfM = 1000): NetworkLine[] {
  const steps = Math.round(halfM / blockM);
  return gridNetwork(blockM, halfM).map((l, k) => {
    const i = Math.floor(k / 2) - steps;
    return { ...l, name: k % 2 === 0 ? `Rue N${i}` : `Rue E${i}` };
  });
}

describe("moteur interne", () => {
  const g = new WalkGraph(namedGrid(), flat, GRID_ORIGIN[1]);

  it("accroche un point au milieu de la rue la plus proche", () => {
    const s = snapToEdge(g, at(8, 50), 100);
    expect(s).not.toBeNull();
    expect(s!.d).toBeCloseTo(8, 0);
    // Le point accroché est sur la rue (nord = 0), entre deux carrefours.
    const p = s!.point;
    expect(Math.abs(p[1] - GRID_ORIGIN[1]) * 111_320).toBeLessThan(0.5);
  });

  it("calcule le plus court chemin et donne les consignes avec le nom des rues", () => {
    const trace = routeThrough(g, [at(0, 50), at(300, 300)]);
    expect(trace).not.toBeNull();
    const path = pathFromTrace(g, trace!);
    // Distance de Manhattan : 250 m vers l'est puis 300 m vers le nord (ou l'inverse).
    expect(pathLength(path.coordinates)).toBeCloseTo(550, -1);
    expect(path.steps[0]!.maneuver).toBe("depart");
    expect(path.steps[path.steps.length - 1]!.maneuver).toBe("arrive");
    const turns = path.steps.filter((s) => s.maneuver === "left" || s.maneuver === "right");
    expect(turns.length).toBeGreaterThanOrEqual(1);
    for (const t of turns) expect(t.instruction).toMatch(/^Tournez à (gauche|droite) sur Rue [NE]-?\d+$/);
    // Les consignes s'enchaînent sans trou.
    for (let i = 0; i + 1 < path.steps.length; i++) expect(path.steps[i]!.toIndex).toBe(path.steps[i + 1]!.fromIndex);
  });

  it("n'annonce pas « tout droit » aux carrefours où l'on ne change pas de rue", () => {
    const trace = routeThrough(g, [at(0, -450), at(0, 450)]);
    const path = pathFromTrace(g, trace!);
    expect(path.steps.map((s) => s.maneuver)).toEqual(["depart", "arrive"]);
    expect(path.steps[0]!.instruction).toBe("Partez vers l'est sur Rue N0");
  });

  it("une rue qui tourne sans embranchement n'est pas annoncée", () => {
    const bend: NetworkLine[] = [{ coords: [at(0, 0), at(0, 200), at(200, 200)], cls: "minor", name: "Rue Coudée" }];
    const gb = new WalkGraph(bend, flat, GRID_ORIGIN[1]);
    const path = pathFromTrace(gb, routeThrough(gb, [at(0, 10), at(190, 200)])!);
    expect(path.steps.map((s) => s.maneuver)).toEqual(["depart", "arrive"]);
  });

  it("une fourche est précisée (« restez à gauche »)", () => {
    const fork: NetworkLine[] = [
      { coords: [at(0, 0), at(0, 200)], cls: "minor" },
      { coords: [at(0, 200), at(60, 400)], cls: "minor", name: "Rue de Gauche" },
      { coords: [at(0, 200), at(-60, 400)], cls: "minor", name: "Rue de Droite" },
    ];
    const gf = new WalkGraph(fork, flat, GRID_ORIGIN[1]);
    const path = pathFromTrace(gf, routeThrough(gf, [at(0, 10), at(55, 385)])!);
    const step = path.steps.find((s) => s.maneuver !== "depart" && s.maneuver !== "arrive");
    expect(step?.maneuver).toBe("keep-left");
    expect(step?.instruction).toBe("Restez à gauche sur Rue de Gauche");
  });

  it("une épingle sur une autre voie est un virage serré, pas un demi-tour", () => {
    const lines: NetworkLine[] = [
      { coords: [at(0, 0), at(0, 200)], cls: "minor" },
      { coords: [at(0, 200), at(0, 400)], cls: "minor" },
      { coords: [at(0, 200), at(30, 0)], cls: "path" },
    ];
    const gh = new WalkGraph(lines, flat, GRID_ORIGIN[1]);
    const path = pathFromTrace(gh, routeThrough(gh, [at(0, 10), at(28, 15)])!);
    expect(path.steps.map((s) => s.maneuver)).toEqual(["depart", "sharp-left", "arrive"]);
  });

  it("raccorde une boucle planifiée au point de départ réel sans aller-retour", () => {
    // Départ au milieu d'une rue, à 30 m du carrefour (0, 0) ; boucle d'un pâté de maisons.
    const start = at(0, 30);
    const s = startNode(g, start, 200)!;
    expect(g.coord(s)).toEqual(snapToEdge(g, at(0, 0), 1)!.point);
    const ring = [at(0, 0), at(0, 100), at(100, 100), at(100, 0), at(0, 0)].map((p) => g.snap(p, 1)!);
    const { trace, shift } = attachEnds(g, traceFromNodes(g, ring), start);
    // On part vers l'est directement (pas de détour par le carrefour), et on revient au départ.
    expect(traceLength(g, trace)).toBeCloseTo(400, 0);
    expect(trace.pts[0]).toEqual(snapToEdge(g, start, 50)!.point);
    expect(trace.pts[trace.pts.length - 1]).toEqual(trace.pts[0]);
    // Les indices intérieurs du tracé planifié sont décalés de `shift`.
    expect(trace.pts[2 + shift]).toEqual(g.coord(ring[2]!));
  });

  it("garde un point de passage voulu au fond d'une impasse", () => {
    const t = { pts: [at(0, 0), at(0, 100), at(0, 0)], node: [1, 2, 1], edge: [7, 7] };
    expect(cleanTrace(t).pts).toHaveLength(3);
    // …mais retire le demi-tour autour d'un point posé au milieu d'une rue.
    const v = { pts: [at(0, 50), at(0, 0), at(0, 100)], node: [-1, 1, 2], edge: [7, 7] };
    expect(cleanTrace(v).pts).toEqual([at(0, 50), at(0, 100)]);
  });

  it("ajoute l'altitude, avec des points intermédiaires sur les longues portions", () => {
    const trace = routeThrough(g, [at(0, -450), at(0, 450)])!;
    const path = pathFromTrace(g, trace, (p) => 100 + (p[0] - GRID_ORIGIN[0]) * 10_000);
    expect(path.hasElevation).toBe(true);
    expect(path.coordinates.length).toBeGreaterThan(trace.pts.length);
    const eles = path.coordinates.map((c) => c[2]!);
    expect(eles[eles.length - 1]! - eles[0]!).toBeGreaterThan(50);
  });

  it("revêtement et type de voie d'après la carte", () => {
    const lines: NetworkLine[] = [
      { coords: [at(0, 0), at(0, 100)], cls: "minor" },
      { coords: [at(0, 100), at(0, 200)], cls: "path", subclass: "footway" },
      { coords: [at(0, 200), at(0, 300)], cls: "track", surface: "unpaved" },
    ];
    const gw = new WalkGraph(lines, flat, GRID_ORIGIN[1]);
    const path = pathFromTrace(gw, routeThrough(gw, [at(0, 0), at(0, 300)])!);
    expect(path.waytypes.map((w) => w.value)).toEqual(["street", "footway", "track"]);
    expect(path.surfaces.map((w) => w.value)).toEqual(["paved", "unknown", "unpaved"]);
  });

  it("refuse un point trop loin de toute voie", () => {
    expect(routeThrough(g, [at(0, 0), at(5000, 5000)], 300)).toBeNull();
  });
});
