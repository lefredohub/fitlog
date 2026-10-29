/**
 * Suivi de la progression d'un coureur sur un parcours planifié.
 *
 * Logique pure (sans GPS ni carte) : on lui fournit des positions, il renvoie la
 * distance parcourue le long du tracé, l'écart au tracé et la prochaine
 * instruction. Rien n'est enregistré : il ne produit aucune trace d'activité.
 */
import { cumulativeDistances, projectOnPath } from "@/lib/geo/geo";
import type { LngLat, RoutedPath, RouteStep } from "@/lib/route/types";

export const OFF_ROUTE_THRESHOLD_M = 40;
/** Nombre de positions consécutives hors tracé avant d'alerter. */
export const OFF_ROUTE_CONFIRMATIONS = 2;
/**
 * Une manœuvre reste affichée jusqu'à ce que le coureur l'ait dépassée de cette
 * distance : l'imprécision du GPS (±10 m) ne doit pas faire basculer l'instruction
 * avant que le virage soit réellement pris.
 */
export const MANEUVER_PASSED_M = 25;
/** Vitesse maximale plausible (m/s) pour limiter les sauts de position le long du tracé. */
const MAX_SPEED_MS = 8;
const LOOKBACK_M = 60;
const LOOKAHEAD_M = 600;
const ARRIVAL_M = 30;

export interface RunProgress {
  alongM: number;
  remainingM: number;
  totalM: number;
  distanceToRouteM: number;
  offRoute: boolean;
  nextStep: RouteStep | null;
  distanceToNextStepM: number | null;
  arrived: boolean;
}

interface StepMark {
  step: RouteStep;
  atM: number;
}

export class RunTracker {
  private readonly cum: number[];
  private readonly total: number;
  private readonly marks: StepMark[];
  private along = 0;
  private offCount = 0;
  private lastTime: number | null = null;

  constructor(private readonly path: RoutedPath) {
    this.cum = cumulativeDistances(path.coordinates);
    this.total = this.cum[this.cum.length - 1] ?? 0;
    this.marks = path.steps
      // Le départ et la sortie d'un rond-point (déjà annoncée à l'entrée) ne sont pas des consignes utiles.
      .filter((s) => s.maneuver !== "depart" && s.maneuver !== "roundabout-exit")
      .map((s) => ({ step: s, atM: this.cum[Math.min(s.fromIndex, this.cum.length - 1)] ?? 0 }))
      .sort((a, b) => a.atM - b.atM);
  }

  update(position: LngLat, accuracyM = 10, timestampMs: number = Date.now()): RunProgress {
    const coords = this.path.coordinates;
    const threshold = Math.max(OFF_ROUTE_THRESHOLD_M, Math.min(accuracyM, 100));
    const dt = this.lastTime === null ? 10 : Math.max(1, (timestampMs - this.lastTime) / 1000);
    this.lastTime = timestampMs;
    // 1. Fenêtre « plausible » : on ne peut pas avoir avancé de plus que la vitesse max.
    //    Évite de sauter sur une portion ultérieure du tracé qui passe à proximité.
    const plausibleAhead = 30 + MAX_SPEED_MS * dt + accuracyM;
    let proj = projectOnPath(position, coords, this.cum, { minM: this.along - LOOKBACK_M, maxM: this.along + plausibleAhead }, this.along);
    // 2. Sinon, fenêtre élargie (raccourci, position GPS tardive…), puis tout le tracé.
    if (!proj || proj.distanceToPathM > threshold) {
      const wide = projectOnPath(position, coords, this.cum, { minM: this.along - LOOKBACK_M, maxM: this.along + LOOKAHEAD_M }, this.along);
      if (wide && (!proj || wide.distanceToPathM < proj.distanceToPathM - 10)) proj = wide;
    }
    if (!proj || proj.distanceToPathM > threshold) {
      const global = projectOnPath(position, coords, this.cum);
      if (global && (!proj || global.distanceToPathM < proj.distanceToPathM - 10)) proj = global;
    }
    if (!proj) {
      return this.snapshot(Infinity);
    }
    const off = proj.distanceToPathM > threshold;
    this.offCount = off ? this.offCount + 1 : 0;
    if (!off) this.along = Math.max(this.along - LOOKBACK_M, proj.alongM);
    return this.snapshot(proj.distanceToPathM);
  }

  private snapshot(distanceToRoute: number): RunProgress {
    const next = this.marks.find((m) => m.atM > this.along - MANEUVER_PASSED_M) ?? null;
    const arrived = this.total - this.along <= ARRIVAL_M && distanceToRoute <= OFF_ROUTE_THRESHOLD_M;
    return {
      alongM: this.along,
      remainingM: Math.max(0, this.total - this.along),
      totalM: this.total,
      distanceToRouteM: distanceToRoute,
      offRoute: this.offCount >= OFF_ROUTE_CONFIRMATIONS,
      nextStep: next?.step ?? null,
      distanceToNextStepM: next ? Math.max(0, next.atM - this.along) : null,
      arrived,
    };
  }
}
