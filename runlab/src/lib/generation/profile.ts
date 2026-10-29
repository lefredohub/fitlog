/**
 * Coût relatif des voies pour planifier les parcours (1 = neutre, plus élevé = évité,
 * null = interdit). Par défaut, des parcours agréables et praticables : allées et
 * rues calmes plutôt que grands axes ; jamais de voie interdite aux piétons, d'allée
 * privée ni de parking.
 */
import { WALKABLE, type CostFactor } from "@/lib/network/graph";
import type { RouteKind, RoutePreferences } from "@/lib/route/types";

/** Voies de service sans intérêt pour courir : entrées privées, allées de parking, drive. */
const PRIVATE_SERVICE = new Set(["driveway", "parking_aisle", "drive-through", "emergency_access"]);

export function networkCost(kind: RouteKind, prefs: RoutePreferences): CostFactor {
  return (line) => {
    if (!WALKABLE.has(line.cls)) return null;
    if (line.access === "no" || line.access === "private" || line.foot === "no") return null;
    if (line.cls === "service" && line.service && PRIVATE_SERVICE.has(line.service)) return null;
    // Escaliers : seulement en trail (hors mode record).
    if (line.subclass === "steps" && (kind === "road" || prefs.forRecord)) return null;
    const unpaved = line.surface === "unpaved" || line.cls === "track";
    const offRoad = line.cls === "path" || line.cls === "track";
    let f = 1;
    // Grands axes : bruit, circulation, feux.
    if (line.cls === "primary") f = 1.6;
    else if (line.cls === "secondary") f = 1.4;
    else if (line.cls === "tertiary") f = 1.15;
    else if (line.cls === "service") f = 1.2;
    if (kind === "trail") f *= offRoad || unpaved ? 0.7 : 1.3;
    else {
      // Route : allées et voies vertes revêtues sont agréables ; la terre l'est moins.
      if (offRoad && !unpaved) f *= 0.9;
      if (unpaved) f *= 1.15;
    }
    if (prefs.forRecord) {
      if (line.cls === "primary" || line.cls === "secondary") f *= 1.5;
      else if (line.cls === "tertiary") f *= 1.2;
    }
    return f;
  };
}
