/** Recherche d'adresse : rues, adresses, lieux, sans service externe. */
import { MapPin, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { engine } from "@/engine/client";
import { formatDistance } from "@/lib/format/format";
import type { LngLat } from "@/lib/route/types";
import type { SearchResult } from "@/lib/search/search";

const KIND_LABEL: Record<SearchResult["kind"], string> = {
  address: "Adresse",
  street: "Rue",
  poi: "Lieu",
  place: "Commune",
  water: "Plan d'eau",
};

export function SearchBox({ focus, placeholder, onPick }: { focus: LngLat; placeholder: string; onPick: (r: SearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(() => {
      setLoading(true);
      engine
        .call("search", { query: q, focus })
        .then((r) => id === seq.current && setResults(r))
        .catch(() => id === seq.current && setResults([]))
        .finally(() => id === seq.current && setLoading(false));
    }, 120);
    return () => clearTimeout(t);
  }, [query, focus]);

  const shown = query.trim().length >= 2 ? results : [];

  return (
    <div className="relative min-w-0 flex-1">
      <label className="flex h-12 items-center gap-2 rounded-full bg-glass px-4 shadow-card backdrop-blur">
        <Search className="size-5 shrink-0 text-mut" aria-hidden />
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          aria-label="Chercher un départ"
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-tx outline-none placeholder:text-t2"
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) {
              onPick(shown[0]);
              setQuery("");
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {query && (
          <button type="button" aria-label="Effacer" onClick={() => setQuery("")} className="text-mut">
            <X className="size-5" aria-hidden />
          </button>
        )}
      </label>
      {open && query.trim().length >= 2 && (
        <ul role="listbox" aria-label="Résultats" className="absolute inset-x-0 top-14 z-30 overflow-hidden rounded-3xl bg-s1 shadow-card">
          {shown.length === 0 && (
            <li className="px-4 py-3 text-sm text-mut">{loading ? "Recherche…" : "Aucun résultat ici. Déplace la carte vers l'endroit voulu."}</li>
          )}
          {shown.map((r) => (
            <li key={`${r.kind}-${r.name}-${r.coord.join()}`} role="option" aria-selected="false">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-s2"
                onClick={() => {
                  onPick(r);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <MapPin className="size-5 shrink-0 text-y" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                  <span className="block text-xs text-mut">
                    {KIND_LABEL[r.kind]} · {formatDistance(r.distanceM)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
