// Fausses données de carte — uniquement pour les tests de bout en bout.
// Sert des tuiles vectorielles (quadrillage de rues nommées autour de Lyon) et des tuiles
// de terrain (pente douce), pour tester toute l'application sans accès réseau.
//
// Usage : node tests/e2e/mock-tiles.mjs [port]
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";
import { PbfWriter } from "pbf";

const PORT = Number(process.argv[2] ?? 4010);

const zz = (n) => (n << 1) ^ (n >> 31);

/** Écrit une couche de lignes ({ props, pts }) dans une tuile. */
function writeLayer(pbf, name, features, extent) {
  const keys = [];
  const values = [];
  const idx = (list, v) => (list.includes(v) ? list.indexOf(v) : list.push(v) - 1);
  const encoded = features.map((f) => {
    const tags = [];
    for (const [k, v] of Object.entries(f.props)) tags.push(idx(keys, k), idx(values, v));
    const geom = [9, zz(f.pts[0][0]), zz(f.pts[0][1])];
    if (f.pts.length > 1) {
      geom.push(2 | ((f.pts.length - 1) << 3));
      for (let i = 1; i < f.pts.length; i++) geom.push(zz(f.pts[i][0] - f.pts[i - 1][0]), zz(f.pts[i][1] - f.pts[i - 1][1]));
    }
    return { tags, geom, type: f.pts.length > 1 ? 2 : 1 };
  });
  pbf.writeMessage(3, (_, w) => {
    w.writeVarintField(15, 2);
    w.writeStringField(1, name);
    for (const f of encoded) {
      w.writeMessage(2, (__, m) => {
        m.writePackedVarint(2, f.tags);
        m.writeVarintField(3, f.type);
        m.writePackedVarint(4, f.geom);
      });
    }
    for (const k of keys) w.writeStringField(3, k);
    for (const v of values) w.writeMessage(4, (__, val) => val.writeStringField(1, v));
    w.writeVarintField(5, extent);
  });
}

// Quadrillage de rues tous les 0,002° (≈ 220 × 160 m), une rue sur cinq étant un grand
// axe. Chaque carrefour est un sommet commun aux deux rues, comme dans OpenStreetMap.
function vectorTile(z, x, y) {
  const n = 2 ** z;
  const E = 4096;
  const tx = (lon) => Math.round((((lon + 180) / 360) * n - x) * E);
  const ty = (lat) => {
    const r = (lat * Math.PI) / 180;
    return Math.round((((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - y) * E);
  };
  const xs = [];
  const ys = [];
  for (let k = 0; k < 200; k++) {
    const X = tx(4.7 + k * 0.002);
    const Y = ty(45.6 + k * 0.002);
    if (X > 0 && X < E) xs.push(X);
    if (Y > 0 && Y < E) ys.push(Y);
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const lines = [];
  const names = [];
  for (let k = 0; k < 200; k++) {
    const cls = k % 5 === 0 ? "primary" : "minor";
    const Y = ty(45.6 + k * 0.002);
    const X = tx(4.7 + k * 0.002);
    if (Y >= 0 && Y <= E) {
      const pts = [[0, Y], ...xs.map((v) => [v, Y]), [E, Y]];
      lines.push({ props: { class: cls }, pts });
      names.push({ props: { class: cls, name: `Rue Nord ${k}` }, pts });
    }
    if (X >= 0 && X <= E) {
      const pts = [[X, 0], ...ys.map((v) => [X, v]), [X, E]];
      lines.push({ props: { class: cls }, pts });
      names.push({ props: { class: cls, name: `Avenue Est ${k}` }, pts });
    }
  }
  const pbf = new PbfWriter();
  writeLayer(pbf, "transportation", lines, E);
  writeLayer(pbf, "transportation_name", names, E);
  // Un lieu par tuile, au centre, pour la recherche.
  writeLayer(pbf, "place", [{ props: { class: "suburb", name: `Quartier ${x}-${y}` }, pts: [[E / 2, E / 2]] }], E);
  return Buffer.from(pbf.finish());
}

// Fausse tuile de terrain « Terrarium » : une pente douce vers l'est.
function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function terrainTile(z, x) {
  const raw = Buffer.alloc(256 * (1 + 256 * 3));
  for (let py = 0; py < 256; py++) {
    raw[py * 769] = 0;
    for (let px = 0; px < 256; px++) {
      const lon = ((x + (px + 0.5) / 256) / 2 ** z) * 360 - 180;
      const h = 150 + (lon - 4.8) * 1500 + 32768;
      const o = py * 769 + 1 + px * 3;
      raw[o] = Math.floor(h / 256);
      raw[o + 1] = Math.floor(h) % 256;
      raw[o + 2] = Math.floor((h % 1) * 256);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(256, 0);
  ihdr.writeUInt32BE(256, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("access-control-allow-origin", "*");
  if (url.pathname === "/tiles.json") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ tiles: [`http://localhost:${PORT}/tiles/{z}/{x}/{y}.pbf`] }));
  }
  const tile = url.pathname.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
  if (tile) {
    res.writeHead(200, { "content-type": "application/x-protobuf" });
    return res.end(vectorTile(Number(tile[1]), Number(tile[2]), Number(tile[3])));
  }
  const terrain = url.pathname.match(/^\/terrain\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (terrain) {
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(terrainTile(Number(terrain[1]), Number(terrain[2])));
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, () => console.log(`fausses tuiles sur :${PORT}`));
