/**
 * Export GPX 1.1 d'un itinéraire PLANIFIÉ.
 *
 * Choix délibérés pour la compatibilité (Garmin Connect, Coros, Suunto, Strava
 * « routes », Komoot…) et l'honnêteté des données :
 * - un seul <trk> continu : c'est le format le mieux importé comme « parcours » ;
 * - AUCUN horodatage (<time>) sur les points : le fichier ne peut pas être
 *   confondu avec une activité réellement enregistrée ;
 * - l'altitude (<ele>) est incluse uniquement si le moteur l'a fournie.
 */
import type { Position } from "@/lib/route/types";

export interface GpxInput {
  name: string;
  description?: string;
  coordinates: readonly Position[];
  /** Points d'intérêt facultatifs (départ, point culminant…). */
  waypoints?: readonly { name: string; coord: Position }[];
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Caractères de contrôle interdits en XML 1.0.
    // eslint-disable-next-line no-control-regex -- retirés volontairement
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

const fmtCoord = (n: number) => n.toFixed(6);
const fmtEle = (n: number) => n.toFixed(1);

function point(tag: "trkpt" | "wpt", c: Position, inner = ""): string {
  const ele = c[2] !== undefined && Number.isFinite(c[2]) ? `<ele>${fmtEle(c[2])}</ele>` : "";
  return `<${tag} lat="${fmtCoord(c[1])}" lon="${fmtCoord(c[0])}">${ele}${inner}</${tag}>`;
}

export function buildGpx(input: GpxInput): string {
  if (input.coordinates.length < 2) {
    throw new Error("Un parcours doit contenir au moins deux points pour être exporté.");
  }
  for (const c of input.coordinates) {
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[1]) > 90 || Math.abs(c[0]) > 180) {
      throw new Error("Coordonnée invalide dans le parcours.");
    }
  }
  const name = escapeXml(input.name.trim() || "Parcours Menhir");
  const desc = input.description ? `<desc>${escapeXml(input.description)}</desc>` : "";
  const wpts = (input.waypoints ?? []).map((w) => point("wpt", w.coord, `<name>${escapeXml(w.name)}</name>`));
  const pts = input.coordinates.map((c) => point("trkpt", c));

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="Menhir" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`,
    `<metadata><name>${name}</name>${desc}</metadata>`,
    ...wpts,
    `<trk><name>${name}</name><type>running</type><trkseg>`,
    ...pts,
    `</trkseg></trk>`,
    `</gpx>`,
    "",
  ].join("\n");
}
