/**
 * Réglages et derniers choix, stockés sur l'appareil (localStorage).
 */
import { z } from "zod";

const prefsSchema = z.object({
  /** Allure sur le plat (s/km), pour la durée estimée. */
  paceSecPerKm: z.number().int().min(150).max(1200).catch(360),
  voiceGuidance: z.boolean().catch(true),
  /** Derniers choix de parcours. */
  distanceKm: z.number().min(1).max(42).catch(10),
  shape: z.enum(["loop", "outback"]).catch("loop"),
  kind: z.enum(["road", "trail"]).catch("road"),
  laps: z.number().int().min(1).max(4).catch(1),
  forRecord: z.boolean().catch(false),
  /** Dernier départ choisi (sinon la position GPS). */
  start: z.object({ coord: z.tuple([z.number(), z.number()]), label: z.string().optional() }).nullable().catch(null),
});

export type Settings = z.infer<typeof prefsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  paceSecPerKm: 360,
  voiceGuidance: true,
  distanceKm: 10,
  shape: "loop",
  kind: "road",
  laps: 1,
  forRecord: false,
  start: null,
};

const KEY = "runlab:settings";
const listeners = new Set<() => void>();
let cache: Settings | null = null;

export function loadSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    cache = raw ? prefsSchema.parse({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) }) : DEFAULT_SETTINGS;
  } catch {
    cache = DEFAULT_SETTINGS;
  }
  return cache;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = prefsSchema.parse({ ...loadSettings(), ...patch });
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible : réglages conservés pour la session */
  }
  listeners.forEach((l) => l());
  return next;
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
