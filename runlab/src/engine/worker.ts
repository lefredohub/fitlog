/// <reference lib="webworker" />
/**
 * Fil de calcul : génération des parcours, recherche d'adresse et nom des lieux, hors du
 * fil de l'interface (l'écran reste fluide pendant le calcul).
 */
import { generateProposals } from "@/lib/generation/planner";
import { RoutingError } from "@/lib/routing/errors";
import { reverseLabel } from "@/lib/search/reverse";
import { SearchIndex, type SearchEntry } from "@/lib/search/search";
import { setSources } from "@/lib/tiles/sources";
import { elevationFor } from "@/lib/tiles/terrain";
import { fetchNetwork, fetchPlaces } from "@/lib/tiles/tiles";
import type { LngLat } from "@/lib/route/types";
import type { EngineCalls, EngineRequest, EngineResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

/** Rayon des rues et adresses proposées à la recherche (m). */
const SEARCH_RADIUS_M = 2500;
const index = new SearchIndex();

/**
 * Zone de recherche calée sur une grille d'environ 1 km : déplacer un peu la carte
 * réutilise les tuiles déjà chargées.
 */
function searchArea(p: LngLat): LngLat {
  return [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
}

/** Noms de la dernière zone chargée : réutilisés tant qu'on cherche à moins de 1,5 km. */
let lastArea: { center: LngLat; entries: SearchEntry[] } | null = null;

async function loadArea(center: LngLat): Promise<SearchEntry[]> {
  const area = searchArea(center);
  const [near, places] = await Promise.all([fetchNetwork(area, SEARCH_RADIUS_M), fetchPlaces(area).catch(() => [])]);
  const entries = [...near.entries, ...places];
  lastArea = { center: area, entries };
  return entries;
}

function near(a: LngLat, b: LngLat, m: number) {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111_320) < m;
}

const handlers: { [K in keyof EngineCalls]: (args: EngineCalls[K]["args"]) => Promise<EngineCalls[K]["result"]> } = {
  async config(sources) {
    setSources(sources);
  },
  generate(input) {
    return generateProposals(input, { network: fetchNetwork, elevation: elevationFor });
  },
  async search({ query, focus }) {
    // Zone déjà chargée tout près : réponse immédiate ; la nouvelle zone se charge en fond.
    if (lastArea && near(lastArea.center, focus, 1500)) {
      if (!near(lastArea.center, searchArea(focus), 10)) void loadArea(focus).catch(() => {});
      return index.search(lastArea.entries, query, focus);
    }
    return index.search(await loadArea(focus), query, focus);
  },
  async reverse(coord) {
    const data = await fetchNetwork(coord, 300);
    return reverseLabel(data.lines, data.entries, coord);
  },
  async warm(center) {
    await loadArea(center);
  },
};

self.onmessage = async (ev: MessageEvent<EngineRequest>) => {
  const { id, type, args } = ev.data;
  let res: EngineResponse;
  try {
    const value = await (handlers[type] as (a: unknown) => Promise<unknown>)(args);
    res = { id, ok: true, value };
  } catch (err) {
    const code = err instanceof RoutingError ? err.code : "UPSTREAM";
    res = { id, ok: false, code, message: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(res);
};
