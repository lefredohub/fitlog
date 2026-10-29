/**
 * Stockage des parcours dans IndexedDB (navigateur), sans compte ni serveur.
 *
 * L'interface `RoutesRepository` isole ce choix : on pourra la réimplémenter
 * avec une base de données serveur (comptes, synchronisation) sans toucher à l'UI.
 */
import type { SavedRoute } from "@/lib/route/types";

export interface RoutesRepository {
  list(): Promise<SavedRoute[]>;
  get(id: string): Promise<SavedRoute | null>;
  save(route: SavedRoute): Promise<void>;
  remove(id: string): Promise<void>;
}

const DB_NAME = "runlab";
const DB_VERSION = 1;
const STORE = "routes";

export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Stockage indisponible");
    this.name = "StorageUnavailableError";
    this.cause = cause;
  }
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbRoutesRepository implements RoutesRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory | null = typeof indexedDB === "undefined" ? null : indexedDB) {}

  private db(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new StorageUnavailableError());
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = this.factory!.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(new StorageUnavailableError(err));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new StorageUnavailableError(req.error));
      req.onblocked = () => reject(new StorageUnavailableError("blocked"));
    }).catch((err) => {
      this.dbPromise = null;
      throw err;
    });
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    const tx = db.transaction(STORE, mode);
    const result = await promisify(run(tx.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  }

  async list(): Promise<SavedRoute[]> {
    const all = await this.tx("readonly", (s) => s.getAll() as IDBRequest<SavedRoute[]>);
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<SavedRoute | null> {
    const r = await this.tx("readonly", (s) => s.get(id) as IDBRequest<SavedRoute | undefined>);
    return r ?? null;
  }

  async save(route: SavedRoute): Promise<void> {
    await this.tx("readwrite", (s) => s.put(route));
  }

  async remove(id: string): Promise<void> {
    await this.tx("readwrite", (s) => s.delete(id));
  }
}

let defaultRepo: RoutesRepository | null = null;
export function getRoutesRepository(): RoutesRepository {
  defaultRepo ??= new IndexedDbRoutesRepository();
  return defaultRepo;
}

export function newRouteId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Demande au navigateur de ne pas effacer les données (utile sur iPhone). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* non supporté */
  }
  return false;
}
