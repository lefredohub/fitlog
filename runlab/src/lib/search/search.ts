/**
 * Recherche d'adresse sans service externe : rues, adresses, lieux et points d'intérêt
 * lus dans les tuiles de la carte autour de l'endroit regardé. Tout est en mémoire :
 * une recherche prend quelques millisecondes.
 */
import type { LngLat } from "@/lib/route/types";

export type SearchKind = "address" | "street" | "poi" | "place" | "water";

export interface SearchEntry {
  name: string;
  kind: SearchKind;
  coord: LngLat;
}

export interface SearchResult extends SearchEntry {
  /** Distance au point de recherche (m). */
  distanceM: number;
}

/** Mots trop courants pour départager deux noms. */
const STOP = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "a", "au", "aux", "et", "en", "sur"]);
/** Abréviations courantes dans une adresse tapée. */
const ABBREV: Record<string, string> = {
  av: "avenue",
  ave: "avenue",
  bd: "boulevard",
  bld: "boulevard",
  bvd: "boulevard",
  pl: "place",
  st: "saint",
  ste: "sainte",
  ch: "chemin",
  che: "chemin",
  imp: "impasse",
  all: "allee",
  rte: "route",
  sq: "square",
  fbg: "faubourg",
  qu: "quai",
};

/** Minuscules, sans accents ni ponctuation. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

const KIND_WEIGHT: Record<SearchKind, number> = { address: 0.4, street: 0.3, poi: 0.35, place: 0.5, water: 0.3 };

/** Index des noms : la normalisation de chaque nom n'est faite qu'une fois. */
export class SearchIndex {
  private readonly memo = new Map<string, string[]>();

  private tokensOf(name: string): string[] {
    let t = this.memo.get(name);
    if (!t) {
      t = tokens(name);
      this.memo.set(name, t);
      if (this.memo.size > 100_000) this.memo.clear();
    }
    return t;
  }

  /**
   * Meilleurs résultats pour une recherche : chaque mot tapé doit commencer un mot du nom
   * (« pl gamb » trouve « Place Gambetta ») ; les noms les plus complets et les plus proches
   * passent devant. Une même rue découpée en tronçons n'apparaît qu'une fois.
   */
  search(entries: readonly SearchEntry[], query: string, focus: LngLat, limit = 6): SearchResult[] {
    let q = tokens(query);
    const meaningful = q.filter((t) => !STOP.has(t));
    if (meaningful.length > 0) q = meaningful;
    if (q.length === 0) return [];
    const number = q.find((t) => /^\d+[a-z]?$/.test(t));
    const kx = 111_320 * Math.cos((focus[1] * Math.PI) / 180);
    const scored: { e: SearchEntry; score: number; d: number }[] = [];
    for (const e of entries) {
      const et = this.tokensOf(e.name);
      let matched = 0;
      let exact = 0;
      let ok = true;
      for (const t of q) {
        // Un numéro absent du nom (rue sans ce numéro dans la carte) : on propose quand
        // même la rue ; s'il fait partie du nom (« Rue du 8 Mai »), il départage.
        if (t === number && e.kind !== "address") {
          if (et.includes(t)) exact++;
          continue;
        }
        // Mot tapé, ou son abréviation développée (« av » : « avenue »… mais aussi « Avé »).
        const alt = ABBREV[t];
        let hit = false;
        for (const w of et) {
          if (w === t || w === alt) {
            exact++;
            hit = true;
            break;
          }
          // Un numéro doit être exact (« 1 » ne trouve pas « 12 »).
          if (!/^\d/.test(t) && (w.startsWith(t) || (alt !== undefined && w.startsWith(alt)))) hit = true;
        }
        if (!hit) {
          ok = false;
          break;
        }
        matched++;
      }
      if (!ok) continue;
      const words = et.filter((w) => !STOP.has(w)).length || 1;
      const d = Math.hypot((e.coord[0] - focus[0]) * kx, (e.coord[1] - focus[1]) * 111_320);
      let score = KIND_WEIGHT[e.kind] + (matched / words) * 1.5 + exact * 0.3 - Math.log10(1 + d / 300) * 0.6;
      // Une recherche avec un numéro vise une adresse (sauf si le nom le contient).
      if (number && e.kind !== "address" && !et.includes(number)) score -= 0.8;
      scored.push({ e, score, d });
    }
    scored.sort((a, b) => b.score - a.score);
    const out: SearchResult[] = [];
    for (const s of scored) {
      if (out.length >= limit) break;
      // Doublons : même nom à moins de 2 km (tronçons d'une même rue, un étang et son
      // point d'intérêt…).
      const name = normalize(s.e.name);
      const dup = out.some((o) => {
        if (normalize(o.name) !== name) return false;
        const d = Math.hypot((o.coord[0] - s.e.coord[0]) * kx, (o.coord[1] - s.e.coord[1]) * 111_320);
        return d < 2000;
      });
      if (!dup) out.push({ ...s.e, distanceM: Math.round(s.d) });
    }
    return out;
  }
}
