/**
 * Modèle de données d'un parcours planifié.
 *
 * Convention : toutes les coordonnées sont au format GeoJSON [longitude, latitude],
 * avec l'altitude en mètres en troisième position lorsqu'elle est connue.
 */

export type LngLat = [lng: number, lat: number];
export type Position = [lng: number, lat: number, ele?: number];

/** Type de sortie : route (revêtu de préférence) ou trail (chemins de préférence). */
export type RouteKind = "road" | "trail";

/** Forme du parcours. */
export type RouteShape = "loop" | "outback";

export interface RoutePreferences {
  /** « Idéal pour un record » : plat, rues calmes, le moins de traversées. */
  forRecord?: boolean;
}

/** Revêtement simplifié, déduit des données OpenStreetMap. */
export type SurfaceKind = "paved" | "unpaved" | "unknown";

/** Type de voie simplifié, déduit des données OpenStreetMap. */
export type WayKind = "road" | "street" | "path" | "track" | "footway" | "cycleway" | "steps" | "other" | "unknown";

/** Plage d'indices de la géométrie [from, to] partageant une même valeur. */
export interface Segment<T> {
  from: number;
  to: number;
  value: T;
}

/** Instruction de navigation fournie par le moteur de routage. */
export interface RouteStep {
  instruction: string;
  name: string;
  /** Code de manœuvre normalisé. */
  maneuver: Maneuver;
  distanceM: number;
  /** Indice de la géométrie où commence la manœuvre. */
  fromIndex: number;
  toIndex: number;
}

export type Maneuver =
  | "left"
  | "right"
  | "sharp-left"
  | "sharp-right"
  | "slight-left"
  | "slight-right"
  | "straight"
  | "roundabout"
  | "roundabout-exit"
  | "uturn"
  | "keep-left"
  | "keep-right"
  | "depart"
  | "arrive"
  /** Début d'un nouveau tour (parcours en plusieurs tours). */
  | "lap"
  | "other";

/** Itinéraire tel que calculé par le moteur de routage (données réelles). */
export interface RoutedPath {
  coordinates: Position[];
  /** Distance annoncée par le moteur (mètres). */
  engineDistanceM: number;
  surfaces: Segment<SurfaceKind>[];
  waytypes: Segment<WayKind>[];
  steps: RouteStep[];
  /** Indique si le moteur a fourni l'altitude de chaque point. */
  hasElevation: boolean;
}

export interface TerrainBreakdown {
  /** Distances en mètres par catégorie. */
  surface: Record<SurfaceKind, number>;
  way: Record<WayKind, number>;
}

export interface RouteStats {
  distanceM: number;
  /** null lorsque l'altitude n'est pas disponible. */
  ascentM: number | null;
  descentM: number | null;
  minEleM: number | null;
  maxEleM: number | null;
  /** Point culminant (distance depuis le départ). */
  highPoint: { distanceM: number; eleM: number; coord: LngLat } | null;
  /** Pente moyenne la plus forte mesurée sur une fenêtre glissante, en %. */
  maxGradePct: number | null;
  terrain: TerrainBreakdown;
  /** Nombre de changements de direction notables (indicateur de simplicité). */
  turnCount: number;
  /** Traversées de route (réseau OSM), calculées uniquement en mode « record ». */
  interruptions?: { crossings: number; majorCrossings: number; points?: LngLat[] };
}

export interface RouteRequestParams {
  kind: RouteKind;
  shape: RouteShape;
  /** Distance visée en mètres. */
  targetDistanceM?: number;
  preferences: RoutePreferences;
  /** Boucle en plusieurs tours (1 par défaut). */
  laps?: number;
}

/** Parcours enregistré par l'utilisateur. */
export interface SavedRoute {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  params: RouteRequestParams;
  start: LngLat;
  startLabel?: string;
  path: RoutedPath;
  stats: RouteStats;
}

export const DEFAULT_PREFERENCES: RoutePreferences = { forRecord: false };
