/** Guidage pendant la course : consigne suivante, distance, chrono, annonces vocales. */
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  Flag,
  Repeat,
  RotateCcw,
  RotateCw,
  Square,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useIsNativeApp, useWatchPosition } from "@/hooks/useGeolocation";
import { useSettings, useTheme } from "@/hooks/useSettings";
import { useWakeLock } from "@/hooks/useWakeLock";
import { formatClock, formatDistance } from "@/lib/format/format";
import { isNativeApp, speakNative } from "@/lib/platform/native";
import type { LngLat, Maneuver, RoutedPath, RouteStats } from "@/lib/route/types";
import { instructionText, shouldAnnounce, spokenText, VOICE_ANNOUNCE_M, type InstructionMessages } from "@/lib/run/instructions";
import { RunTracker, type RunProgress } from "@/lib/run/tracker";
import { GEO_ERRORS } from "./messages";
import { MapView } from "./MapView";
import { Button, cn, IconButton } from "./ui";

const ICON: Record<Maneuver, LucideIcon> = {
  left: CornerUpLeft,
  right: CornerUpRight,
  "sharp-left": CornerUpLeft,
  "sharp-right": CornerUpRight,
  "slight-left": ArrowUpLeft,
  "slight-right": ArrowUpRight,
  "keep-left": ArrowUpLeft,
  "keep-right": ArrowUpRight,
  straight: ArrowUp,
  roundabout: RotateCw,
  "roundabout-exit": RotateCw,
  uturn: RotateCcw,
  depart: ArrowUp,
  arrive: Flag,
  lap: Repeat,
  other: ArrowUp,
};

const T: InstructionMessages = {
  roundabout: (s) => `Au rond-point, sortez vers ${s}`,
  roundaboutNoName: "Au rond-point, suivez le tracé",
  now: "Maintenant",
  inMeters: (m) => `Dans ${m} mètres`,
};

function speak(text: string) {
  if (isNativeApp()) {
    // Synthèse vocale d'iOS : audible écran verrouillé.
    speakNative(text).catch(() => speakWeb(text));
    return;
  }
  speakWeb(text);
}

function speakWeb(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* synthèse vocale indisponible */
  }
}

/** Délai après lequel la carte se recentre seule sur le coureur. */
const FOLLOW_RESUME_MS = 8_000;

export function RunView({ route, start, onExit }: { route: { name: string; path: RoutedPath; stats: RouteStats }; start: LngLat; onExit: () => void }) {
  const theme = useTheme();
  const [settings, save] = useSettings();
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [follow, setFollow] = useState(true);
  const [confirmStop, setConfirmStop] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);

  const native = useIsNativeApp();
  const { fix, error: geoError, interruption } = useWatchPosition(running, "Guidage Menhir en cours");
  // Dans l'app native, l'écran peut s'éteindre : inutile de le garder allumé.
  const wakeLocked = useWakeLock(running && !native);
  const tracker = useMemo(() => new RunTracker(route.path), [route]);

  useEffect(() => {
    if (!fix) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dérivé d'un événement externe (GPS)
    setProgress(tracker.update(fix.coord, fix.accuracyM, fix.timestamp));
  }, [tracker, fix]);

  // Suivi de la carte : une manipulation le suspend, il reprend seul après quelques secondes.
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseFollow = () => {
    setFollow(false);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setFollow(true), FOLLOW_RESUME_MS);
  };
  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réaction à un événement externe (écran rallumé)
    if (interruption) setFollow(true);
  }, [interruption]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Annonces vocales (une seule fois par événement).
  const announced = useRef<{ step: number | null; off: boolean; arrived: boolean }>({ step: null, off: false, arrived: false });
  useEffect(() => {
    if (!progress || !settings.voiceGuidance || !running) return;
    const a = announced.current;
    if (progress.offRoute && !a.off) speak("Vous êtes sorti du parcours");
    if (!progress.offRoute && a.off) speak("De retour sur le parcours");
    a.off = progress.offRoute;
    if (progress.arrived && !a.arrived) {
      a.arrived = true;
      speak("Arrivée. Bravo !");
    }
    const step = progress.nextStep;
    if (step && progress.distanceToNextStepM !== null && progress.distanceToNextStepM <= VOICE_ANNOUNCE_M && a.step !== step.fromIndex) {
      a.step = step.fromIndex;
      if (shouldAnnounce(step)) speak(spokenText(step, progress.distanceToNextStepM, T));
    }
  }, [progress, settings.voiceGuidance, running]);

  const routes = useMemo(() => [{ id: "run", coordinates: route.path.coordinates, crossings: route.stats.interruptions?.points }], [route]);
  const fit = useMemo(() => ({ key: "run", coords: route.path.coordinates }), [route]);

  const go = () => {
    // Sur iPhone, la synthèse vocale doit être « déverrouillée » par un geste de l'utilisateur.
    if (settings.voiceGuidance) speak("C'est parti");
    setStartedAt(Date.now());
    setNow(Date.now());
    setRunning(true);
  };

  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
  const next = progress?.nextStep ?? null;
  const NextIcon = next ? ICON[next.maneuver] : ArrowUp;

  return (
    <main className="fixed inset-0 z-20 bg-bg">
      <MapView
        className="absolute inset-0"
        theme={theme}
        initialView={{ center: start, zoom: 15 }}
        start={start}
        routes={routes}
        selectedRouteId="run"
        user={fix ? { coord: fix.coord, accuracyM: fix.accuracyM } : null}
        follow={running && follow && fix ? fix.coord : null}
        fit={running ? null : fit}
        showKmMarkers
        padding={{ top: 130, bottom: 250, left: 30, right: 30 }}
        onUserGesture={pauseFollow}
      />

      <div className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] z-10 flex items-start gap-2">
        {!running && (
          <IconButton label="Retour" onClick={onExit}>
            <X className="size-5" aria-hidden />
          </IconButton>
        )}
        {running && (
          <div
            role="status"
            aria-live="polite"
            className={cn("flex min-h-16 flex-1 items-center gap-3 rounded-3xl px-4 py-3 shadow-card", progress?.offRoute ? "bg-rd text-white" : "bg-tx text-bg")}
          >
            {progress?.offRoute ? (
              <>
                <TriangleAlert className="size-7 shrink-0" aria-hidden />
                <p className="text-lg font-bold leading-tight">Hors parcours ({formatDistance(progress.distanceToRouteM)})</p>
              </>
            ) : progress?.arrived ? (
              <>
                <Flag className="size-7 shrink-0 text-y" aria-hidden />
                <p className="text-lg font-bold leading-tight">Arrivée !</p>
              </>
            ) : next && progress && progress.distanceToNextStepM !== null ? (
              <>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-y text-on">
                  <NextIcon className="size-7" aria-hidden strokeWidth={2.6} />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold leading-none tabular">
                    {progress.distanceToNextStepM < 15 ? "Maintenant" : formatDistance(progress.distanceToNextStepM)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug opacity-80">{instructionText(next, T)}</p>
                </div>
              </>
            ) : (
              <p className="text-base font-semibold">{geoError ? GEO_ERRORS[geoError] : "Recherche du GPS…"}</p>
            )}
          </div>
        )}
      </div>
      {running && interruption && now - interruption.at < 20_000 && (
        <div role="status" className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+96px)] z-10 rounded-2xl bg-s1 px-4 py-2.5 text-sm font-medium text-au shadow-card">
          Écran éteint pendant {Math.max(1, Math.round(interruption.durationMs / 60_000))} min : le guidage a été suspendu.
        </div>
      )}

      {running && !follow && (
        <button
          type="button"
          onClick={() => setFollow(true)}
          className="absolute bottom-[calc(env(safe-area-inset-bottom)+220px)] left-1/2 z-10 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-tx px-5 text-[15px] font-semibold text-bg shadow-card"
        >
          <Crosshair className="size-5" aria-hidden />
          Recentrer
        </button>
      )}

      <section className="safe-bottom absolute inset-x-0 bottom-0 z-10 rounded-t-[28px] bg-s1 px-5 pt-4 shadow-card">
        {!running ? (
          <div className="space-y-3 pb-2">
            <div>
              <h1 className="font-display truncate text-2xl font-bold">{route.name}</h1>
              <p className="text-sm text-t2 tabular">{formatDistance(route.stats.distanceM)}</p>
            </div>
            <p className="text-sm text-mut">
              {native ? "Le guidage continue écran éteint." : "Garde l'écran allumé pendant la course."} Rien n'est enregistré.
            </p>
            <Button className="w-full" onClick={go}>
              C'est parti
            </Button>
          </div>
        ) : (
          <div className="pb-2">
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Parcouru", formatDistance(progress?.alongM ?? 0)],
                ["Reste", formatDistance(progress?.remainingM ?? route.stats.distanceM)],
                ["Temps", formatClock(elapsed)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-mut">{k}</dt>
                  <dd className="font-display text-[28px] font-bold leading-none tabular">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-s2" aria-hidden>
              <div className="h-full bg-y transition-[width]" style={{ width: `${Math.min(100, ((progress?.alongM ?? 0) / (progress?.totalM || 1)) * 100)}%` }} />
            </div>
            <p className="mt-2 text-center text-[11px] text-mut">
              {fix ? `Précision GPS ± ${Math.round(fix.accuracyM)} m` : "Recherche du GPS…"}
              {wakeLocked ? " · écran maintenu allumé" : ""}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <IconButton
                label="Annonces vocales"
                aria-pressed={settings.voiceGuidance}
                className="bg-s2 shadow-none"
                onClick={() => save({ voiceGuidance: !settings.voiceGuidance })}
              >
                {settings.voiceGuidance ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
              </IconButton>
              {confirmStop ? (
                <>
                  <Button variant="secondary" className="flex-1" onClick={() => setConfirmStop(false)}>
                    Continuer
                  </Button>
                  <Button variant="danger" className="flex-1" onClick={onExit}>
                    Arrêter
                  </Button>
                </>
              ) : (
                <Button variant="secondary" className="flex-1" icon={<Square className="size-4 fill-current" aria-hidden />} onClick={() => setConfirmStop(true)}>
                  Arrêter
                </Button>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
