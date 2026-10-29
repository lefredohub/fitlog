/**
 * Itinéraire synthétique, réservé aux tests unitaires.
 */
import type { Position, RoutedPath } from "@/lib/route/types";

export function makePath(coords: Position[], unpaved = 0, turns = 4): RoutedPath {
  const n = coords.length - 1;
  const split = Math.round(n * (1 - unpaved));
  const surfaces: RoutedPath["surfaces"] = [];
  if (split > 0) surfaces.push({ from: 0, to: split, value: "paved" });
  if (split < n) surfaces.push({ from: split, to: n, value: "unpaved" });
  const steps: RoutedPath["steps"] = [{ instruction: "Départ", name: "", maneuver: "depart", distanceM: 0, fromIndex: 0, toIndex: 0 }];
  for (let i = 0; i < turns; i++) {
    const idx = Math.round(((i + 1) * n) / (turns + 1));
    steps.push({ instruction: "Tournez à gauche", name: "Rue", maneuver: i % 2 ? "left" : "right", distanceM: 100, fromIndex: idx, toIndex: idx + 1 });
  }
  return { coordinates: coords, engineDistanceM: 0, surfaces, waytypes: [], steps, hasElevation: coords.every((c) => c[2] !== undefined) };
}
