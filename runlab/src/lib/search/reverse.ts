/**
 * Nom d'un point (départ choisi sur la carte) : l'adresse la plus proche, sinon la rue,
 * sinon le lieu-dit. Lu dans les mêmes tuiles que le reste, sans service externe.
 */
import type { NetworkLine } from "@/lib/network/graph";
import type { LngLat } from "@/lib/route/types";
import type { SearchEntry } from "./search";

export function reverseLabel(lines: readonly NetworkLine[], entries: readonly SearchEntry[], p: LngLat): string | null {
  const kx = 111_320 * Math.cos((p[1] * Math.PI) / 180);
  const dist = (c: LngLat) => Math.hypot((c[0] - p[0]) * kx, (c[1] - p[1]) * 111_320);
  let address: { d: number; name: string } | null = null;
  let place: { d: number; name: string } | null = null;
  for (const e of entries) {
    const d = dist(e.coord);
    if (e.kind === "address" && d <= 25 && (!address || d < address.d)) address = { d, name: e.name };
    if (e.kind === "place" && d <= 3000 && (!place || d < place.d)) place = { d, name: e.name };
  }
  if (address) return address.name;
  let street: { d: number; name: string } | null = null;
  for (const l of lines) {
    if (!l.name) continue;
    for (let i = 0; i + 1 < l.coords.length; i++) {
      const a = l.coords[i]!;
      const b = l.coords[i + 1]!;
      const ax = (a[0] - p[0]) * kx;
      const ay = (a[1] - p[1]) * 111_320;
      const dx = (b[0] - a[0]) * kx;
      const dy = (b[1] - a[1]) * 111_320;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const d = Math.hypot(ax + dx * t, ay + dy * t);
      if (d <= 60 && (!street || d < street.d)) street = { d, name: l.name };
    }
  }
  if (street) return place ? `${street.name}, ${place.name}` : street.name;
  return place?.name ?? null;
}
