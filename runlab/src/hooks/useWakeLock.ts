import { useEffect, useState } from "react";

/** Garde l'écran allumé pendant le guidage (Safari iOS ≥ 16.4, Chrome…). */
export function useWakeLock(active: boolean) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) return void sentinel.release();
        setLocked(true);
        sentinel.addEventListener("release", () => setLocked(false));
      } catch {
        setLocked(false);
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [active]);
  return locked;
}
