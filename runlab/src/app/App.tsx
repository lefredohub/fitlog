/**
 * RunLab en un écran : la carte, une recherche, la distance et un bouton. Tout le reste
 * (options, parcours enregistrés, réglages) est dans un seul menu.
 */
import { ArrowLeft, ChevronLeft, ChevronRight, Crosshair, Download, LocateFixed, Menu as MenuIcon, Minus, Play, Plus, RefreshCw, Star, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { engine } from "@/engine/client";
import { useLocateOnce } from "@/hooks/useGeolocation";
import { useSettings, useTheme } from "@/hooks/useSettings";
import { formatDistance, formatDuration, formatKm } from "@/lib/format/format";
import type { GenerateInput, Proposal } from "@/lib/generation/types";
import { estimateDurationSec } from "@/lib/route/effort";
import type { LngLat, SavedRoute } from "@/lib/route/types";
import { RoutingError } from "@/lib/routing/errors";
import { getRoutesRepository, newRouteId, requestPersistentStorage } from "@/lib/storage/routes-repo";
import { exportGpx } from "./gpx";
import { MapView } from "./MapView";
import { Menu } from "./Menu";
import { ERRORS, GEO_ERRORS } from "./messages";
import { RunView } from "./RunView";
import { SearchBox } from "./SearchBox";
import { Button, IconButton, ToastProvider, useToast } from "./ui";

/** Parcours affiché : une proposition, ou un parcours enregistré. */
type Shown = { name: string; path: Proposal["path"]; stats: Proposal["stats"]; recipe?: Proposal["recipe"]; savedId?: string };

const FRANCE: LngLat = [2.35, 46.6];

function stepKm(km: number, dir: 1 | -1) {
  const step = km < 5 || (km === 5 && dir < 0) ? 0.5 : 1;
  return Math.min(42, Math.max(1, Math.round((km + dir * step) * 2) / 2));
}

function describe(p: Shown): string | null {
  const c = p.recipe?.type === "planned" ? p.recipe.circuit : undefined;
  if (c) {
    const laps = p.recipe?.type === "planned" ? p.recipe.laps : 1;
    const what = c.name ?? { water: "un plan d'eau", park: "un parc", wood: "un bois", path: "une boucle d'allées" }[c.kind];
    return `${laps} tour${laps > 1 ? "s" : ""} · ${what} (${formatDistance(c.lapM)})`;
  }
  if (p.recipe?.type === "planned" && p.recipe.laps > 1) return `${p.recipe.laps} tours de ${formatDistance(p.stats.distanceM / p.recipe.laps)}`;
  if (p.recipe?.type === "outback") return "Aller-retour";
  return null;
}

function Screen() {
  const toast = useToast();
  const theme = useTheme();
  const [settings, save] = useSettings();
  const { locate, loading: locating, error: geoError } = useLocateOnce();
  const [start, setStart] = useState<{ coord: LngLat; label?: string } | null>(settings.start);
  const [center, setCenter] = useState<LngLat>(settings.start?.coord ?? FRANCE);
  const [phase, setPhase] = useState<"plan" | "results" | "run">("plan");
  const [proposals, setProposals] = useState<Shown[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variation, setVariation] = useState(0);
  const [menu, setMenu] = useState(false);
  const [saved, setSaved] = useState<SavedRoute[]>([]);
  const request = useRef(0);

  const refreshSaved = useCallback(() => {
    getRoutesRepository()
      .list()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);
  useEffect(refreshSaved, [refreshSaved]);

  const chooseStart = useCallback(
    (coord: LngLat, label?: string) => {
      setStart({ coord, label });
      save({ start: { coord, label } });
      setPhase("plan");
      setProposals([]);
      setError(null);
      if (!label) {
        engine
          .call("reverse", coord)
          .then((name) => {
            if (!name) return;
            setStart((s) => (s && s.coord === coord ? { coord, label: name } : s));
            save({ start: { coord, label: name } });
          })
          .catch(() => {});
      }
    },
    [save],
  );

  const locateMe = useCallback(async () => {
    const fix = await locate();
    if (fix) chooseStart(fix.coord);
  }, [locate, chooseStart]);

  // Premier lancement : départ à la position actuelle.
  const firstLocate = useRef(false);
  useEffect(() => {
    if (firstLocate.current || settings.start) return;
    firstLocate.current = true;
    void locateMe();
  }, [settings.start, locateMe]);

  // Carte déplacée : la recherche se fait autour du centre, préparé à l'avance (à l'échelle
  // d'un quartier seulement, pour ne pas télécharger toute une région).
  const warmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMoveEnd = useCallback((c: LngLat, zoom: number) => {
    setCenter(c);
    if (warmTimer.current) clearTimeout(warmTimer.current);
    if (zoom >= 12) warmTimer.current = setTimeout(() => void engine.call("warm", c).catch(() => {}), 800);
  }, []);

  // Prépare la zone du départ : recherche et calcul instantanés ensuite.
  useEffect(() => {
    if (start) void engine.call("warm", start.coord).catch(() => {});
  }, [start]);

  const generate = async (nextVariation = 0) => {
    if (!start) return;
    const id = ++request.current;
    setLoading(true);
    setError(null);
    const input: GenerateInput = {
      start: start.coord,
      kind: settings.kind,
      shape: settings.shape,
      targetDistanceM: settings.distanceKm * 1000,
      preferences: { forRecord: settings.forRecord },
      variation: nextVariation,
      laps: settings.shape === "loop" ? settings.laps : 1,
    };
    try {
      const res = await engine.call("generate", input);
      if (id !== request.current) return;
      if (res.proposals.length === 0) {
        setError(ERRORS.NO_ROUTE!);
        return;
      }
      const shape = settings.shape === "loop" ? "Boucle" : "Aller-retour";
      const where = start.label ? ` · ${start.label}` : "";
      setProposals(res.proposals.map((p) => ({ ...p, name: `${shape} ${formatKm(input.targetDistanceM)}${where}` })));
      setSelected(0);
      setVariation(nextVariation);
      setPhase("results");
    } catch (err) {
      if (id !== request.current) return;
      setError(err instanceof RoutingError ? (ERRORS[err.code] ?? ERRORS.default) : ERRORS.default);
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  const current = proposals[selected] ?? null;
  const mapRoutes = useMemo(
    () => proposals.map((p, i) => ({ id: String(i), coordinates: p.path.coordinates, crossings: p.stats.interruptions?.points })),
    [proposals],
  );
  const fit = useMemo(() => {
    if (phase === "results" && current) return { key: `r-${variation}-${selected}-${current.name}`, coords: current.path.coordinates };
    if (start) return { key: `s-${start.coord.join()}`, coords: [start.coord] };
    return null;
  }, [phase, current, start, selected, variation]);

  const saveCurrent = async () => {
    if (!current || !start) return;
    const now = new Date().toISOString();
    const route: SavedRoute = {
      id: newRouteId(),
      name: current.name,
      createdAt: now,
      updatedAt: now,
      params: { kind: settings.kind, shape: settings.shape, targetDistanceM: settings.distanceKm * 1000, preferences: { forRecord: settings.forRecord }, laps: settings.laps },
      start: start.coord,
      startLabel: start.label,
      path: current.path,
      stats: current.stats,
    };
    try {
      await getRoutesRepository().save(route);
      void requestPersistentStorage();
      setProposals((list) => list.map((p, i) => (i === selected ? { ...p, savedId: route.id } : p)));
      refreshSaved();
      toast("Parcours enregistré");
    } catch {
      toast("Enregistrement impossible sur cet appareil");
    }
  };

  const openSaved = (r: SavedRoute) => {
    setStart({ coord: r.start, label: r.startLabel });
    setProposals([{ name: r.name, path: r.path, stats: r.stats, savedId: r.id }]);
    setSelected(0);
    setPhase("results");
    setMenu(false);
  };

  const removeSaved = async (id: string) => {
    await getRoutesRepository()
      .remove(id)
      .catch(() => {});
    refreshSaved();
  };

  // Glissement horizontal sur la fiche : proposition suivante / précédente.
  const touch = useRef<number | null>(null);
  const duration = current ? estimateDurationSec(current.stats, { paceSecPerKm: settings.paceSecPerKm, accountForClimb: true }) : 0;
  const options = [
    settings.shape === "loop" ? (settings.laps > 1 ? `${settings.laps} tours` : "Boucle") : "Aller-retour",
    settings.kind === "trail" ? "Trail" : "Route",
    ...(settings.forRecord ? ["Record"] : []),
  ].join(" · ");

  return (
    <div className="fixed inset-0 overflow-hidden">
      <MapView
        className="absolute inset-0"
        theme={theme}
        initialView={{ center: start?.coord ?? FRANCE, zoom: start ? 14 : 5 }}
        start={start?.coord ?? null}
        routes={phase === "results" ? mapRoutes : []}
        selectedRouteId={String(selected)}
        fit={fit}
        showKmMarkers={phase === "results"}
        padding={{ top: 80, bottom: phase === "results" ? 250 : 230, left: 24, right: 24 }}
        onMapClick={(c) => phase === "plan" && chooseStart(c)}
        onRouteClick={(id) => setSelected(Number(id))}
        onMoveEnd={onMoveEnd}
      />

      <div className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+10px)] z-20 flex items-start gap-2">
        {phase === "plan" && window.RUNLAB_CONFIG?.backUrl && (
          <IconButton label="Revenir à Menhir" onClick={() => location.assign(window.RUNLAB_CONFIG!.backUrl!)}>
            <ArrowLeft className="size-5" aria-hidden />
          </IconButton>
        )}
        <SearchBox focus={center} placeholder={start?.label ?? "Chercher un départ"} onPick={(r) => chooseStart(r.coord, r.name)} />
        <IconButton label="Menu" onClick={() => setMenu(true)}>
          <MenuIcon className="size-5" aria-hidden />
        </IconButton>
      </div>
      <IconButton label="Ma position" className="absolute right-3 top-[calc(env(safe-area-inset-top)+68px)] z-10" onClick={() => void locateMe()} disabled={locating}>
        {locating ? <Crosshair className="size-5 animate-pulse" aria-hidden /> : <LocateFixed className="size-5" aria-hidden />}
      </IconButton>

      <section className="safe-bottom absolute inset-x-0 bottom-0 z-10 rounded-t-[28px] bg-s1 px-5 pt-4 shadow-card">
        {phase !== "results" || !current ? (
          <div className="space-y-3">
            <p className="truncate text-sm text-t2">
              {start ? (
                <>
                  Départ : <span className="font-semibold text-tx">{start.label ?? "point choisi sur la carte"}</span>
                </>
              ) : geoError ? (
                GEO_ERRORS[geoError]
              ) : (
                "Touche la carte ou cherche une adresse pour choisir le départ."
              )}
            </p>
            <div className="flex items-center gap-3">
              <IconButton label="Moins de kilomètres" className="bg-s2 shadow-none" onClick={() => save({ distanceKm: stepKm(settings.distanceKm, -1) })}>
                <Minus className="size-5" aria-hidden />
              </IconButton>
              <div className="flex-1 text-center">
                <p className="font-display text-5xl font-bold leading-none tabular" aria-live="polite">
                  {formatKm(settings.distanceKm * 1000)}
                </p>
                <button type="button" className="mt-1 min-h-11 px-3 text-sm font-semibold text-y" onClick={() => setMenu(true)}>
                  {options}
                </button>
              </div>
              <IconButton label="Plus de kilomètres" className="bg-s2 shadow-none" onClick={() => save({ distanceKm: stepKm(settings.distanceKm, 1) })}>
                <Plus className="size-5" aria-hidden />
              </IconButton>
            </div>
            {error && (
              <p role="alert" className="text-sm font-medium text-rd">
                {error}
              </p>
            )}
            <Button className="w-full" loading={loading} disabled={!start} onClick={() => void generate(0)}>
              {loading ? "Calcul du parcours…" : "Créer mon parcours"}
            </Button>
          </div>
        ) : (
          <div
            onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const x0 = touch.current;
              const x1 = e.changedTouches[0]?.clientX;
              touch.current = null;
              if (x0 === null || x1 === undefined || Math.abs(x1 - x0) < 50) return;
              setSelected((s) => Math.max(0, Math.min(proposals.length - 1, s + (x1 < x0 ? 1 : -1))));
            }}
          >
            <div className="flex items-center gap-2">
              <IconButton label="Retour" className="size-10 bg-s2 shadow-none" onClick={() => setPhase("plan")}>
                <X className="size-5" aria-hidden />
              </IconButton>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-t2">
                {proposals.length > 1 ? `Parcours ${selected + 1} / ${proposals.length}` : current.name}
              </p>
              {selected === 0 && proposals.length > 1 && <span className="shrink-0 rounded-full bg-y px-2.5 py-1 text-xs font-bold text-on">Conseillé</span>}
              {proposals.length > 1 && (
                <>
                  <IconButton label="Précédent" className="size-10 bg-s2 shadow-none" disabled={selected === 0} onClick={() => setSelected((s) => s - 1)}>
                    <ChevronLeft className="size-5" aria-hidden />
                  </IconButton>
                  <IconButton label="Suivant" className="size-10 bg-s2 shadow-none" disabled={selected === proposals.length - 1} onClick={() => setSelected((s) => s + 1)}>
                    <ChevronRight className="size-5" aria-hidden />
                  </IconButton>
                </>
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-4">
              <p className="font-display text-4xl font-bold leading-none tabular">{formatDistance(current.stats.distanceM)}</p>
              <p className="text-sm text-t2 tabular">
                {current.stats.ascentM !== null ? `D+ ${current.stats.ascentM} m · ` : ""}≈ {formatDuration(duration)}
              </p>
            </div>
            <p className="mt-1 min-h-5 truncate text-sm text-t2">
              {[describe(current), current.stats.interruptions ? `${current.stats.interruptions.crossings} traversée${current.stats.interruptions.crossings > 1 ? "s" : ""} de route` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button className="flex-1" icon={<Play className="size-4 fill-current" aria-hidden />} onClick={() => setPhase("run")}>
                Courir
              </Button>
              <IconButton
                label="Exporter en GPX"
                className="bg-s2 shadow-none"
                onClick={() =>
                  void exportGpx(current).then((r) => r !== "cancelled" && toast(r === "shared" ? "Parcours partagé" : "Fichier GPX téléchargé"))
                }
              >
                <Download className="size-5" aria-hidden />
              </IconButton>
              <IconButton label={current.savedId ? "Enregistré" : "Enregistrer"} className="bg-s2 shadow-none" disabled={Boolean(current.savedId)} onClick={() => void saveCurrent()}>
                <Star className={current.savedId ? "size-5 fill-current text-au" : "size-5"} aria-hidden />
              </IconButton>
              {!current.savedId || proposals.length > 1 ? (
                <IconButton label="Autres parcours" className="bg-s2 shadow-none" disabled={loading} onClick={() => void generate(variation + 1)}>
                  <RefreshCw className={loading ? "size-5 animate-spin" : "size-5"} aria-hidden />
                </IconButton>
              ) : null}
            </div>
            {error && (
              <p role="alert" className="mt-2 text-sm font-medium text-rd">
                {error}
              </p>
            )}
          </div>
        )}
      </section>

      <Menu open={menu} onClose={() => setMenu(false)} saved={saved} onOpen={openSaved} onRemove={(id) => void removeSaved(id)} />
      {phase === "run" && current && start && <RunView route={current} start={start.coord} onExit={() => setPhase("results")} />}
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <Screen />
    </ToastProvider>
  );
}
