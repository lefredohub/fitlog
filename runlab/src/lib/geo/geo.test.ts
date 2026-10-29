import { describe, expect, it } from "vitest";
import type { Position } from "@/lib/route/types";
import { cumulativeDistances, destination, haversine, overlapRatio, pathLength, pointAtDistance, projectOnPath } from "./geo";

describe("haversine", () => {
  it("mesure 1° de latitude ≈ 111,2 km", () => {
    expect(haversine([2, 48], [2, 49]) / 1000).toBeCloseTo(111.19, 1);
  });
  it("vaut 0 pour un même point", () => {
    expect(haversine([2.35, 48.85], [2.35, 48.85])).toBe(0);
  });
});

describe("destination", () => {
  it("est cohérent avec haversine", () => {
    const start: [number, number] = [4.83, 45.76];
    for (const bearing of [0, 45, 133, 270]) {
      expect(haversine(start, destination(start, 2500, bearing))).toBeCloseTo(2500, 3);
    }
  });
});

describe("tracés", () => {
  const line: Position[] = [
    [2, 48],
    [2, 48.01],
    [2, 48.02],
  ];
  it("calcule les distances cumulées", () => {
    const cum = cumulativeDistances(line);
    expect(cum[0]).toBe(0);
    expect(cum[2]).toBeCloseTo(pathLength(line), 6);
    expect(cum[2]! / 1000).toBeCloseTo(2.224, 2);
  });
  it("interpole un point à mi-parcours", () => {
    const cum = cumulativeDistances(line);
    const mid = pointAtDistance(line, cum, cum[2]! / 2);
    expect(mid[1]).toBeCloseTo(48.01, 6);
  });
  it("projette un point sur le tracé", () => {
    const cum = cumulativeDistances(line);
    const p = projectOnPath([2.001, 48.005], line, cum)!;
    expect(p.distanceToPathM).toBeCloseTo(74.4, 0);
    expect(p.alongM).toBeCloseTo(556, -1);
  });
  it("respecte la fenêtre de recherche (aller-retour superposé)", () => {
    const outback: Position[] = [...line, [2, 48.01], [2, 48]];
    const cum = cumulativeDistances(outback);
    const total = cum[cum.length - 1]!;
    const p = projectOnPath([2, 48.005], outback, cum, { minM: total * 0.6, maxM: total })!;
    expect(p.alongM).toBeGreaterThan(total * 0.6);
  });
  it("détecte deux tracés identiques ou distincts", () => {
    const other: Position[] = [
      [2.05, 48],
      [2.05, 48.02],
    ];
    expect(overlapRatio(line, line)).toBe(1);
    expect(overlapRatio(line, other)).toBe(0);
  });
});
