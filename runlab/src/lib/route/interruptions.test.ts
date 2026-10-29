import { describe, expect, it } from "vitest";
import { bearing, lineAngle, stopWeight } from "./interruptions";

describe("orientation et poids des arrêts", () => {
  it("calcule le cap et l'écart d'orientation sans tenir compte du sens", () => {
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(90, 5);
    expect(lineAngle(10, 190)).toBe(0);
    expect(lineAngle(0, 100)).toBe(80);
  });

  it("un grand axe pèse deux fois plus qu'une petite rue", () => {
    expect(stopWeight({ crossings: 3, majorCrossings: 1 })).toBe(4);
    expect(stopWeight({})).toBe(0);
  });
});
