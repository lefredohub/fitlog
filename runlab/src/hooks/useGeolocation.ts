import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isNativeApp, locateOnceNative, startNativeWatch } from "@/lib/platform/native";
import type { LngLat } from "@/lib/route/types";

export type GeoErrorKind = "denied" | "unavailable" | "timeout" | "unsupported" | "insecure";

export interface GeoFix {
  coord: LngLat;
  accuracyM: number;
  timestamp: number;
}

function errorKind(err: GeolocationPositionError): GeoErrorKind {
  if (err.code === err.PERMISSION_DENIED) return typeof window !== "undefined" && !window.isSecureContext ? "insecure" : "denied";
  if (err.code === err.TIMEOUT) return "timeout";
  return "unavailable";
}

function preflight(): GeoErrorKind | null {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "unsupported";
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure";
  return null;
}

/** Localisation ponctuelle (choix du départ). */
export function useLocateOnce() {
  const [state, setState] = useState<{ loading: boolean; error: GeoErrorKind | null }>({ loading: false, error: null });
  const locate = useCallback(
    () =>
      new Promise<GeoFix | null>((resolve) => {
        if (isNativeApp()) {
          setState({ loading: true, error: null });
          locateOnceNative()
            .then((fix) => {
              setState({ loading: false, error: null });
              resolve(fix);
            })
            .catch((err: { code?: string; message?: string }) => {
              setState({ loading: false, error: err?.code === "NOT_AUTHORIZED" ? "denied" : err?.message === "timeout" ? "timeout" : "unavailable" });
              resolve(null);
            });
          return;
        }
        const pre = preflight();
        if (pre) {
          setState({ loading: false, error: pre });
          resolve(null);
          return;
        }
        setState({ loading: true, error: null });
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setState({ loading: false, error: null });
            resolve({ coord: [pos.coords.longitude, pos.coords.latitude], accuracyM: pos.coords.accuracy, timestamp: pos.timestamp });
          },
          (err) => {
            setState({ loading: false, error: errorKind(err) });
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
        );
      }),
    [],
  );
  return { ...state, locate };
}

/**
 * Suivi continu de la position (guidage).
 *
 * Sur iPhone, Safari suspend la page quand l'écran s'éteint : plus aucune position
 * n'arrive. Au rallumage, le suivi est relancé immédiatement et la durée de
 * l'interruption est signalée, pour ne jamais faire croire que le suivi a continué.
 */
export function useWatchPosition(active: boolean, backgroundMessage = "Guidage en cours") {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [error, setError] = useState<GeoErrorKind | null>(null);
  const [interruption, setInterruption] = useState<{ durationMs: number; at: number } | null>(null);
  const watchId = useRef<number | null>(null);

  // App iPhone native : suivi GPS natif, qui continue écran verrouillé.
  useEffect(() => {
    if (!active || !isNativeApp()) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    startNativeWatch(
      (f) => {
        setError(null);
        setFix(f);
      },
      (kind) => setError(kind),
      backgroundMessage,
    )
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch(() => setError("unavailable"));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [active, backgroundMessage]);

  // Navigateur : suivi web, suspendu par Safari quand l'écran est verrouillé.
  useEffect(() => {
    if (!active || isNativeApp()) return;
    const pre = preflight();
    if (pre) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- erreur détectée de façon synchrone
      setError(pre);
      return;
    }
    const opts: PositionOptions = { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 };
    const onPos = (pos: GeolocationPosition) => {
      setError(null);
      setFix({ coord: [pos.coords.longitude, pos.coords.latitude], accuracyM: pos.coords.accuracy, timestamp: pos.timestamp });
    };
    const onErr = (err: GeolocationPositionError) => setError(errorKind(err));
    const start = () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = navigator.geolocation.watchPosition(onPos, onErr, opts);
    };
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt > 5_000) {
        setInterruption({ durationMs: Date.now() - hiddenAt, at: Date.now() });
      }
      hiddenAt = null;
      // Relance du suivi + position immédiate (la position mise en cache peut être ancienne).
      start();
      navigator.geolocation.getCurrentPosition(onPos, () => {}, { ...opts, maximumAge: 0 });
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [active]);

  return { fix, error, interruption };
}

/** Vrai dans l'app iPhone native (faux au rendu serveur et dans Safari). */
export function useIsNativeApp(): boolean {
  return useSyncExternalStore(
    () => () => {},
    isNativeApp,
    () => false,
  );
}
