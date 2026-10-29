/**
 * Texte des consignes de guidage.
 *
 * Les consignes du moteur sont reprises telles quelles, sauf pour les ronds-points :
 * le numéro de sortie fourni compte toutes les voies OpenStreetMap (allées, accès de
 * service…) et se révèle souvent faux sur le terrain. On indique donc la rue de
 * sortie plutôt qu'un numéro.
 */
import type { RouteStep } from "@/lib/route/types";

export interface InstructionMessages {
  roundabout: (street: string) => string;
  roundaboutNoName: string;
  now: string;
  inMeters: (meters: number) => string;
}

export function instructionText(step: RouteStep, t: InstructionMessages): string {
  if (step.maneuver === "roundabout") return step.name ? t.roundabout(step.name) : t.roundaboutNoName;
  return step.instruction;
}

/** Distance d'annonce vocale : assez tôt pour réagir, assez tard pour ne pas se tromper d'intersection. */
export const VOICE_ANNOUNCE_M = 40;

/** Consignes qui méritent une annonce vocale (« continuez tout droit » n'en fait pas partie). */
export function shouldAnnounce(step: RouteStep): boolean {
  return step.maneuver !== "straight" && step.maneuver !== "depart" && step.maneuver !== "roundabout-exit";
}

export function spokenText(step: RouteStep, distanceM: number, t: InstructionMessages): string {
  const base = instructionText(step, t);
  if (distanceM < 15) return base;
  return `${t.inMeters(Math.round(distanceM / 10) * 10)}, ${base.charAt(0).toLowerCase()}${base.slice(1)}`;
}
