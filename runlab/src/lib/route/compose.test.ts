import { describe, expect, it } from "vitest";
import { destination, pathLength } from "@/lib/geo/geo";
import type { LngLat, Position, RoutedPath, RouteStep } from "./types";
import { concatPaths, despurPath, maneuverFromTurn, mirrorReturn, simplifyJogs, slicePath } from "./compose";

const s0: LngLat = [-2.7383, 47.6637];
const line = (from: LngLat, bearingDeg: number, meters: number, step = 10, ele = 50): Position[] =>
  Array.from({ length: Math.round(meters / step) + 1 }, (_, i) => {
    const p = destination(from, i * step, bearingDeg);
    return [p[0], p[1], ele + i * 0.1];
  });
const step = (maneuver: RouteStep["maneuver"], name: string, fromIndex: number, toIndex: number): RouteStep => ({
  instruction: maneuver,
  name,
  maneuver,
  distanceM: 0,
  fromIndex,
  toIndex,
});

// Aller en L : 300 m vers le nord (Rue A), virage à droite, 200 m vers l'est (Rue B).
const north = line(s0, 0, 300);
const corner = destination(s0, 300, 0);
const east = line(corner, 90, 200).slice(1);
const L: RoutedPath = {
  coordinates: [...north, ...east],
  engineDistanceM: 500,
  surfaces: [{ from: 0, to: 30, value: "paved" }, { from: 30, to: 50, value: "unpaved" }],
  waytypes: [],
  steps: [step("depart", "Rue A", 0, 30), step("right", "Rue B", 30, 50), step("arrive", "", 50, 50)],
  hasElevation: true,
};

describe("composition de tracés", () => {
  it("classe les virages selon l'angle", () => {
    expect(maneuverFromTurn(0, 90)).toBe("right");
    expect(maneuverFromTurn(90, 0)).toBe("left");
    expect(maneuverFromTurn(0, 10)).toBe("straight");
    expect(maneuverFromTurn(0, 180)).toBe("uturn");
    expect(maneuverFromTurn(0, 40)).toBe("slight-right");
  });

  it("coupe un tracé au mètre près, altitude interpolée", () => {
    const cut = slicePath(L, 345);
    expect(pathLength(cut.coordinates)).toBeCloseTo(345, 0);
    expect(cut.coordinates[cut.coordinates.length - 1]![2]).toBeDefined();
    expect(cut.steps.map((s) => s.maneuver)).toEqual(["depart", "right"]);
    expect(cut.surfaces[1]!.to).toBe(cut.coordinates.length - 1);
  });

  it("aller-retour miroir : distance exactement double, virage inversé au retour", () => {
    const ab = mirrorReturn(slicePath(L, 400));
    expect(pathLength(ab.coordinates)).toBeCloseTo(800, 0);
    const maneuvers = ab.steps.map((s) => `${s.maneuver}:${s.name}`);
    // Aller : départ Rue A, à droite Rue B ; demi-tour ; retour : à gauche sur Rue A ; arrivée.
    expect(maneuvers).toEqual(["depart:Rue A", "right:Rue B", "uturn:", "left:Rue A", "arrive:"]);
    const back = ab.coordinates[ab.coordinates.length - 1]!;
    expect(back[0]).toBeCloseTo(s0[0], 6);
    expect(ab.surfaces.at(-1)!.value).toBe("paved");
  });

  it("enchaîne deux tracés et crée la consigne de jonction", () => {
    const first = slicePath(L, 300); // s'arrête au coin
    const second: RoutedPath = {
      coordinates: line(corner, 270, 150),
      engineDistanceM: 150,
      surfaces: [],
      waytypes: [],
      steps: [step("depart", "Rue C", 0, 15), step("arrive", "", 15, 15)],
      hasElevation: true,
    };
    const joined = concatPaths(first, second);
    expect(pathLength(joined.coordinates)).toBeCloseTo(450, 0);
    const junction = joined.steps.find((s) => s.name === "Rue C")!;
    expect(junction.maneuver).toBe("left");
    expect(junction.instruction).toBe("Tournez à gauche sur Rue C");
    expect(joined.steps.at(-1)!.maneuver).toBe("arrive");
  });
});

describe("impasses", () => {
  it("retire un aller-retour de 200 m dans une impasse", () => {
    // 300 m vers le nord, 200 m vers l'est dans une impasse et retour, puis 300 m vers le nord.
    const a = line(s0, 0, 300);
    const p300 = destination(s0, 300, 0);
    const spurOut = line(p300, 90, 200).slice(1);
    const spurBack = [...spurOut].reverse().slice(1).concat([[p300[0], p300[1], 50] as Position]);
    const b = line(p300, 0, 300).slice(1);
    const coords = [...a, ...spurOut, ...spurBack, ...b];
    const path: RoutedPath = { coordinates: coords, engineDistanceM: 1000, surfaces: [], waytypes: [], steps: [step("depart", "Rue A", 0, 0), step("arrive", "", coords.length - 1, coords.length - 1)], hasElevation: true };
    const clean = despurPath(path);
    expect(pathLength(path.coordinates)).toBeCloseTo(1000, -1);
    expect(pathLength(clean.coordinates)).toBeLessThan(620);
    expect(pathLength(clean.coordinates)).toBeGreaterThan(590);
  });
});

describe("rafales de consignes", () => {
  it("un crochet au passage piéton (droite 10 m, gauche) disparaît", () => {
    // 300 m vers le nord, décalage de 10 m vers l'est, puis 300 m vers le nord.
    const a = line(s0, 0, 300);
    const p1 = destination(s0, 300, 0);
    const jog = line(p1, 90, 10, 5).slice(1);
    const p2 = destination(p1, 10, 90);
    const b = line(p2, 0, 300).slice(1);
    const coords = [...a, ...jog, ...b];
    const iJog = a.length - 1;
    const iBack = a.length - 1 + jog.length;
    const path: RoutedPath = {
      coordinates: coords,
      engineDistanceM: 610,
      surfaces: [],
      waytypes: [],
      steps: [
        step("depart", "Rue A", 0, iJog),
        step("right", "", iJog, iBack),
        step("left", "Rue A", iBack, coords.length - 1),
        step("arrive", "", coords.length - 1, coords.length - 1),
      ],
      hasElevation: true,
    };
    expect(simplifyJogs(path).steps.map((s) => s.maneuver)).toEqual(["depart", "arrive"]);
  });

  it("un vrai virage en deux temps devient une seule consigne", () => {
    // Nord, petit décalage, puis franchement vers l'est sur Rue B.
    const a = line(s0, 0, 300);
    const p1 = destination(s0, 300, 0);
    const jog = line(p1, 45, 10, 5).slice(1);
    const p2 = destination(p1, 10, 45);
    const b = line(p2, 90, 300).slice(1);
    const coords = [...a, ...jog, ...b];
    const iJog = a.length - 1;
    const iTurn = a.length - 1 + jog.length;
    const path: RoutedPath = {
      coordinates: coords,
      engineDistanceM: 610,
      surfaces: [],
      waytypes: [],
      steps: [
        step("depart", "Rue A", 0, iJog),
        step("slight-right", "", iJog, iTurn),
        step("slight-right", "Rue B", iTurn, coords.length - 1),
        step("arrive", "", coords.length - 1, coords.length - 1),
      ],
      hasElevation: true,
    };
    const out = simplifyJogs(path).steps;
    expect(out.map((s) => s.maneuver)).toEqual(["depart", "right", "arrive"]);
    expect(out[1]!.instruction).toBe("Tournez à droite sur Rue B");
  });
});
