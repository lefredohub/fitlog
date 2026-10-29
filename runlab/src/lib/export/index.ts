/**
 * Registre des formats d'export. Pour ajouter un format (TCX « course », FIT…),
 * il suffit d'implémenter `RouteExporter` et de l'ajouter à `EXPORTERS`.
 */
import type { SavedRoute } from "@/lib/route/types";
import { buildGpx } from "./gpx";

export interface RouteExporter {
  id: string;
  label: string;
  extension: string;
  mimeType: string;
  build(route: Pick<SavedRoute, "name" | "path" | "stats">, opts?: { description?: string }): string;
}

export const gpxExporter: RouteExporter = {
  id: "gpx",
  label: "GPX",
  extension: "gpx",
  mimeType: "application/gpx+xml",
  build(route, opts) {
    return buildGpx({
      name: route.name,
      description: opts?.description,
      coordinates: route.path.coordinates,
    });
  },
};

export const EXPORTERS: readonly RouteExporter[] = [gpxExporter];

/** Nom de fichier sûr (sans accents ni caractères spéciaux). */
export function safeFileName(name: string, extension: string): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // diacritiques
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "parcours";
  return `${base}.${extension}`;
}
