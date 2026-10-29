import { describe, expect, it } from "vitest";
import { destination } from "@/lib/geo/geo";
import type { LngLat } from "@/lib/route/types";
import { normalize, SearchIndex, type SearchEntry } from "./search";

const O: LngLat = [-2.75, 47.65];
const at = (m: number): LngLat => destination(O, m, 90);

const entries: SearchEntry[] = [
  { name: "Place Gambetta", kind: "street", coord: at(200) },
  { name: "Rue Gambetta", kind: "street", coord: at(5000) },
  { name: "Avenue de Verdun", kind: "street", coord: at(800) },
  { name: "Avenue de Verdun", kind: "street", coord: at(900) },
  { name: "12 Avenue de Verdun", kind: "address", coord: at(850) },
  { name: "1 Avenue de Verdun", kind: "address", coord: at(700) },
  { name: "Étang au Duc", kind: "water", coord: at(1500) },
  { name: "Saint-Avé", kind: "place", coord: at(6000) },
];

describe("recherche d'adresse locale", () => {
  const index = new SearchIndex();

  it("normalise accents, majuscules et ponctuation", () => {
    expect(normalize("Étang-au-Duc, Vannes")).toBe("etang au duc vannes");
  });

  it("trouve par début de mots et abréviations, le plus proche d'abord", () => {
    const res = index.search(entries, "pl gamb", O);
    expect(res[0]!.name).toBe("Place Gambetta");
    expect(index.search(entries, "gambetta", O).map((r) => r.name)).toEqual(["Place Gambetta", "Rue Gambetta"]);
  });

  it("une même rue découpée en tronçons n'apparaît qu'une fois", () => {
    const res = index.search(entries, "av verdun", O);
    expect(res.filter((r) => r.kind === "street" && r.name === "Avenue de Verdun")).toHaveLength(1);
  });

  it("un numéro vise l'adresse exacte", () => {
    const res = index.search(entries, "12 av de verdun", O);
    expect(res[0]).toMatchObject({ name: "12 Avenue de Verdun", kind: "address" });
    expect(res.some((r) => r.name === "1 Avenue de Verdun")).toBe(false);
  });

  it("un numéro qui fait partie du nom départage les rues", () => {
    const named: SearchEntry[] = [
      { name: "Rue du 8 Mai", kind: "street", coord: at(900) },
      { name: "Rue du 11 Novembre", kind: "street", coord: at(100) },
    ];
    expect(index.search(named, "rue 8", O)[0]!.name).toBe("Rue du 8 Mai");
  });

  it("un numéro inconnu propose quand même la rue", () => {
    expect(index.search(entries, "99 av de verdun", O)[0]).toMatchObject({ name: "Avenue de Verdun", kind: "street" });
  });

  it("un même lieu (plan d'eau et point d'intérêt) n'apparaît qu'une fois", () => {
    const dup = [...entries, { name: "Étang au Duc", kind: "poi" as const, coord: at(1900) }];
    expect(index.search(dup, "etang duc", O).filter((r) => r.name === "Étang au Duc")).toHaveLength(1);
  });

  it("trouve les lieux sans accent et les communes", () => {
    expect(index.search(entries, "etang duc", O)[0]!.name).toBe("Étang au Duc");
    expect(index.search(entries, "saint ave", O)[0]!.name).toBe("Saint-Avé");
  });

  it("rien pour une recherche sans correspondance", () => {
    expect(index.search(entries, "zzz", O)).toEqual([]);
    expect(index.search(entries, "  ", O)).toEqual([]);
  });

  it("reste instantanée sur un quartier entier (20 000 noms)", () => {
    const many: SearchEntry[] = Array.from({ length: 20_000 }, (_, i) => ({ name: `Rue Numéro ${i} des Lilas`, kind: "street", coord: at(i) }));
    index.search(many, "lilas", O);
    const t = performance.now();
    index.search(many, "rue num lilas", O);
    expect(performance.now() - t).toBeLessThan(150);
  });
});
