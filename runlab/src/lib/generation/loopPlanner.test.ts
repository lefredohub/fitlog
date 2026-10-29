import { describe, expect, it } from "vitest";
import { destination } from "@/lib/geo/geo";
import { WalkGraph } from "@/lib/network/graph";
import { DEFAULT_PREFERENCES, type LngLat } from "@/lib/route/types";
import { GRID_ORIGIN, gridNetwork } from "@/test/grid-network";
import { countHairpins, despurWalk, planLoops, selfProximity } from "./loopPlanner";
import { networkCost } from "./profile";

const graph = () => new WalkGraph(gridNetwork(), networkCost("road", DEFAULT_PREFERENCES), GRID_ORIGIN[1]);

describe("réseau piéton", () => {
  it("fusionne les carrefours et repère les impasses", () => {
    const g = graph();
    const cul: LngLat[] = [destination(GRID_ORIGIN, 3000, 90), destination(GRID_ORIGIN, 3200, 90)];
    const withDeadEnd = new WalkGraph(
      [...gridNetwork(), { coords: [destination(GRID_ORIGIN, 2500, 90), ...cul], cls: "minor" }],
      networkCost("road", DEFAULT_PREFERENCES),
      GRID_ORIGIN[1],
    );
    expect(g.snap(GRID_ORIGIN, 10)).not.toBeNull();
    const deadEnd = withDeadEnd.snap(cul[1]!, 5)!;
    expect(withDeadEnd.main[deadEnd]).toBe(1);
    expect(withDeadEnd.core[deadEnd]).toBe(0);
  });

  it("raccorde une jonction en T sans sommet commun", () => {
    const a: LngLat = destination(GRID_ORIGIN, 50, 0);
    const lines = [
      { coords: [destination(GRID_ORIGIN, 200, 270), destination(GRID_ORIGIN, 200, 90)], cls: "minor" },
      // Rue qui s'arrête à 1 m de la première, sans point commun.
      { coords: [a, destination(GRID_ORIGIN, 1, 0)], cls: "minor" },
    ];
    const g = new WalkGraph(lines, networkCost("road", DEFAULT_PREFERENCES), GRID_ORIGIN[1]);
    expect(g.main[g.snap(a, 5)!]).toBe(1);
    expect(g.main[g.snap(destination(GRID_ORIGIN, 200, 90), 5)!]).toBe(1);
  });
});

describe("planification de boucles", () => {
  it("retire les allers-retours immédiats", () => {
    expect(despurWalk([{ e: 1, fwd: true }, { e: 2, fwd: true }, { e: 2, fwd: false }, { e: 3, fwd: true }])).toEqual([
      { e: 1, fwd: true },
      { e: 3, fwd: true },
    ]);
  });

  it("propose des boucles rondes, sans rue reprise, dans la fourchette", () => {
    const loops = planLoops(graph(), GRID_ORIGIN, { targetM: 5000, minM: 5030, maxM: 5220, count: 4 });
    expect(loops.length).toBeGreaterThanOrEqual(3);
    for (const l of loops) {
      expect(l.lengthM).toBeGreaterThanOrEqual(5030);
      expect(l.lengthM).toBeLessThanOrEqual(5220);
      expect(l.retrace).toBe(0);
      expect(l.roundness).toBeGreaterThan(0.4);
      expect(countHairpins(l.coords)).toBe(0);
      expect(l.via.length).toBeGreaterThan(10);
      expect(l.via.length).toBeLessThanOrEqual(40);
    }
  });

  it("« autres propositions » donne de nouvelles boucles", () => {
    const g = graph();
    const first = planLoops(g, GRID_ORIGIN, { targetM: 5000, minM: 5030, maxM: 5220, count: 3 });
    const next = planLoops(g, GRID_ORIGIN, { targetM: 5000, minM: 5030, maxM: 5220, count: 3, seedOffset: 1 });
    expect(next.length).toBeGreaterThan(0);
    const key = (l: { coords: LngLat[] }) => l.coords.map((c) => c.join()).join(";");
    for (const n of next) expect(first.map(key)).not.toContain(key(n));
  });

  it("détecte un doigt (aller et retour par des rues parallèles)", () => {
    const at = (n: number, e: number) => destination(destination(GRID_ORIGIN, n, 0), e, 90);
    const corners = [at(0, 0), at(0, 475), at(-400, 475), at(-400, 525), at(0, 525), at(0, 1000), at(1000, 1000), at(1000, 0), at(0, 0)];
    const dense: LngLat[] = [];
    for (let i = 0; i < corners.length - 1; i++) {
      for (let k = 0; k < 20; k++) {
        const a = corners[i]!;
        const b = corners[i + 1]!;
        dense.push([a[0] + ((b[0] - a[0]) * k) / 20, a[1] + ((b[1] - a[1]) * k) / 20]);
      }
    }
    dense.push(corners[0]!);
    expect(selfProximity(dense)).toBeGreaterThan(0.1);
    const square = [at(0, 0), at(0, 1000), at(1000, 1000), at(1000, 0), at(0, 0)];
    expect(selfProximity(square)).toBe(0);
  });
});

describe("boucles à répéter", () => {
  it("de préférence sans « queue » : on ne repart pas par la rue par laquelle on est revenu", () => {
    const start = destination(GRID_ORIGIN, 50, 90);
    const g = new WalkGraph(gridNetwork(), () => 1, GRID_ORIGIN[1]);
    const loops = planLoops(g, start, { targetM: 2500, minM: 2530, maxM: 2600, count: 6, laps: 2 });
    expect(loops.length).toBeGreaterThan(0);
    for (const l of loops) {
      const n = l.nodes;
      expect(n[1]).not.toBe(n[n.length - 2]);
    }
  });
});
