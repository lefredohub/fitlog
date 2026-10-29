/**
 * Sélection des propositions à présenter : uniquement dans la fourchette de distance,
 * sans doublon, la meilleure d'abord (selon le mode choisi).
 */
import { overlapRatio } from "@/lib/geo/geo";
import { stopWeight } from "@/lib/route/interruptions";
import { climbRate, unpavedShare, knownSurfaceShare } from "@/lib/route/stats";
import type { RouteKind, RoutePreferences } from "@/lib/route/types";
import type { Candidate, Notice, Proposal } from "./types";

/** Au-delà de ce recouvrement, deux tracés sont considérés comme identiques. */
export const DUPLICATE_OVERLAP = 0.8;
export const MAX_PROPOSALS = 3;

/**
 * Fourchette de distance acceptée : de la distance visée à +5 %, jamais moins.
 * 10 km → 10 à 10,5 km ; 5 km → 5 à 5,25 km.
 */
export const DISTANCE_MARGIN = 0.05;

export function distanceWindow(targetM: number): { minM: number; maxM: number } {
  return { minM: targetM, maxM: targetM * (1 + DISTANCE_MARGIN) };
}

export function inWindow(distanceM: number, targetM: number): boolean {
  const { minM, maxM } = distanceWindow(targetM);
  // Aucune tolérance : jamais en dessous de la distance demandée, jamais au-delà de +5 %.
  return distanceM >= minM && distanceM <= maxM;
}

/** Distance visée au centre de la fourchette. */
export function aimDistance(targetM: number): number {
  return targetM * (1 + DISTANCE_MARGIN / 2);
}

/**
 * Note d'une proposition (plus bas = mieux) : peu de virages, peu de dénivelé inutile ;
 * en mode record, le moins de traversées ; en trail, le plus de chemins.
 */
function penalty(c: Candidate, kind: RouteKind, prefs: RoutePreferences): number {
  const km = Math.max(c.stats.distanceM / 1000, 0.1);
  const turns = c.stats.turnCount / km;
  const climb = climbRate(c.stats) ?? 0;
  if (prefs.forRecord) {
    const stops = c.stats.interruptions ? stopWeight(c.stats.interruptions) / km : 0;
    // Un circuit au calme est le cœur du mode record.
    const circuit = c.recipe.type === "planned" && c.recipe.circuit ? -0.3 : 0;
    return stops * 0.5 + climb / 20 + turns * 0.05 + circuit;
  }
  let p = turns * 0.08 + climb / 60;
  if (knownSurfaceShare(c.stats) >= 0.5) p += kind === "trail" ? (1 - unpavedShare(c.stats)) * 0.8 : unpavedShare(c.stats);
  return p;
}

export function selectVariants(
  candidates: Candidate[],
  targetM: number,
  kind: RouteKind,
  prefs: RoutePreferences,
): { proposals: Proposal[]; notices: Notice[] } {
  const notices: Notice[] = [];
  const pool = candidates.filter((c) => inWindow(c.stats.distanceM, targetM));
  if (pool.length === 0) {
    const closest = candidates.reduce((a, b) => (Math.abs(b.stats.distanceM - targetM) < Math.abs(a.stats.distanceM - targetM) ? b : a), candidates[0]!);
    const { minM, maxM } = distanceWindow(targetM);
    if (closest) notices.push({ code: "OUT_OF_WINDOW", closestM: closest.stats.distanceM, minM, maxM });
    return { proposals: [], notices };
  }
  const ranked = [...pool].sort((a, b) => penalty(a, kind, prefs) - penalty(b, kind, prefs));
  const shown: Candidate[] = [];
  for (const c of ranked) {
    if (shown.length >= MAX_PROPOSALS) break;
    const dup = shown.some(
      (k) =>
        overlapRatio(c.path.coordinates, k.path.coordinates) >= DUPLICATE_OVERLAP &&
        overlapRatio(k.path.coordinates, c.path.coordinates) >= DUPLICATE_OVERLAP,
    );
    if (!dup) shown.push(c);
  }
  if (shown.some((c) => !c.path.hasElevation)) notices.push({ code: "ELEVATION_MISSING" });
  return { proposals: shown.map((c, i) => ({ ...c, recommended: i === 0 })), notices };
}
