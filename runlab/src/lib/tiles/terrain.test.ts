import { describe, expect, it } from "vitest";
import { encodePng } from "@/test/png";
import { decodePng } from "./png";
import { terrariumHeights } from "./terrain";

describe("tuiles de terrain", () => {
  it("décode un PNG quel que soit le filtre de chaque ligne", async () => {
    const w = 7;
    const h = 5;
    const rgb = new Uint8Array(w * h * 3).map((_, i) => (i * 37 + (i >> 3) * 11) & 0xff);
    const img = await decodePng(encodePng(w, h, rgb, [0, 1, 2, 3, 4]));
    expect(img).toMatchObject({ width: w, height: h, channels: 3 });
    expect([...img.data]).toEqual([...rgb]);
  });

  it("convertit les couleurs Terrarium en altitudes", async () => {
    const rgb = new Uint8Array(256 * 256 * 3);
    // 32768 + 42,5 m : R = 128, V = 42, B = 128.
    for (let i = 0; i < 256 * 256; i++) rgb.set([128, 42, 128], i * 3);
    rgb.set([127, 246, 0], 0); // 32758 → −10 m
    const heights = await terrariumHeights(encodePng(256, 256, rgb));
    expect(heights[1]).toBeCloseTo(42.5, 3);
    expect(heights[0]).toBeCloseTo(-10, 3);
  });

  it("refuse un fichier qui n'est pas un PNG", async () => {
    await expect(decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).rejects.toThrow();
  });
});
