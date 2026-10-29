/**
 * Réseau de rues synthétique (quadrillage régulier), réservé aux tests.
 */
import { destination } from "@/lib/geo/geo";
import type { NetworkLine } from "@/lib/network/graph";
import type { LngLat } from "@/lib/route/types";

export const GRID_ORIGIN: LngLat = [-2.75, 47.65];

/** Quadrillage de rues tous les `blockM` mètres, sur ±`halfM` autour de l'origine. */
export function gridNetwork(blockM = 100, halfM = 2500, origin: LngLat = GRID_ORIGIN): NetworkLine[] {
  const at = (n: number, e: number) => destination(destination(origin, n, 0), e, 90);
  const lines: NetworkLine[] = [];
  const steps = Math.round(halfM / blockM);
  for (let i = -steps; i <= steps; i++) {
    const row: LngLat[] = [];
    const col: LngLat[] = [];
    for (let k = -steps; k <= steps; k++) {
      row.push(at(i * blockM, k * blockM));
      col.push(at(k * blockM, i * blockM));
    }
    lines.push({ coords: row, cls: "minor" }, { coords: col, cls: "minor" });
  }
  return lines;
}

/**
 * Quadrillage avec un « parc » sans rues : les tronçons dont le milieu tombe dans le
 * rectangle [nord min, nord max] × [est min, est max] (en mètres) sont retirés.
 */
export function gridWithPark(park: { n0: number; n1: number; e0: number; e1: number }, blockM = 100, halfM = 2500): NetworkLine[] {
  const at = (n: number, e: number) => destination(destination(GRID_ORIGIN, n, 0), e, 90);
  const steps = Math.round(halfM / blockM);
  const lines: NetworkLine[] = [];
  const inPark = (n: number, e: number) => n > park.n0 && n < park.n1 && e > park.e0 && e < park.e1;
  for (let i = -steps; i <= steps; i++) {
    for (let k = -steps; k < steps; k++) {
      const a = i * blockM;
      const b = k * blockM;
      if (!inPark(a, b + blockM / 2)) lines.push({ coords: [at(a, b), at(a, b + blockM)], cls: "minor" });
      if (!inPark(b + blockM / 2, a)) lines.push({ coords: [at(b, a), at(b + blockM, a)], cls: "minor" });
    }
  }
  return lines;
}
