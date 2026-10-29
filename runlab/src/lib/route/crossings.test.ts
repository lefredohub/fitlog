import { describe, expect, it } from "vitest";
import { destination } from "@/lib/geo/geo";
import type { LngLat, Position } from "./types";
import { countRoadCrossings, type RoadLine } from "./crossings";

// Tracé droit de 1 km vers le nord, un point tous les 10 m.
const s0: LngLat = [-2.7383, 47.6637];
const at = (m: number, east = 0): LngLat => destination(destination(s0, m, 0), east, 90);
const route: Position[] = Array.from({ length: 101 }, (_, i) => at(i * 10));
const road = (coords: LngLat[], extra: Partial<RoadLine> = {}): RoadLine => ({ coords, cls: "minor", grade: false, ...extra });
const eastWest = (m: number, extra: Partial<RoadLine> = {}) => road([at(m, -80), at(m, 80)], extra);
/** La rue que suit le tracé (le coureur est sur un de ses trottoirs). */
const main = road(Array.from({ length: 101 }, (_, i) => at(i * 10)));

describe("traversées de route (modèle trottoir)", () => {
  it("compte une rue coupée et distingue les grands axes", () => {
    expect(countRoadCrossings(route, [eastWest(305), eastWest(605, { cls: "major" })])).toMatchObject({ crossings: 2, majorCrossings: 1 });
  });

  it("ne compte pas une route longée", () => {
    expect(countRoadCrossings(route, [main])).toMatchObject({ crossings: 0, majorCrossings: 0, points: [] });
  });

  it("carrefour en croix sur la rue suivie : une traversée", () => {
    const cross = road([at(500, -80), at(500), at(500, 80)]);
    expect(countRoadCrossings(route, [main, cross]).crossings).toBe(1);
  });

  it("rues latérales : on court du côté qui en a le moins", () => {
    // Deux rues à l'est, une à l'ouest : rester sur le trottoir ouest coûte 1.
    const sides = [road([at(200), at(200, 100)]), road([at(600), at(600, 100)]), road([at(400), at(400, -100)])];
    expect(countRoadCrossings(route, [main, ...sides]).crossings).toBe(1);
    // Une seule rue latérale : aucun besoin de la traverser.
    expect(countRoadCrossings(route, [main, sides[0]!]).crossings).toBe(0);
  });

  it("changer de trottoir coûte une traversée, quand ça vaut le coup", () => {
    // Trois rues à l'est d'abord, puis trois à l'ouest : on change une fois de côté.
    const sides = [200, 260, 320].map((m) => road([at(m), at(m, 100)])).concat([600, 660, 720].map((m) => road([at(m), at(m, -100)])));
    expect(countRoadCrossings(route, [main, ...sides]).crossings).toBe(1);
  });

  it("ne compte pas la rue que l'on emprunte en tournant", () => {
    // 400 m vers le nord puis 300 m vers l'est, sur la rue latérale.
    const turning: Position[] = [
      ...Array.from({ length: 41 }, (_, i) => at(i * 10)),
      ...Array.from({ length: 30 }, (_, i) => at(400, (i + 1) * 10)),
    ];
    expect(countRoadCrossings(turning, [road([at(0), at(400)]), road([at(400), at(400, 300)])]).crossings).toBe(0);
  });

  it("tourner à droite dans un carrefour en croix ne coûte rien, sur le bon trottoir", () => {
    const turning: Position[] = [
      ...Array.from({ length: 41 }, (_, i) => at(i * 10)),
      ...Array.from({ length: 30 }, (_, i) => at(400, (i + 1) * 10)),
    ];
    const ns = road(Array.from({ length: 81 }, (_, i) => at(i * 10)));
    const ew = road([at(400, -300), at(400), at(400, 300)]);
    expect(countRoadCrossings(turning, [ns, ew]).crossings).toBe(0);
  });

  it("aller-retour : une rue latérale passée deux fois du même côté n'est pas traversée", () => {
    const out = Array.from({ length: 51 }, (_, i) => at(i * 10));
    const outback: Position[] = [...out, ...[...out].reverse().slice(1)];
    const half = road(out);
    expect(countRoadCrossings(outback, [half, road([at(250), at(250, 100)])]).crossings).toBe(0);
    // Une rue de chaque côté : l'une des deux est forcément traversée, à l'aller et au retour.
    expect(countRoadCrossings(outback, [half, road([at(250), at(250, 100)]), road([at(350), at(350, -100)])]).crossings).toBe(2);
  });

  it("ignore ponts et tunnels", () => {
    expect(countRoadCrossings(route, [eastWest(305, { grade: true })]).crossings).toBe(0);
  });

  it("compte une seule traversée pour une avenue à deux chaussées", () => {
    expect(countRoadCrossings(route, [eastWest(800), eastWest(810)]).crossings).toBe(1);
  });

  it("compte un carrefour dont le point est partagé par le tracé", () => {
    const shared = road([at(500, -60), at(500), at(500, 60)]);
    expect(countRoadCrossings(route, [shared]).crossings).toBe(1);
  });
});

describe("ponts et passerelles", () => {
  it("le tracé sur un pont ne traverse pas la route du dessous", () => {
    const bridge = road([at(280), at(330)], { grade: true });
    expect(countRoadCrossings(route, [bridge, eastWest(305, { cls: "major" })]).crossings).toBe(0);
  });
});
