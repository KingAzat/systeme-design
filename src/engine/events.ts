/**
 * SystemLab — file d'événements : tas binaire ordonné par (temps, séquence).
 *
 * L'ordre total (time, puis seq d'insertion) garantit un déroulement
 * déterministe : à seed identique, les mêmes événements sortent dans le même
 * ordre, même à temps d'exécution égaux.
 */
import type { SimRequest } from "./runtime";

export type SimEventType =
  | "gen" // un générateur émet sa prochaine requête
  | "arrival" // une requête arrive sur un nœud
  | "service" // fin de service/traitement sur un nœud
  | "dispatch"; // tentative de distribution file → workers

export interface SimEvent {
  /** Temps simulé (ms depuis le début). */
  time: number;
  /** Numéro d'insertion — départage déterministe des temps égaux. */
  seq: number;
  type: SimEventType;
  nodeId: string;
  req: SimRequest | null;
}

export interface EventPayload {
  time: number;
  type: SimEventType;
  nodeId: string;
  req?: SimRequest;
}

/** a doit sortir avant b ? */
function before(a: SimEvent, b: SimEvent): boolean {
  return a.time < b.time || (a.time === b.time && a.seq < b.seq);
}

export class EventHeap {
  private readonly items: SimEvent[] = [];
  private seq = 0;

  get size(): number {
    return this.items.length;
  }

  push(p: EventPayload): void {
    const ev: SimEvent = {
      time: p.time,
      seq: this.seq++,
      type: p.type,
      nodeId: p.nodeId,
      req: p.req ?? null,
    };
    this.items.push(ev);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(this.items[i], this.items[parent])) break;
      const tmp = this.items[i];
      this.items[i] = this.items[parent];
      this.items[parent] = tmp;
      i = parent;
    }
  }

  peek(): SimEvent | null {
    return this.items.length > 0 ? this.items[0] : null;
  }

  pop(): SimEvent | null {
    const n = this.items.length;
    if (n === 0) return null;
    const top = this.items[0];
    const last = this.items[n - 1];
    this.items.pop();
    if (n > 1) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && before(this.items[l], this.items[m])) m = l;
        if (r < this.items.length && before(this.items[r], this.items[m])) m = r;
        if (m === i) break;
        const tmp = this.items[i];
        this.items[i] = this.items[m];
        this.items[m] = tmp;
        i = m;
      }
    }
    return top;
  }
}
