/**
 * Export GPX : sur iPhone, feuille de partage (Garmin Connect, Coros, Fichiers…) ;
 * ailleurs, téléchargement du fichier.
 */
import { gpxExporter, safeFileName } from "@/lib/export";
import type { RoutedPath, RouteStats } from "@/lib/route/types";

export async function exportGpx(route: { name: string; path: RoutedPath; stats: RouteStats }): Promise<"shared" | "downloaded" | "cancelled"> {
  const xml = gpxExporter.build(route, { description: "Parcours Menhir" });
  const fileName = safeFileName(route.name, gpxExporter.extension);
  const file = new File([xml], fileName, { type: gpxExporter.mimeType });
  try {
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: route.name });
      return "shared";
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
