import { describe, expect, it } from "vitest";
import type { RouteStep } from "@/lib/route/types";
import { instructionText, shouldAnnounce, spokenText, type InstructionMessages } from "./instructions";

const t: InstructionMessages = {
  roundabout: (s) => `Au rond-point, sortez vers ${s}`,
  roundaboutNoName: "Au rond-point, suivez le tracé",
  now: "Maintenant",
  inMeters: (m) => `Dans ${m} mètres`,
};
const step = (maneuver: RouteStep["maneuver"], instruction: string, name = ""): RouteStep => ({
  maneuver,
  instruction,
  name,
  distanceM: 100,
  fromIndex: 3,
  toIndex: 5,
});

describe("consignes de guidage", () => {
  it("n'utilise jamais le numéro de sortie des ronds-points", () => {
    expect(instructionText(step("roundabout", "Au rond-point, prenez la 3e sortie sur Rue de Strasbourg", "Rue de Strasbourg"), t)).toBe(
      "Au rond-point, sortez vers Rue de Strasbourg",
    );
    expect(instructionText(step("roundabout", "Au rond-point, prenez la 2e sortie"), t)).toBe("Au rond-point, suivez le tracé");
  });
  it("garde la consigne du moteur pour les virages", () => {
    expect(instructionText(step("right", "Tournez à droite sur Rue Thiers"), t)).toBe("Tournez à droite sur Rue Thiers");
  });
  it("annonce les virages mais pas « tout droit »", () => {
    expect(shouldAnnounce(step("left", "x"))).toBe(true);
    expect(shouldAnnounce(step("straight", "x"))).toBe(false);
  });
  it("précise la distance à l'oral", () => {
    expect(spokenText(step("right", "Tournez à droite sur Rue Thiers"), 37, t)).toBe("Dans 40 mètres, tournez à droite sur Rue Thiers");
    expect(spokenText(step("right", "Tournez à droite"), 8, t)).toBe("Tournez à droite");
  });
});
