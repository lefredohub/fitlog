import { describe, expect, it } from "vitest";
import { buildGpx, escapeXml } from "./gpx";
import { safeFileName } from "./index";

describe("export GPX", () => {
  const coords: [number, number, number][] = [
    [2.3522, 48.8566, 35.2],
    [2.3530, 48.8570, 36.0],
    [2.3540, 48.8580, 38.4],
  ];

  it("produit un GPX 1.1 bien formé", () => {
    const xml = buildGpx({ name: "Boucle du parc", coordinates: coords });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<gpx version="1.1" creator="Menhir" xmlns="http://www.topografix.com/GPX/1/1"');
    expect(xml.match(/<trkpt /g)).toHaveLength(3);
    expect(xml).toContain('<trkpt lat="48.856600" lon="2.352200"><ele>35.2</ele></trkpt>');
    expect(xml).toContain("<name>Boucle du parc</name>");
    expect(xml.trim().endsWith("</gpx>")).toBe(true);
  });

  it("ne contient aucun horodatage (itinéraire planifié, pas une activité)", () => {
    const xml = buildGpx({ name: "Test", coordinates: coords });
    expect(xml).not.toContain("<time>");
  });

  it("omet l'altitude quand elle est inconnue", () => {
    const xml = buildGpx({ name: "Sans alti", coordinates: [[2, 48], [2.1, 48.1]] });
    expect(xml).not.toContain("<ele>");
  });

  it("échappe les caractères spéciaux", () => {
    const xml = buildGpx({ name: 'Côte <raide> & "sentier"', coordinates: coords });
    expect(xml).toContain("<name>Côte &lt;raide&gt; &amp; &quot;sentier&quot;</name>");
    expect(escapeXml("a\u0001b")).toBe("ab");
  });

  it("rejette un tracé invalide", () => {
    expect(() => buildGpx({ name: "x", coordinates: [[2, 48]] })).toThrow();
    expect(() => buildGpx({ name: "x", coordinates: [[2, 48], [2, 95]] })).toThrow();
  });

  it("a des balises équilibrées", () => {
    const xml = buildGpx({ name: "A & B", coordinates: coords });
    const opens = (xml.match(/<(trkpt|trkseg|trk|gpx|metadata)\b/g) ?? []).length;
    const closes = (xml.match(/<\/(trkpt|trkseg|trk|gpx|metadata)>/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it("génère un nom de fichier sûr", () => {
    expect(safeFileName("Boucle 10 km — Lyon 7ᵉ !", "gpx")).toBe("boucle-10-km-lyon-7e.gpx");
    expect(safeFileName("***", "gpx")).toBe("parcours.gpx");
  });
});
