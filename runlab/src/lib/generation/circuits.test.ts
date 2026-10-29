import { describe, expect, it } from "vitest";
import { cumulativeDistances, destination, haversine } from "@/lib/geo/geo";
import { WalkGraph } from "@/lib/network/graph";
import { DEFAULT_PREFERENCES } from "@/lib/route/types";
import { GRID_ORIGIN, gridNetwork } from "@/test/grid-network";
import { planCircuits } from "./circuits";
import { networkCost } from "./profile";

describe("circuits répétés (mode record)", () => {
  it("fait le tour d'un étang voisin, avec le nombre de tours qui donne la distance", () => {
    const at = (n: number, e: number) => destination(destination(GRID_ORIGIN, n, 0), e, 90);
    const center = at(0, 800);
    const ring = Array.from({ length: 37 }, (_, i) => destination(center, 260, (i * 360) / 36));
    const lake = Array.from({ length: 36 }, (_, i) => destination(center, 230, (i * 360) / 36));
    // Chemin de rive relié au quadrillage par une allée.
    const lines = [...gridNetwork(), { coords: ring, cls: "path" }, { coords: [destination(center, 260, 270), at(0, 500)], cls: "path" }];
    const g = new WalkGraph(lines, networkCost("road", { ...DEFAULT_PREFERENCES, forRecord: true }), GRID_ORIGIN[1]);
    const circuits = planCircuits(g, GRID_ORIGIN, [{ kind: "water", key: "water:1", points: lake }], {
      minM: 6000 * 1.012,
      maxM: 6000 * 1.04,
      laps: [2, 3, 4, 5],
      roads: [],
      count: 2,
    });
    expect(circuits.length).toBeGreaterThan(0);
    const c = circuits[0]!;
    expect(c.kind).toBe("water");
    // Un tour ≈ périmètre du chemin de rive (2π × 260 m ≈ 1 630 m).
    expect(c.lap.lengthM).toBeGreaterThan(1500);
    expect(c.lap.lengthM).toBeLessThan(1800);
    expect(c.totalM).toBeGreaterThanOrEqual(6000 * 1.012);
    expect(c.totalM).toBeLessThanOrEqual(6000 * 1.04);
    const sum = (c.approach?.lengthM ?? 0) + c.laps * c.lap.lengthM + c.partialM + (c.back?.lengthM ?? 0);
    expect(sum).toBeCloseTo(c.totalM, 0);
  });

  it("étang à deux accès : on finit par l'autre accès, sans demi-tour", () => {
    const at = (n: number, e: number) => destination(destination(GRID_ORIGIN, n, 0), e, 90);
    const center = at(0, 800);
    const ring = Array.from({ length: 37 }, (_, i) => destination(center, 260, (i * 360) / 36));
    const lake = Array.from({ length: 36 }, (_, i) => destination(center, 230, (i * 360) / 36));
    const lines = [
      ...gridNetwork(),
      { coords: ring, cls: "path" },
      { coords: [destination(center, 260, 270), at(0, 500)], cls: "path" },
      { coords: [destination(center, 260, 90), at(0, 1100)], cls: "path" },
    ];
    const g = new WalkGraph(lines, networkCost("road", { ...DEFAULT_PREFERENCES, forRecord: true }), GRID_ORIGIN[1]);
    const circuits = planCircuits(g, GRID_ORIGIN, [{ kind: "water", key: "water:1", points: lake }], {
      // Fourchette large : des combinaisons sans demi-tour existent, elles doivent l'emporter.
      minM: 7200,
      maxM: 7600,
      laps: [2, 3, 4],
      roads: [],
      count: 1,
    });
    expect(circuits.length).toBe(1);
    const c = circuits[0]!;
    // Pas de demi-tour à la sortie : le retour ne repart pas par la portion de rive
    // qu'on vient de courir.
    const cum = cumulativeDistances(c.lap.coords);
    const end = c.partialM > 0 ? c.lap.coords.filter((_, i) => cum[i]! <= c.partialM + 0.5) : c.lap.coords;
    const arrivedFrom = end[end.length - 2]!;
    expect(c.back).not.toBeNull();
    expect(haversine(c.back!.coords[1]!, arrivedFrom)).toBeGreaterThan(5);
  });
});

describe("boucles de chemins piétons", () => {
  const at = (n: number, e: number) => destination(destination(GRID_ORIGIN, n, 0), e, 90);
  const prefs = { ...DEFAULT_PREFERENCES, forRecord: true };

  it("trouve une boucle d'allées sans contour de lieu, et la nomme d'après l'étiquette du parc", () => {
    // Allée en carré de 400 m de côté, à 600 m du départ, reliée au quadrillage en deux points.
    const sq = [at(-200, 600), at(-200, 1000), at(200, 1000), at(200, 600), at(-200, 600)].map(([x, y]) => [x + 0.00002, y + 0.00002] as [number, number]);
    const lines = [...gridNetwork(), { coords: sq, cls: "path" }, { coords: [sq[0]!, at(-200, 500)], cls: "path" }, { coords: [sq[2]!, at(300, 1000)], cls: "path" }];
    const g = new WalkGraph(lines, networkCost("road", prefs), GRID_ORIGIN[1]);
    const circuits = planCircuits(g, GRID_ORIGIN, [], {
      minM: 6000 * 1.012,
      maxM: 6000 * 1.04,
      laps: [2, 3, 4],
      roads: [],
      labels: [{ name: "Parc des Tests", kind: "park", coord: at(0, 800) }],
      count: 2,
    });
    expect(circuits.length).toBeGreaterThan(0);
    const c = circuits[0]!;
    expect(c.lap.lengthM).toBeGreaterThan(1500);
    expect(c.lap.lengthM).toBeLessThan(1700);
    expect(c.lap.offRoad).toBeGreaterThan(0.95);
    expect(c.name).toBe("Parc des Tests");
    expect(c.kind).toBe("park");
  });

  it("écarte un lieu trop loin : l'accès ne doit pas dominer le parcours", () => {
    const center = at(0, 2200);
    const ring = Array.from({ length: 37 }, (_, i) => destination(center, 150, (i * 360) / 36));
    const lines = [...gridNetwork(100, 2500), { coords: ring, cls: "path" }, { coords: [destination(center, 150, 270), at(0, 2000)], cls: "path" }];
    const g = new WalkGraph(lines, networkCost("road", prefs), GRID_ORIGIN[1]);
    const lake = Array.from({ length: 36 }, (_, i) => destination(center, 120, (i * 360) / 36));
    const circuits = planCircuits(g, GRID_ORIGIN, [{ kind: "water", key: "w", points: lake }], {
      minM: 5000,
      maxM: 5250,
      laps: [1, 2, 3],
      roads: [],
      count: 2,
    });
    // 2 × 2,2 km d'accès pour 5 km : ce n'est plus un circuit.
    expect(circuits.filter((c) => c.kind === "water")).toHaveLength(0);
  });
});
