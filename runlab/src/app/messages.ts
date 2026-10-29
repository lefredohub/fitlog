/** Messages d'erreur, en français clair. */
import type { RoutingErrorCode } from "@/lib/routing/errors";

export const ERRORS: Partial<Record<RoutingErrorCode, string>> & { default: string } = {
  NOT_ROUTABLE: "Aucune rue ni chemin praticable près du départ. Touche la carte plus près d'une rue.",
  NO_ROUTE: "Aucun parcours trouvé à cette distance ici. Essaie une autre distance ou un autre départ.",
  TOO_LONG: "Trop long pour une seule boucle (30 km au plus) : choisis plusieurs tours, un aller-retour, ou moins de kilomètres.",
  UPSTREAM: "La carte des chemins n'a pas pu être téléchargée. Vérifie la connexion puis réessaie.",
  default: "Le calcul a échoué. Réessaie.",
};

export const GEO_ERRORS: Record<string, string> = {
  denied: "Localisation refusée : touche la carte pour choisir le départ.",
  insecure: "La localisation demande une adresse sécurisée (https).",
  timeout: "Position introuvable pour le moment.",
  unavailable: "Position indisponible.",
  unsupported: "Localisation non prise en charge.",
};
