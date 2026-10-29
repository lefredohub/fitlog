/**
 * Capacités natives de l'app iPhone (Capacitor).
 *
 * Le même site sert Safari et l'app native. Dans l'app, deux fonctions natives
 * remplacent leurs équivalents web :
 * - le suivi GPS continue écran verrouillé (le navigateur, lui, est suspendu) ;
 * - les annonces vocales passent par la synthèse vocale d'iOS, audible en arrière-plan.
 * Les modules Capacitor ne sont chargés que dans l'app (import dynamique).
 */
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import type { GeoFix } from "@/hooks/useGeolocation";

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

export type NativeGeoError = "denied" | "unavailable";

/**
 * Démarre un suivi GPS qui continue écran verrouillé.
 * Retourne une fonction d'arrêt.
 */
export async function startNativeWatch(
  onFix: (fix: GeoFix) => void,
  onError: (kind: NativeGeoError) => void,
  backgroundMessage: string,
): Promise<() => void> {
  const { registerPlugin } = await import("@capacitor/core");
  // Ce paquet ne fournit que des types : l'implémentation est native.
  const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
  // Android 13+ : la notification qui accompagne le guidage écran éteint demande une autorisation (module
  // @capacitor/local-notifications de l'app Android). Sans elle, le guidage marche mais la notification reste cachée.
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (cap?.getPlatform?.() === "android") {
      const LocalNotifications = registerPlugin<{ requestPermissions: () => Promise<unknown> }>("LocalNotifications");
      await LocalNotifications.requestPermissions();
    }
  } catch {
    /* module absent : on continue sans notification visible */
  }
  // Autorisation « pendant l'utilisation » uniquement : elle suffit pour un guidage démarré
  // dans l'app, même écran verrouillé. Laissé à lui-même, le plugin demanderait « Toujours »,
  // ce qui est inutile pour RunLab et motif de refus sur l'App Store.
  try {
    await locateOnceNative();
  } catch (err) {
    onError((err as { code?: string })?.code === "NOT_AUTHORIZED" ? "denied" : "unavailable");
  }
  const id = await BackgroundGeolocation.addWatcher(
    {
      // Sa présence active les mises à jour en arrière-plan (indicateur bleu dans la barre d'état).
      backgroundMessage,
      backgroundTitle: "Menhir",
      requestPermissions: false,
      stale: false,
      distanceFilter: 0,
    },
    (location, error) => {
      if (error) {
        onError(error.code === "NOT_AUTHORIZED" ? "denied" : "unavailable");
        return;
      }
      if (location) {
        onFix({ coord: [location.longitude, location.latitude], accuracyM: location.accuracy, timestamp: location.time ?? Date.now() });
      }
    },
  );
  return () => {
    void BackgroundGeolocation.removeWatcher({ id });
  };
}

/** Annonce vocale native (audible écran verrouillé). */
export async function speakNative(text: string): Promise<void> {
  const { TextToSpeech, QueueStrategy } = await import("@capacitor-community/text-to-speech");
  await TextToSpeech.speak({ text, lang: "fr-FR", rate: 1.0, queueStrategy: QueueStrategy.Flush });
}

/** Position ponctuelle (choix du départ) via le GPS natif. */
export async function locateOnceNative(timeoutMs = 15_000): Promise<GeoFix> {
  const { registerPlugin } = await import("@capacitor/core");
  const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
  return new Promise<GeoFix>((resolve, reject) => {
    let id: string | null = null;
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (id) void BackgroundGeolocation.removeWatcher({ id });
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error("timeout"))), timeoutMs);
    BackgroundGeolocation.addWatcher({ requestPermissions: true, stale: false }, (location, error) => {
      if (error) return finish(() => reject(error));
      if (location) {
        finish(() => resolve({ coord: [location.longitude, location.latitude], accuracyM: location.accuracy, timestamp: location.time ?? Date.now() }));
      }
    })
      .then((watcherId) => {
        id = watcherId;
        if (done) void BackgroundGeolocation.removeWatcher({ id: watcherId });
      })
      .catch((err) => finish(() => reject(err)));
  });
}
