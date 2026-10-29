import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { countHairpins, turnsPerKm } from "@/lib/generation/loopPlanner";
import { generateProposals } from "@/lib/generation/planner";
import { inWindow } from "@/lib/generation/variants";
import type { GenerateInput } from "@/lib/generation/types";
import type { LngLat } from "@/lib/route/types";
import { SearchIndex } from "@/lib/search/search";
import { elevationFor } from "@/lib/tiles/terrain";
import { fetchNetwork, fetchPlaces } from "@/lib/tiles/tiles";

// Banc d'essai sur données réelles (tuiles OpenFreeMap, relief) : REAL_TILES=1 pour l'activer.
const STARTS: Record<string, LngLat> = {
  verdun: [-2.73831, 47.66369],
  port: [-2.759, 47.653],
  conleau: [-2.779, 47.637],
  kercado: [-2.77, 47.65],
};
const CASES = (process.env.CASES ?? "loop:5,loop:10,rec:10,loop:10x3,trail:10,out:10,loop:21").split(",");

describe.skipIf(!process.env.REAL_TILES)("moteur sur données réelles", () => {
  it("génération : fourchette, temps, qualité", { timeout: 900_000 }, async () => {
    const dump: unknown[] = [];
    const starts = process.env.STARTS ? process.env.STARTS.split(",") : Object.keys(STARTS);
    const totals = { n: 0, out: 0, road: 0, len: 0, hair: 0, turns: 0 };
    for (const name of starts) {
      for (const c of CASES) {
        const [mode, spec] = c.split(":") as [string, string];
        const [km, laps] = spec.split("x");
        const input: GenerateInput = {
          start: STARTS[name]!,
          kind: mode === "trail" ? "trail" : "road",
          shape: mode === "out" ? "outback" : "loop",
          targetDistanceM: Number(km) * 1000,
          preferences: { forRecord: mode === "rec" },
          variation: 0,
          laps: laps ? Number(laps) : 1,
        };
        const t = Date.now();
        try {
          const res = await generateProposals(input, { network: fetchNetwork, elevation: elevationFor });
          const lines = res.proposals.map((p) => {
            const d = p.stats.distanceM;
            const ll = p.path.coordinates.map((x) => [x[0], x[1]] as LngLat);
            const road = p.stats.terrain.way.road / d;
            const hair = countHairpins(ll);
            const tpk = turnsPerKm(ll);
            totals.n++;
            totals.out += inWindow(d, input.targetDistanceM) ? 0 : 1;
            totals.road += p.stats.terrain.way.road;
            totals.len += d;
            totals.hair += hair;
            totals.turns += tpk;
            const it = p.stats.interruptions;
            dump.push({ start: name, case: c, d, coords: p.path.coordinates });
            return `   ${(d / 1000).toFixed(2)} km ${inWindow(d, input.targetDistanceM) ? "OK " : "HORS"} grands axes ${Math.round(road * 100)} % · épingles ${hair} · virages/km ${tpk.toFixed(1)} · consignes ${p.path.steps.length}${it ? ` · traversées ${it.crossings}/${it.majorCrossings}` : ""}`;
          });
          console.log(`${name} ${c} : ${Date.now() - t} ms\n${lines.join("\n")}`);
        } catch (err) {
          console.log(`${name} ${c} : ERREUR ${String(err)}`);
        }
      }
    }
    console.log(
      `TOTAL ${totals.n} propositions, hors fourchette ${totals.out}, grands axes ${Math.round((totals.road / totals.len) * 100)} %, épingles ${totals.hair}, virages/km moyen ${(totals.turns / totals.n).toFixed(2)}`,
    );
    if (process.env.OUT) writeFileSync(`${process.env.OUT}/engine.json`, JSON.stringify(dump));
  });

  it("recherche : temps et résultats", { timeout: 120_000 }, async () => {
    const focus = STARTS.verdun!;
    const index = new SearchIndex();
    let t = Date.now();
    const [near, places] = await Promise.all([fetchNetwork(focus, 2500), fetchPlaces(focus)]);
    console.log(`chargement de la zone : ${Date.now() - t} ms, ${near.entries.length + places.length} noms`);
    for (const q of ["place gambetta", "12 avenue de verdun", "etang au duc", "theix", "gare", "rue de la fontaine", "port"]) {
      t = performance.now();
      const res = index.search([...near.entries, ...places], q, focus, 3);
      console.log(`« ${q} » ${(performance.now() - t).toFixed(1)} ms → ${res.map((r) => `${r.name} (${r.kind}, ${r.distanceM} m)`).join(" | ")}`);
    }
  });
});
