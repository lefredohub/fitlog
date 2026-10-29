/**
 * Accès au fil de calcul depuis l'interface : chaque appel renvoie une promesse.
 */
import { RoutingError } from "@/lib/routing/errors";
import type { DataSources } from "@/lib/tiles/sources";
import type { EngineCalls, EngineRequest, EngineResponse } from "./protocol";

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

class Engine {
  private worker: Worker | null = null;
  private next = 1;
  private pending = new Map<number, Pending>();
  private sources: Partial<DataSources> = {};

  /** Remplace les sources de données (page hôte, tests). */
  configure(sources: Partial<DataSources>) {
    this.sources = sources;
    if (this.worker) void this.call("config", sources);
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<EngineResponse>) => {
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      this.pending.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.value);
      else p.reject(new RoutingError(ev.data.code, ev.data.message));
    };
    this.worker = w;
    this.post({ id: this.next++, type: "config", args: this.sources });
    return w;
  }

  private post(req: EngineRequest) {
    this.start().postMessage(req);
  }

  call<K extends keyof EngineCalls>(type: K, args: EngineCalls[K]["args"]): Promise<EngineCalls[K]["result"]> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.post({ id, type, args } as EngineRequest);
    });
  }
}

export const engine = new Engine();
