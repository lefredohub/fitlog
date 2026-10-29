import { describe, expect, it } from "vitest";
import type { Position, RoutedPath } from "./types";
import { estimateDurationSec } from "./effort";
import { computeElevationGain, computeRouteStats, countTurns, unpavedShare } from "./stats";

function line(elevations: (number | undefined)[], stepDeg = 0.001): Position[] {
  return elevations.map((e, i) => (e === undefined ? [2, 48 + i * stepDeg] : [2, 48 + i * stepDeg, e]));
}

function path(coords: Position[], extra: Partial<RoutedPath> = {}): RoutedPath {
  return {
    coordinates: coords,
    engineDistanceM: 0,
    surfaces: [],
    waytypes: [],
    steps: [],
    hasElevation: coords.every((c) => c[2] !== undefined),
    ...extra,
  };
}

describe("dénivelé", () => {
  it("additionne montées et descentes", () => {
    expect(computeElevationGain([100, 110, 120, 115, 105, 130])).toEqual({ ascentM: 45, descentM: 15 });
  });
  it("ignore le bruit sous le seuil d'hystérésis", () => {
    expect(computeElevationGain([100, 101, 100, 101, 100, 101, 100])).toEqual({ ascentM: 0, descentM: 0 });
  });
  it("cumule une montée lente faite de petits pas", () => {
    const slow = Array.from({ length: 101 }, (_, i) => 100 + i * 0.5);
    expect(computeElevationGain(slow).ascentM).toBe(50);
  });
});

describe("computeRouteStats", () => {
  it("calcule distance, D+, D-, point culminant", () => {
    const s = computeRouteStats(path(line([100, 120, 140, 130, 110])));
    expect(s.distanceM).toBeCloseTo(445, -1);
    expect(s.ascentM).toBe(40);
    expect(s.descentM).toBe(30);
    expect(s.maxEleM).toBe(140);
    expect(s.minEleM).toBe(100);
    expect(s.highPoint?.distanceM).toBeCloseTo(222, -1);
  });
  it("renvoie null quand l'altitude manque, sans inventer de valeur", () => {
    const s = computeRouteStats(path(line([undefined, undefined, undefined])));
    expect(s.ascentM).toBeNull();
    expect(s.descentM).toBeNull();
    expect(s.maxGradePct).toBeNull();
    expect(s.distanceM).toBeGreaterThan(0);
  });
  it("répartit le terrain et compte l'inconnu", () => {
    const coords = line([0, 0, 0, 0, 0]);
    const s = computeRouteStats(
      path(coords, {
        surfaces: [
          { from: 0, to: 2, value: "paved" },
          { from: 2, to: 3, value: "unpaved" },
        ],
      }),
    );
    expect(s.terrain.surface.paved).toBeCloseTo(222, -1);
    expect(s.terrain.surface.unpaved).toBeCloseTo(111, -1);
    expect(s.terrain.surface.unknown).toBeCloseTo(111, -1);
    expect(unpavedShare(s)).toBeCloseTo(0.25, 2);
  });
  it("mesure la pente maximale sur 200 m", () => {
    // ~111 m entre points : 0 → 22 m de montée sur ~222 m ≈ 10 %
    const s = computeRouteStats(path(line([0, 11, 22, 22, 22, 22])));
    expect(s.maxGradePct).toBeGreaterThan(8);
    expect(s.maxGradePct).toBeLessThan(11);
  });
});

describe("virages", () => {
  it("pondère les virages légers à moitié", () => {
    const step = (maneuver: RoutedPath["steps"][number]["maneuver"]) => ({ instruction: "", name: "", maneuver, distanceM: 0, fromIndex: 0, toIndex: 0 });
    expect(countTurns([step("depart"), step("left"), step("slight-right"), step("slight-left"), step("straight"), step("arrive")])).toBe(2);
  });
});

describe("estimations", () => {
  const base = computeRouteStats(path(line([100, 100])));
  const tenK = { ...base, distanceM: 10_000, ascentM: 200 };
  it("estime le temps avec le kilomètre-effort", () => {
    expect(estimateDurationSec(tenK, { paceSecPerKm: 360, accountForClimb: true })).toBe(12 * 360);
    expect(estimateDurationSec(tenK, { paceSecPerKm: 360, accountForClimb: false })).toBe(10 * 360);
  });
});
