/**
 * Fabrique de tuiles vectorielles (format Mapbox Vector Tile), réservée aux tests.
 */
import { PbfWriter } from "pbf";

export interface TestFeature {
  /** 1 : point, 2 : ligne, 3 : polygone. */
  type: 1 | 2 | 3;
  props: Record<string, string>;
  /** Coordonnées dans la tuile (0 à 4096). */
  points: [number, number][];
}

const zz = (n: number) => (n << 1) ^ (n >> 31);

export function vectorTile(layers: Record<string, TestFeature[]>): Uint8Array {
  const pbf = new PbfWriter();
  for (const [name, features] of Object.entries(layers)) {
    const keys: string[] = [];
    const values: string[] = [];
    const idx = (list: string[], v: string) => (list.includes(v) ? list.indexOf(v) : list.push(v) - 1);
    const encoded = features.map((f) => {
      const tags: number[] = [];
      for (const [k, v] of Object.entries(f.props)) tags.push(idx(keys, k), idx(values, v));
      const [first, ...rest] = f.points;
      const geom = [9, zz(first![0]), zz(first![1])];
      if (rest.length > 0) {
        geom.push(2 | (rest.length << 3));
        let prev = first!;
        for (const p of rest) {
          geom.push(zz(p[0] - prev[0]), zz(p[1] - prev[1]));
          prev = p;
        }
      }
      if (f.type === 3) geom.push(15);
      return { type: f.type, tags, geom };
    });
    pbf.writeMessage(3, (_, w) => {
      w.writeVarintField(15, 2);
      w.writeStringField(1, name);
      for (const f of encoded) {
        w.writeMessage(2, (__, m) => {
          m.writePackedVarint(2, f.tags);
          m.writeVarintField(3, f.type);
          m.writePackedVarint(4, f.geom);
        }, null);
      }
      for (const k of keys) w.writeStringField(3, k);
      for (const v of values) w.writeMessage(4, (__, val) => val.writeStringField(1, v), null);
      w.writeVarintField(5, 4096);
    }, null);
  }
  return pbf.finish();
}
