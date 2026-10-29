import { describe, expect, it } from "vitest";
import { destination } from "@/lib/geo/geo";
import type { LngLat, Position } from "@/lib/route/types";
import { makePath } from "@/test/make-path";
import { RunTracker } from "./tracker";

// Aller-retour de 2 km : 1 km vers le nord puis retour par le même chemin.
const start: LngLat = [2.35, 48.85];
const out: Position[] = Array.from({ length: 21 }, (_, i) => destination(start, i * 50, 0));
const coords: Position[] = [...out, ...out.slice(0, -1).reverse()];
const path = makePath(coords, 0, 2);

describe("RunTracker", () => {
  it("suit la progression à l'aller puis au retour sans sauter de sens", () => {
    const t = new RunTracker(path);
    for (let d = 0; d <= 1000; d += 50) t.update(destination(start, d, 0));
    // Au retour, la même position géographique doit correspondre à ~1 600 m parcourus.
    let p = t.update(destination(start, 950, 0));
    for (let d = 900; d >= 400; d -= 50) p = t.update(destination(start, d, 0));
    expect(p.alongM).toBeGreaterThan(1500);
    expect(p.remainingM).toBeLessThan(500);
    expect(p.offRoute).toBe(false);
  });

  it("alerte après plusieurs positions hors tracé", () => {
    const t = new RunTracker(path);
    t.update(destination(start, 200, 0));
    const away = destination(destination(start, 200, 0), 120, 90);
    expect(t.update(away).offRoute).toBe(false);
    const p = t.update(away);
    expect(p.offRoute).toBe(true);
    expect(p.distanceToRouteM).toBeGreaterThan(100);
    expect(t.update(destination(start, 250, 0)).offRoute).toBe(false);
  });

  it("donne la prochaine instruction et détecte l'arrivée", () => {
    const t = new RunTracker(path);
    const p = t.update(destination(start, 10, 0));
    expect(p.nextStep).not.toBeNull();
    expect(p.distanceToNextStepM).toBeGreaterThan(0);
    for (let d = 0; d <= 1000; d += 50) t.update(destination(start, d, 0));
    let last = t.update(destination(start, 1000, 0));
    for (let d = 950; d >= 0; d -= 50) last = t.update(destination(start, d, 0));
    expect(last.arrived).toBe(true);
  });
});

describe("RunTracker — moment des consignes", () => {
  // Parcours en L : 300 m vers le nord, virage à droite, 300 m vers l'est, puis encore un virage.
  const s0: LngLat = [-2.7383, 47.6637];
  const corner = destination(s0, 300, 0);
  const north: Position[] = Array.from({ length: 31 }, (_, i) => destination(s0, i * 10, 0));
  const east: Position[] = Array.from({ length: 30 }, (_, i) => destination(corner, (i + 1) * 10, 90));
  const coords = [...north, ...east];
  const path = makePath(coords, 0, 0);
  path.steps = [
    { instruction: "Départ", name: "", maneuver: "depart", distanceM: 300, fromIndex: 0, toIndex: 30 },
    { instruction: "Tournez à droite sur Rue A", name: "Rue A", maneuver: "right", distanceM: 200, fromIndex: 30, toIndex: 50 },
    { instruction: "Tournez à gauche sur Rue B", name: "Rue B", maneuver: "left", distanceM: 100, fromIndex: 50, toIndex: 59 },
  ];

  it("garde « tournez à droite » jusqu'à ce que le virage soit réellement pris", () => {
    const t = new RunTracker(path);
    let time = 0;
    for (let d = 0; d <= 290; d += 10) t.update(destination(s0, d, 0), 10, (time += 3000));
    expect(t.update(destination(s0, 295, 0), 10, (time += 2000)).nextStep?.maneuver).toBe("right");
    // Au coin, la position GPS « déborde » de 10 m sur la nouvelle rue : la consigne reste affichée.
    const p = t.update(destination(corner, 10, 90), 10, (time += 2000));
    expect(p.nextStep?.maneuver).toBe("right");
    expect(p.distanceToNextStepM).toBe(0);
    // Virage clairement pris : on passe à la consigne suivante.
    expect(t.update(destination(corner, 40, 90), 10, (time += 4000)).nextStep?.maneuver).toBe("left");
  });

  it("ne saute pas sur une portion ultérieure qui passe à côté", () => {
    // 250 m vers le nord, 30 m vers l'est, retour vers le sud par une rue parallèle.
    const a = destination(s0, 250, 0);
    const b = destination(a, 30, 90);
    const up: Position[] = Array.from({ length: 26 }, (_, i) => destination(s0, i * 10, 0));
    const across: Position[] = [destination(a, 15, 90), b];
    const down: Position[] = Array.from({ length: 25 }, (_, i) => destination(b, (i + 1) * 10, 180));
    const t = new RunTracker(makePath([...up, ...across, ...down], 0, 0));
    let time = 0;
    for (let d = 0; d <= 100; d += 10) t.update(destination(s0, d, 0), 10, (time += 3000));
    // Erreur GPS de 20 m vers l'est : plus proche de la rue du retour que de la rue actuelle.
    const p = t.update(destination(destination(s0, 110, 0), 20, 90), 10, (time += 3000));
    expect(p.alongM).toBeLessThan(150);
  });
});
