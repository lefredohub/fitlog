/**
 * Point d'entrée. `mountRunLab` permet aussi d'intégrer RunLab dans une autre page
 * (Menhir…) : il suffit d'un élément où l'afficher.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { engine } from "@/engine/client";
import { saveSettings } from "@/lib/storage/settings";
import type { DataSources } from "@/lib/tiles/sources";
import { App } from "./app/App";
import "./styles.css";

declare global {
  interface Window {
    /** Configuration facultative fournie par la page hôte (sources de données). */
    RUNLAB_CONFIG?: { sources?: Partial<DataSources>; backUrl?: string };
  }
}

export function mountRunLab(element: HTMLElement, config = window.RUNLAB_CONFIG) {
  if (config?.sources) engine.configure(config.sources);
  const root = createRoot(element);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  return () => root.unmount();
}

// Distance demandée par Menhir (séance du plan) : rl/?km=11
const km = Number(new URLSearchParams(location.search).get("km"));
if (km >= 1 && km <= 42) saveSettings({ distanceKm: Math.round(km * 2) / 2 });

const el = document.getElementById("runlab");
if (el) mountRunLab(el);
