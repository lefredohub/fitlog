import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { makePath } from "@/test/make-path";
import { computeRouteStats } from "@/lib/route/stats";
import { DEFAULT_PREFERENCES, type SavedRoute } from "@/lib/route/types";
import { IndexedDbRoutesRepository, StorageUnavailableError } from "./routes-repo";

function route(id: string, updatedAt: string): SavedRoute {
  const path = makePath([
    [2, 48, 10],
    [2, 48.01, 20],
  ]);
  return {
    id,
    name: `Parcours ${id}`,
    createdAt: updatedAt,
    updatedAt,
    params: { kind: "road", shape: "loop", targetDistanceM: 5000, preferences: DEFAULT_PREFERENCES },
    start: [2, 48],
    path,
    stats: computeRouteStats(path),
  };
}

describe("stockage des parcours (IndexedDB)", () => {
  let repo: IndexedDbRoutesRepository;
  beforeEach(() => {
    repo = new IndexedDbRoutesRepository(new IDBFactory());
  });

  it("enregistre et relit un parcours à l'identique", async () => {
    const r = route("a", "2026-01-01T00:00:00Z");
    await repo.save(r);
    expect(await repo.get("a")).toEqual(r);
    expect(await repo.get("absent")).toBeNull();
  });

  it("liste du plus récent au plus ancien", async () => {
    await repo.save(route("old", "2026-01-01T00:00:00Z"));
    await repo.save(route("new", "2026-03-01T00:00:00Z"));
    expect((await repo.list()).map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("supprime", async () => {
    await repo.save(route("a", "2026-01-01T00:00:00Z"));
    await repo.remove("a");
    expect(await repo.list()).toEqual([]);
  });

  it("signale un stockage indisponible", async () => {
    const none = new IndexedDbRoutesRepository(null);
    await expect(none.list()).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});
