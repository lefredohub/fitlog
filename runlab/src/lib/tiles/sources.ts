/**
 * Sources de données : tuiles vectorielles (réseau des chemins, noms, lieux) et tuiles de
 * terrain (altitudes). Données ouvertes, téléchargées directement par l'appareil : ni
 * compte, ni clé, ni quota. Une page hôte (Menhir…) ou un test peut les remplacer, par
 * exemple par des fichiers auto-hébergés, via `window.RUNLAB_CONFIG`.
 */
export interface DataSources {
  /** TileJSON des tuiles vectorielles (schéma OpenMapTiles). */
  tiles: string;
  /** Tuiles de terrain « Terrarium » ({z}, {x}, {y} remplacés). */
  terrain: string;
}

export const DEFAULT_SOURCES: DataSources = {
  tiles: "https://tiles.openfreemap.org/planet",
  terrain: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
};

let current: DataSources = DEFAULT_SOURCES;

export function setSources(sources: Partial<DataSources>): void {
  current = { ...DEFAULT_SOURCES, ...sources };
}

export function sources(): DataSources {
  return current;
}
