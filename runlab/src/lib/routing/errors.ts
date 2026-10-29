/**
 * Erreurs de calcul normalisées : le moteur ne renvoie que des codes, l'interface les
 * traduit en messages utiles pour le coureur.
 */
export const ROUTING_ERROR_CODES = [
  "NOT_ROUTABLE", // aucun chemin praticable près du point
  "NO_ROUTE", // aucun parcours trouvé
  "TOO_LONG", // distance au-delà des limites du calcul sur l'appareil
  "UPSTREAM", // carte des chemins indisponible
] as const;

export type RoutingErrorCode = (typeof ROUTING_ERROR_CODES)[number];

export class RoutingError extends Error {
  constructor(
    public readonly code: RoutingErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "RoutingError";
  }
}
