import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, subscribeSettings, type Settings } from "@/lib/storage/settings";

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(subscribeSettings, loadSettings, () => DEFAULT_SETTINGS);
  return [settings, saveSettings];
}

/** Thème du système (clair / sombre). */
export function useTheme(): "light" | "dark" {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => {
      // choix forcé dans Menhir (Réglages > Apparence), sinon le réglage du téléphone
      const forced = document.documentElement.dataset.mode;
      if (forced === "light" || forced === "dark") return forced;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    },
    () => "dark",
  );
}
