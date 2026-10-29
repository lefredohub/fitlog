import { describe, expect, it } from "vitest";
import { vectorTile } from "@/test/vector-tile";
import { linesFromTile } from "./tiles";

describe("lecture des tuiles", () => {
  it("donne à chaque voie le nom porté par la couche des noms", () => {
    const tile = vectorTile({
      transportation: [
        // Une rue coupée en deux tronçons, une allée sans nom qui la croise.
        { type: 2, props: { class: "minor" }, points: [[100, 1000], [1000, 1000]] },
        { type: 2, props: { class: "minor" }, points: [[1000, 1000], [2000, 1003]] },
        { type: 2, props: { class: "path", subclass: "footway" }, points: [[1500, 500], [1500, 1500]] },
        // Même tracé que la rue, mais une autre classe : pas le même nom.
        { type: 2, props: { class: "service" }, points: [[100, 1004], [900, 1004]] },
      ],
      transportation_name: [
        { type: 2, props: { class: "minor", name: "Rue du Port", "name:fr": "Rue du Port" }, points: [[100, 1001], [2000, 1002]] },
      ],
    });
    const lines = linesFromTile(tile, 8000, 5700, 14);
    expect(lines.map((l) => [l.cls, l.name])).toEqual([
      ["minor", "Rue du Port"],
      ["minor", "Rue du Port"],
      ["path", undefined],
      ["service", undefined],
    ]);
  });
});
