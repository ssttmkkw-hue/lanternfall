// Injected time source (DESIGN §5.1). Interactive play: realClock. Tests: FakeClock.
export type TimerHandle = number;

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(h: TimerHandle): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as TimerHandle,
  clearTimeout: (h) => globalThis.clearTimeout(h as unknown as ReturnType<typeof setTimeout>),
};

export class FakeClock implements Clock {
  private t = 0;
  private seq = 0;
  private timers: { id: number; at: number; fn: () => void }[] = [];
  now(): number { return this.t; }
  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = ++this.seq;
    this.timers.push({ id, at: this.t + Math.max(0, ms), fn });
    return id;
  }
  clearTimeout(h: TimerHandle): void { this.timers = this.timers.filter((x) => x.id !== h); }
  /** Advances time, firing due timers in (time, creation) order. */
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x !== due);
      this.t = due.at;
      due.fn();
    }
    this.t = end;
  }
}
