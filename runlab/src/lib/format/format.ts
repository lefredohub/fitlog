/**
 * Formatage des valeurs affichées (localisé).
 */
const nf = (locale: string, digits: number) =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatDistance(m: number, locale = "fr-FR"): string {
  if (Math.abs(m) < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${nf(locale, km < 100 ? (km < 10 ? 2 : 1) : 0).format(km)} km`;
}

/** Distance en km avec une décimale (cible, titres). */
export function formatKm(m: number, locale = "fr-FR"): string {
  const km = m / 1000;
  return `${nf(locale, Number.isInteger(Math.round(km * 10) / 10) ? 0 : 1).format(Math.round(km * 10) / 10)} km`;
}

export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(total / 60);
  const min = total % 60;
  if (h === 0) return `${min} min`;
  return `${h} h ${String(min).padStart(2, "0")}`;
}

/** Chronomètre « h:mm:ss » ou « mm:ss ». */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(r).padStart(2, "0")}` : `${mm}:${String(r).padStart(2, "0")}`;
}

export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

export function formatDate(iso: string, locale = "fr-FR"): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}
