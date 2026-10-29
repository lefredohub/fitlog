import { describe, expect, it } from "vitest";
import { destination, haversine, pathLength } from "@/lib/geo/geo";
import { despurPath } from "@/lib/route/compose";
import { DEFAULT_PREFERENCES, type LngLat } from "@/lib/route/types";
import { GRID_ORIGIN, gridNetwork, gridWithPark } from "@/test/grid-network";
import { generateProposals, stemOf, type EngineDeps } from "./planner";
import type { Candidate, GenerateInput } from "./types";

const at = (n: number, e: number): LngLat => destination(destination(GRID_ORIGIN, n, 0), e, 90);

const base: GenerateInput = {
  start: GRID_ORIGIN,
  kind: "road",
  shape: "loop",
  targetDistanceM: 5000,
  preferences: DEFAULT_PREFERENCES,
  variation: 0,
};

/** Réseau en quadrillage et relief synthétique (pente vers l'est). */
const deps = (lines = gridNetwork(), labels: { name: string; kind: "park" | "water"; coord: LngLat }[] = []): EngineDeps => ({
  network: async () => ({ lines, areas: [], labels }),
  elevation: async () => (p) => 50 + (p[0] - GRID_ORIGIN[0]) * 2000,
});

/** Toutes les propositions entre la cible et +5 %. */
function expectAllInWindow(distances: number[], target: number) {
  expect(distances.length).toBeGreaterThan(0);
  for (const d of distances) {
    expect(d).toBeGreaterThanOrEqual(target);
    expect(d).toBeLessThanOrEqual(target * 1.05);
  }
}

const lapsOf = (c: Candidate) => c.path.steps.filter((s) => s.maneuver === "lap").map((s) => s.instruction.split(" · ")[0]);

describe("boucles", () => {
  it("toutes entre 5 et 5,25 km, avec altitude, sans aller-retour, la meilleure en premier", async () => {
    const res = await generateProposals(base, deps());
    expectAllInWindow(res.proposals.map((p) => p.stats.distanceM), 5000);
    expect(res.proposals.length).toBeGreaterThanOrEqual(2);
    expect(res.proposals.length).toBeLessThanOrEqual(3);
    expect(res.proposals.map((p) => p.recommended)).toEqual(res.proposals.map((_, i) => i === 0));
    for (const p of res.proposals) {
      expect(p.path.hasElevation).toBe(true);
      expect(p.stats.ascentM).toBeGreaterThan(0);
      expect(pathLength(despurPath(p.path).coordinates)).toBeCloseTo(pathLength(p.path.coordinates), 0);
    }
  });

  it("départ au milieu d'une rue : la boucle part de là et y revient", async () => {
    const start = at(0, 40);
    const res = await generateProposals({ ...base, start }, deps());
    for (const p of res.proposals) {
      const c = p.path.coordinates;
      expect(haversine(c[0]!, start)).toBeLessThan(1);
      expect(haversine(c[c.length - 1]!, start)).toBeLessThan(1);
    }
  });

  it("plusieurs tours : une consigne au début de chaque tour", async () => {
    // Quadrillage de 100 m : boucles de 2,4 km (périmètres multiples de 200 m).
    const res = await generateProposals({ ...base, laps: 3, targetDistanceM: 7050 }, deps());
    expectAllInWindow(res.proposals.map((p) => p.stats.distanceM), 7050);
    expect(lapsOf(res.proposals[0]!)).toEqual(["Tour 2 sur 3", "Tour 3 sur 3"]);
  });

  it("depuis une impasse : l'impasse sert d'accès et de retour, sans demi-tour entre les tours", async () => {
    expect(stemOf([1, 2, 3, 4, 2, 1])).toBe(1);
    expect(stemOf([1, 2, 3, 1])).toBe(0);
    const lines = [...gridNetwork(), { coords: [at(-80, 50), at(0, 50)], cls: "minor" }];
    const res = await generateProposals({ ...base, start: at(-80, 50), targetDistanceM: 5200, laps: 2 }, deps(lines));
    expectAllInWindow(res.proposals.map((p) => p.stats.distanceM), 5200);
    for (const p of res.proposals) {
      expect(lapsOf(p)).toEqual(["Tour 1 sur 2", "Tour 2 sur 2"]);
      expect(p.path.steps.some((s) => s.maneuver === "uturn")).toBe(false);
    }
  });

  it("mode record : traversées comptées sur chaque proposition", async () => {
    const res = await generateProposals({ ...base, preferences: { forRecord: true } }, deps());
    expectAllInWindow(res.proposals.map((p) => p.stats.distanceM), 5000);
    expect(res.proposals.every((p) => p.stats.interruptions !== undefined)).toBe(true);
  });

  it("circuit d'allées : tours annoncés, nom du lieu, accès et retour mesurés", async () => {
    const sq = [at(-300, 300), at(-300, 940), at(300, 940), at(300, 300), at(-300, 300)];
    const lines = [
      ...gridWithPark({ n0: -350, n1: 350, e0: 250, e1: 1000 }),
      { coords: sq, cls: "path" },
      { coords: [sq[0]!, at(-300, 200)], cls: "path" },
      { coords: [sq[2]!, at(300, 1000)], cls: "path" },
    ];
    const res = await generateProposals({ ...base, targetDistanceM: 6000, laps: 2 }, deps(lines, [{ name: "Parc des Tests", kind: "park", coord: at(0, 800) }]));
    const circuit = res.proposals.find((p) => p.recipe.type === "planned" && p.recipe.circuit);
    expect(circuit).toBeDefined();
    expectAllInWindow([circuit!.stats.distanceM], 6000);
    const r = circuit!.recipe as Extract<Candidate["recipe"], { type: "planned" }>;
    expect(r.laps).toBe(2);
    expect(r.circuit!.name).toBe("Parc des Tests");
    expect(r.circuit!.lapM).toBeCloseTo(2480, -1);
    const total = r.circuit!.approachM + 2 * r.circuit!.lapM + r.circuit!.partialM + r.circuit!.backM;
    expect(total).toBeCloseTo(circuit!.stats.distanceM, -1);
    expect(lapsOf(circuit!)).toEqual(["Tour 1 sur 2", "Tour 2 sur 2"]);
  });
});

describe("aller-retour", () => {
  it("aller coupé à mi-distance, retour par le même chemin, dans la fourchette", async () => {
    const res = await generateProposals({ ...base, shape: "outback", targetDistanceM: 4000 }, deps());
    expectAllInWindow(res.proposals.map((p) => p.stats.distanceM), 4000);
    expect(res.proposals.length).toBeGreaterThanOrEqual(2);
    for (const p of res.proposals) {
      const c = p.path.coordinates;
      expect(haversine(c[0]!, c[c.length - 1]!)).toBeLessThan(1);
      expect(p.path.steps.filter((s) => s.maneuver === "uturn")).toHaveLength(1);
    }
  });
});

describe("erreurs claires", () => {
  it("aucune voie près du départ", async () => {
    await expect(generateProposals({ ...base, start: destination(GRID_ORIGIN, 20_000, 0) }, deps())).rejects.toMatchObject({ code: "NOT_ROUTABLE" });
  });

  it("carte indisponible", async () => {
    const failing: EngineDeps = { network: () => Promise.reject(new Error("hors ligne")) };
    await expect(generateProposals(base, failing)).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("boucle trop longue pour un seul tour", async () => {
    await expect(generateProposals({ ...base, targetDistanceM: 40_000 }, deps())).rejects.toMatchObject({ code: "TOO_LONG" });
  });

  it("sans altitudes, les parcours restent proposés et c'est signalé", async () => {
    const res = await generateProposals(base, { network: deps().network });
    expect(res.proposals.length).toBeGreaterThan(0);
    expect(res.notices).toContainEqual({ code: "ELEVATION_MISSING" });
  });
});
