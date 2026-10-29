/**
 * Traversées de route d'un parcours (mode « record ») et outils d'orientation.
 * Le comptage lui-même est fait sur le réseau routier des tuiles (voir crossings.ts).
 */
import type { LngLat, Position } from "./types";

/** Interruptions d'un parcours, telles qu'affichées et utilisées pour le tri. */
export interface Interruptions {
  /** Traversées de route (réseau routier OSM). */
  crossings: number;
  /** Dont grands axes (nationales, départementales principales). */
  majorCrossings: number;
  /** Emplacement des traversées (affichées sur la carte). */
  points?: LngLat[];
}

/** Cap (0–360°) de a vers b. */
export function bearing(a: LngLat | Position, b: LngLat | Position): number {
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Écart d'orientation entre deux directions, sans tenir compte du sens (0–90°). */
export function lineAngle(b1: number, b2: number): number {
  const d = Math.abs(b1 - b2) % 180;
  return d > 90 ? 180 - d : d;
}

/** Poids d'arrêt : une traversée de grand axe coûte plus qu'une petite rue. */
export function stopWeight(i: Partial<Interruptions>): number {
  return (i.crossings ?? 0) + (i.majorCrossings ?? 0);
}
