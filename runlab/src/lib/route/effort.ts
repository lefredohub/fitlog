/**
 * Estimations d'effort : temps de course et niveau de difficulté.
 *
 * Ce sont des estimations indicatives, présentées comme telles dans l'interface.
 * Règle utilisée : le « kilomètre-effort », couramment employé en trail,
 * où 100 m de dénivelé positif équivalent à 1 km à plat.
 */
import type { RouteStats } from "./types";

export const METERS_CLIMB_PER_EFFORT_KM = 100;

export function effortKm(stats: RouteStats): number {
  const km = stats.distanceM / 1000;
  return km + (stats.ascentM ?? 0) / METERS_CLIMB_PER_EFFORT_KM;
}

export interface TimeEstimateOptions {
  /** Allure sur le plat, en secondes par kilomètre. */
  paceSecPerKm: number;
  /** Tenir compte du dénivelé (kilomètre-effort). */
  accountForClimb: boolean;
}

/** Durée estimée en secondes. */
export function estimateDurationSec(stats: RouteStats, opts: TimeEstimateOptions): number {
  const km = opts.accountForClimb ? effortKm(stats) : stats.distanceM / 1000;
  return Math.round(km * opts.paceSecPerKm);
}
