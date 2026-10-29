import type { LngLat, RouteKind, RoutePreferences, RoutedPath, RouteStats } from "@/lib/route/types";

export interface GenerateInput {
  start: LngLat;
  kind: RouteKind;
  shape: "loop" | "outback";
  targetDistanceM: number;
  preferences: RoutePreferences;
  /** Change les directions pour obtenir d'autres propositions. */
  variation: number;
  /** Boucle : nombre de tours (la distance visée est répartie sur les tours). */
  laps?: number;
}

/** Origine d'une proposition. */
export type Recipe =
  | { type: "outback"; bearing: number }
  /** Boucle planifiée sur le réseau local. */
  | {
      type: "planned";
      laps: number;
      /** Circuit répété autour d'un lieu piéton (longueurs mesurées sur le tracé final). */
      circuit?: CircuitInfo;
    };

export interface CircuitInfo {
  kind: "water" | "park" | "wood" | "path";
  name?: string;
  lapM: number;
  approachM: number;
  partialM: number;
  backM: number;
}

export interface Candidate {
  id: string;
  path: RoutedPath;
  stats: RouteStats;
  recipe: Recipe;
}

export interface Proposal extends Candidate {
  recommended: boolean;
}

export type Notice = { code: "OUT_OF_WINDOW"; closestM: number; minM: number; maxM: number } | { code: "ELEVATION_MISSING" };

export interface GenerateResult {
  proposals: Proposal[];
  notices: Notice[];
}
