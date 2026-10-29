/** Messages échangés entre l'interface et le fil de calcul. */
import type { GenerateInput, GenerateResult } from "@/lib/generation/types";
import type { LngLat } from "@/lib/route/types";
import type { RoutingErrorCode } from "@/lib/routing/errors";
import type { SearchResult } from "@/lib/search/search";
import type { DataSources } from "@/lib/tiles/sources";

export interface EngineCalls {
  config: { args: Partial<DataSources>; result: void };
  generate: { args: GenerateInput; result: GenerateResult };
  search: { args: { query: string; focus: LngLat }; result: SearchResult[] };
  reverse: { args: LngLat; result: string | null };
  /** Prépare la zone (tuiles) pour une recherche et un calcul instantanés. */
  warm: { args: LngLat; result: void };
}

export type EngineRequest = { [K in keyof EngineCalls]: { id: number; type: K; args: EngineCalls[K]["args"] } }[keyof EngineCalls];

export type EngineResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; code: RoutingErrorCode; message: string };
