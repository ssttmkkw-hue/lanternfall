// Session coordinator (DESIGN §5.1). Tactical pacing: no round deadline; resolves when every seat
// has a valid decision or an expired controller timeout.
import { hashState } from '../engine/check';
import type { EngineEvent } from '../engine/events';
import { hash32 } from '../engine/rng';
import type { ModeRules } from '../engine/modes/types';
import { buildObservation } from '../engine/observe';
import type { GameState } from '../engine/state';
import { step } from '../engine/step';
import { executeOrder } from '../controllers/executor';
import type {
  AcceptedAction, Action, ActorId, Controller, Decision, DecisionRequest, Observation, Order, Ping, RoundInput,
} from '../protocol/types';
import { actionInLegal, validateDecision } from '../protocol/validate';
import type { Clock, TimerHandle } from './clock';
import { CONTROLLER_TIMEOUT_MS, type Pacing, TACTICAL } from './pacing';
import type { ReplayRecorder } from './replay';

export interface Seat {
  controller: Controller;
  /** Companion rule bot used as the fallback for AI seats (DESIGN §5.1 step 4). */
  companion?: Controller;
}

export interface CoordinatorOptions {
  state: GameState;
  rules: ModeRules;
  seats: readonly Seat[]; // index = actorId
  pacing?: Pacing;
  /** null = no clock (headless): async controllers never time out, so only sync bots may sit. */
  clock?: Clock | null;
  timeouts?: Partial<Record<Controller['kind'], number | null>>;
  recorder?: ReplayRecorder;
  nodeBudget?: number;
}

export interface RoundOutcome {
  round: number;
  accepted: AcceptedAction[];
  events: EngineEvent[];
  state: GameState;
  hash: string;
}

interface OpenEntry {
  actorId: ActorId;
  req: DecisionRequest;
  decision: Decision | null;
  settled: boolean;
  expired: boolean;
  timer: TimerHandle | null;
}

export type RejectReason = 'stale' | 'duplicate' | 'late' | 'malformed' | 'illegal' | 'error' | 'timeout';

export class Coordinator {
  state: GameState;
  readonly rules: ModeRules;
  readonly orders: (Order | null)[];
  readonly labels: (string | undefined)[];
  readonly sources: (AcceptedAction['source'] | undefined)[];
  pings: { from: ActorId; ping: Ping; round: number }[] = [];
  lastEvents: EngineEvent[] = [];
  readonly rejected: Record<RejectReason, number> = { stale: 0, duplicate: 0, late: 0, malformed: 0, illegal: 0, error: 0, timeout: 0 };

  private readonly seats: readonly Seat[];
  private readonly clock: Clock | null;
  private readonly pacing: Pacing;
  private readonly timeouts: Record<Controller['kind'], number | null>;
  private readonly recorder: ReplayRecorder | undefined;
  private readonly nodeBudget: number;
  private abort: AbortController | null = null;
  private open: OpenEntry[] = [];
  private settleWaiter: (() => void) | null = null;
  private busy = false;
  private disposed = false;

  constructor(opts: CoordinatorOptions) {
    this.state = opts.state;
    this.rules = opts.rules;
    this.seats = opts.seats;
    this.pacing = opts.pacing ?? TACTICAL;
    if (this.pacing.kind !== 'tactical') throw new Error('Live pacing is gated to after Tactical acceptance (DESIGN §8 M1.8)');
    this.clock = opts.clock ?? null;
    this.timeouts = { ...CONTROLLER_TIMEOUT_MS, ...opts.timeouts };
    this.recorder = opts.recorder;
    this.nodeBudget = opts.nodeBudget ?? 20_000;
    const n = opts.state.actors.length;
    if (opts.seats.length !== n) throw new Error(`need ${n} seats, got ${opts.seats.length}`);
    this.orders = new Array<Order | null>(n).fill(null);
    this.labels = new Array<string | undefined>(n).fill(undefined);
    this.sources = new Array<AcceptedAction['source'] | undefined>(n).fill(undefined);
  }

  get over(): boolean { return this.state.result !== null; }

  observationFor(actorId: ActorId): Observation {
    return buildObservation(this.state, actorId, this.rules, {
      events: this.lastEvents, orders: this.orders, labels: this.labels, pings: this.pings,
    });
  }

  private requestFor(actorId: ActorId): DecisionRequest {
    const round = this.state.round + 1;
    return {
      requestId: `${this.state.matchId}:${round}:${actorId}`,
      observation: this.observationFor(actorId),
      decisionSeed: hash32(this.state.seed, round, actorId),
      budget: { nodes: this.nodeBudget, deadlineMs: null },
    };
  }

  /** Push-style submission (e.g. remote controllers). The first valid decision per requestId counts. */
  submit(raw: unknown): boolean {
    return this.accept(raw, false);
  }

  private reject(reason: RejectReason): false {
    this.rejected[reason]++;
    return false;
  }

  private accept(raw: unknown, fromDecide: boolean, expectedId?: string): boolean {
    const rid = (raw as { requestId?: unknown } | null)?.requestId;
    const id = typeof rid === 'string' ? rid : expectedId;
    const e = this.open.find((x) => x.req.requestId === id);
    if (!e) return this.reject(typeof rid === 'string' ? 'stale' : 'malformed');
    if (e.settled) return this.reject(e.expired ? 'late' : 'duplicate');
    const obs = e.req.observation;
    const v = validateDecision(raw, {
      requestId: e.req.requestId, legal: obs.legal, allowList: this.rules.allowList, chat: this.rules.chat, w: obs.map.w, h: obs.map.h,
    });
    if (!v.ok) {
      this.reject(v.reason.startsWith('illegal') ? 'illegal' : v.reason.startsWith('stale') ? 'stale' : 'malformed');
      // A pull-style reply gets one shot; settle it so the round can continue to the fallback.
      if (fromDecide) this.settle(e, null, false);
      return false;
    }
    this.settle(e, v.decision, false);
    return true;
  }

  private settle(e: OpenEntry, d: Decision | null, expired: boolean): void {
    if (e.settled) return;
    e.settled = true;
    e.expired = expired;
    e.decision = d;
    if (e.timer !== null && this.clock) this.clock.clearTimeout(e.timer);
    e.timer = null;
    if (this.open.every((x) => x.settled) && this.settleWaiter) {
      const w = this.settleWaiter;
      this.settleWaiter = null;
      w();
    }
  }

  /** Requests currently awaiting a decision (for UI and tests). */
  get pendingRequests(): readonly DecisionRequest[] {
    return this.open.filter((e) => !e.settled).map((e) => e.req);
  }

  async playRound(): Promise<RoundOutcome> {
    if (this.disposed) throw new Error('coordinator disposed');
    if (this.over) throw new Error('match is over');
    if (this.busy) throw new Error('round already in progress');
    this.busy = true;
    try {
      const round = this.state.round + 1;
      this.abort?.abort();
      const abort = new AbortController();
      this.abort = abort;
      this.open = this.state.actors.map((a) => ({ actorId: a.id, req: this.requestFor(a.id), decision: null, settled: false, expired: false, timer: null }));
      const allSettled = new Promise<void>((res) => { this.settleWaiter = res; });

      for (const e of this.open) {
        const seat = this.seats[e.actorId]!;
        let r: Decision | Promise<Decision>;
        try {
          r = seat.controller.decide(e.req, abort.signal);
        } catch {
          this.rejected.error++;
          this.settle(e, null, false);
          continue;
        }
        if (r && typeof (r as Promise<Decision>).then === 'function') {
          const timeout = this.timeouts[seat.controller.kind];
          if (timeout !== null && this.clock) {
            e.timer = this.clock.setTimeout(() => {
              if (!e.settled) { this.rejected.timeout++; this.settle(e, null, true); }
            }, timeout);
          }
          (r as Promise<Decision>).then(
            (d) => { if (abort.signal.aborted) this.rejected.late++; else this.accept(d, true, e.req.requestId); },
            () => { if (!e.settled && !abort.signal.aborted) { this.rejected.error++; this.settle(e, null, false); } },
          );
        } else {
          this.accept(r, true, e.req.requestId);
        }
      }
      if (this.open.every((x) => x.settled)) this.settleWaiter = null;
      else await allSettled;
      if (this.disposed) throw new Error('coordinator disposed');

      const accepted: AcceptedAction[] = [];
      const clearAfter: ActorId[] = [];
      for (const e of this.open) {
        const a = this.chooseAction(e, abort.signal, clearAfter);
        if (a) accepted.push(a);
      }
      abort.abort(); // nothing outstanding may answer for this round any more
      this.open = this.open.map((e) => ({ ...e, settled: true, expired: true }));

      const input: RoundInput = { round, actions: accepted };
      const res = step(this.state, accepted, this.rules);
      this.state = res.state;
      this.lastEvents = res.events;
      for (const id of [...clearAfter, ...res.snuffed]) this.orders[id] = null;
      this.pings = this.pings.filter((p) => round + 1 - p.round <= 5);
      this.recorder?.record(input, res.state);
      return { round, accepted, events: res.events, state: res.state, hash: hashState(res.state) };
    } finally {
      this.busy = false;
    }
  }

  private chooseAction(e: OpenEntry, signal: AbortSignal, clearAfter: ActorId[]): AcceptedAction | null {
    const id = e.actorId;
    const obs = e.req.observation;
    const seat = this.seats[id]!;
    const d = e.decision;
    if (d) {
      if (d.order !== undefined) this.orders[id] = d.order;
      if (d.label !== undefined) this.labels[id] = d.label;
    }
    if (obs.self.status === 'snuffed') {
      this.sources[id] = 'idle';
      return { actor: id, action: { t: 'wait' }, source: 'idle' };
    }
    const ping = d?.ping;
    if (ping) this.pings.push({ from: id, ping, round: e.req.observation.round });
    const mk = (action: Action, source: AcceptedAction['source']): AcceptedAction => {
      this.sources[id] = source;
      return ping ? { actor: id, action, ping, source } : { actor: id, action, source };
    };
    if (d?.action) return mk(d.action, 'controller');
    const order = this.orders[id];
    if (order) {
      const ex = executeOrder(order, obs);
      if (ex && actionInLegal(ex.action, obs.legal)) {
        if (ex.done) clearAfter.push(id);
        return mk(ex.action, 'order');
      }
      clearAfter.push(id); // impossible order
    }
    if (seat.controller.kind !== 'human' && seat.companion) {
      try {
        const c = seat.companion.decide(e.req, signal);
        if (!(c instanceof Promise) && c.action && actionInLegal(c.action, obs.legal) && this.rules.allowList.includes(c.action.t)) {
          this.labels[id] = c.label ? `${c.label} (fallback)` : 'Fallback';
          return mk(c.action, 'fallback');
        }
      } catch {
        this.rejected.error++;
      }
    }
    return mk({ t: 'wait' }, seat.controller.kind === 'human' ? 'idle' : 'fallback');
  }

  /** Plays rounds until the match ends (headless / tests). */
  async runToEnd(maxRounds = 10_000): Promise<GameState> {
    for (let i = 0; i < maxRounds && !this.over; i++) await this.playRound();
    return this.state;
  }

  dispose(): void {
    this.disposed = true;
    this.abort?.abort();
    if (this.settleWaiter) { const w = this.settleWaiter; this.settleWaiter = null; w(); }
    for (const s of this.seats) { s.controller.dispose?.(); s.companion?.dispose?.(); }
  }
}
