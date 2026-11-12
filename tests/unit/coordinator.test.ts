// §5.1 round protocol, Tactical pacing, FakeClock-driven timeouts.
import { describe, expect, it } from 'vitest';
import { HelperBot } from '../../src/controllers/bots/helper';
import { HumanController } from '../../src/controllers/human/human';
import type { Controller, Decision, DecisionRequest } from '../../src/protocol/types';
import { FakeClock } from '../../src/session/clock';
import { Coordinator } from '../../src/session/coordinator';
import { createMatch } from '../../src/session/match';
import { buildObservation } from '../../src/engine/observe';
import { makeState, put, testRules } from '../helpers';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Async controller whose replies are released by the test. */
class Deferred implements Controller {
  readonly id = 'llm:fake';
  readonly kind = 'llm' as const;
  reqs: DecisionRequest[] = [];
  signals: AbortSignal[] = [];
  private resolvers: ((d: Decision) => void)[] = [];
  decide(req: DecisionRequest, signal: AbortSignal): Promise<Decision> {
    this.reqs.push(req);
    this.signals.push(signal);
    return new Promise((r) => this.resolvers.push(r));
  }
  reply(d: Partial<Decision>, i = this.resolvers.length - 1) {
    this.resolvers[i]!({ requestId: this.reqs[i]!.requestId, ...d });
  }
}

class Scripted implements Controller {
  readonly id = 'bot:scripted';
  readonly kind = 'bot' as const;
  constructor(private readonly f: (req: DecisionRequest) => unknown) {}
  decide(req: DecisionRequest): Decision { return this.f(req) as Decision; }
}

describe('coordinator (Tactical)', () => {
  it('waits for the human Lock; pending edits stay local; Lock is final', async () => {
    const human = new HumanController();
    const { coordinator } = createMatch({ seed: 1, controllers: [human, new HelperBot()] });
    let done = false;
    const p = coordinator.playRound().then((o) => { done = true; return o; });
    await flush();
    expect(done).toBe(false);
    expect(human.request?.requestId).toBe(`${coordinator.state.matchId}:1:0`);
    expect(human.setPending({ t: 'move', dir: 'N' })).toBe(true);
    human.undo();
    expect(human.setPending({ t: 'move', dir: 'S' })).toBe(false); // the Hearth is south of actor 0: illegal
    human.setPending({ t: 'move', dir: 'W' });
    await flush();
    expect(done).toBe(false);
    expect(human.lock()).toBe(true);
    expect(human.lock()).toBe(false);
    const out = await p;
    expect(out.accepted[0]).toEqual({ actor: 0, action: { t: 'move', dir: 'W' }, source: 'controller' });
    expect(out.accepted[1]!.source).toBe('controller');
    expect(out.state.round).toBe(1);
  });

  it('rejects duplicate and stale submissions and counts them', async () => {
    const human = new HumanController();
    const { coordinator } = createMatch({ seed: 1, controllers: [human, new HelperBot()] });
    const p = coordinator.playRound();
    await flush();
    const id = human.request!.requestId;
    expect(coordinator.submit({ requestId: `${coordinator.state.matchId}:1:1`, action: { t: 'wait' } })).toBe(false); // bot already decided
    expect(coordinator.rejected.duplicate).toBe(1);
    expect(coordinator.submit({ requestId: 'old:0:0' })).toBe(false);
    expect(coordinator.rejected.stale).toBe(1);
    expect(coordinator.submit({ requestId: id, action: { t: 'move', dir: 'S' } })).toBe(false); // illegal; stays open
    expect(coordinator.rejected.illegal).toBe(1);
    expect(coordinator.submit({ requestId: id, action: { t: 'wait' } })).toBe(true);
    await p;
    expect(coordinator.submit({ requestId: id, action: { t: 'wait' } })).toBe(false);
    expect(coordinator.rejected.late).toBe(1);
  });

  it('an async controller that times out (FakeClock) gets the companion fallback; a late reply is rejected', async () => {
    const clock = new FakeClock();
    const llm = new Deferred();
    const state = makeState(1);
    const c = new Coordinator({ state, rules: testRules(), seats: [{ controller: llm, companion: new HelperBot() }], clock });
    const p = c.playRound();
    await flush();
    clock.advance(9_999);
    await flush();
    expect(c.pendingRequests).toHaveLength(1);
    clock.advance(1);
    const out = await p;
    expect(out.accepted[0]!.source).toBe('fallback');
    expect(c.rejected.timeout).toBe(1);
    llm.reply({ action: { t: 'wait' } }, 0);
    await flush();
    expect(c.rejected.late).toBe(1);
    expect(c.labels[0]).toMatch(/fallback/);
  });

  it('a malformed bot reply is rejected and the companion bot acts instead', async () => {
    const bad = new Scripted((req) => ({ requestId: req.requestId, action: { t: 'teleport' } }));
    const c = new Coordinator({ state: makeState(1), rules: testRules(), seats: [{ controller: bad, companion: new HelperBot() }] });
    const out = await c.playRound();
    expect(out.accepted[0]!.source).toBe('fallback');
    expect(c.rejected.malformed).toBe(1);
  });

  it('a human with no valid decision idles (wait, source idle)', async () => {
    const thrower = new Scripted(() => { throw new Error('boom'); });
    const c = new Coordinator({ state: makeState(1), rules: testRules(), seats: [{ controller: Object.assign(thrower, { kind: 'human' }) as unknown as Controller }] });
    const out = await c.playRound();
    expect(out.accepted[0]).toEqual({ actor: 0, action: { t: 'wait' }, source: 'idle' });
  });

  it('a persistent Order is expanded by the executor (source order) and cleared when done', async () => {
    let first = true;
    const ctl = new Scripted((req) => {
      if (first) { first = false; return { requestId: req.requestId, order: { t: 'goTo', at: { x: 4, y: 5 } } }; }
      return { requestId: req.requestId };
    });
    const c = new Coordinator({ state: makeState(1), rules: testRules(), seats: [{ controller: ctl }] });
    // actor 0 starts N of the Hearth at (6,5)
    const o1 = await c.playRound();
    expect(o1.accepted[0]).toMatchObject({ action: { t: 'move', dir: 'W' }, source: 'order' });
    await c.playRound();
    expect(c.state.actors[0]!.pos).toEqual({ x: 4, y: 5 });
    const o3 = await c.playRound();
    expect(o3.accepted[0]!.source).toBe('order'); // goTo reached: wait + done
    expect(c.orders[0]).toBeNull();
  });

  it('arrival order of async replies does not change the result', async () => {
    const run = async (order: number[]) => {
      const a = new Deferred();
      const b = new Deferred();
      const c = new Coordinator({ state: makeState(2), rules: testRules(), seats: [{ controller: a }, { controller: b }] });
      const p = c.playRound();
      await flush();
      const replies = [() => a.reply({ action: { t: 'move', dir: 'W' } }), () => b.reply({ action: { t: 'move', dir: 'E' } })];
      for (const i of order) { replies[i]!(); await flush(); }
      return (await p).hash;
    };
    expect(await run([0, 1])).toBe(await run([1, 0]));
  });
});

/** requestId of `actor` for the same round as `req`. */
const idFor = (req: DecisionRequest, actor: number) => req.requestId.replace(/:\d+$/, `:${actor}`);

describe('review M1 #1: pull replies are bound to their originating seat', () => {
  it('sync: a bot replying with a stale id is rejected and its seat settles to the fallback (no stall)', async () => {
    const stale = new Scripted(() => ({ requestId: 'old:0:0', action: { t: 'wait' } }));
    const c = new Coordinator({ state: makeState(1), rules: testRules(), seats: [{ controller: stale, companion: new HelperBot() }] });
    const out = await c.playRound(); // no clock: a stall would hang this test
    expect(out.accepted[0]!.source).toBe('fallback');
    expect(c.rejected.stale).toBe(1);
  });

  it("sync: a bot replying with another open seat's id cannot decide that seat", async () => {
    const b = new Deferred();
    const thief = new Scripted((req) => ({ requestId: idFor(req, 1), action: { t: 'move', dir: 'E' } }));
    const c = new Coordinator({ state: makeState(2), rules: testRules(), seats: [{ controller: thief }, { controller: b }] });
    const p = c.playRound();
    await flush();
    expect(c.rejected.stale).toBe(1);
    expect(c.pendingRequests.map((r) => r.requestId)).toEqual([b.reqs[0]!.requestId]); // seat 1 still open
    b.reply({ action: { t: 'wait' } });
    const out = await p;
    expect(out.accepted[0]).toMatchObject({ actor: 0, action: { t: 'wait' }, source: 'fallback' });
    expect(out.accepted[1]).toEqual({ actor: 1, action: { t: 'wait' }, source: 'controller' });
  });

  it("async: stale and cross-seat replies are rejected; each settles only its own seat", async () => {
    const a = new Deferred();
    const b = new Deferred();
    const c = new Coordinator({ state: makeState(2), rules: testRules(), seats: [{ controller: a }, { controller: b }] });
    const p = c.playRound();
    await flush();
    a.reply({ requestId: idFor(a.reqs[0]!, 1), action: { t: 'move', dir: 'E' } }); // claims seat 1
    await flush();
    expect(c.rejected.stale).toBe(1);
    expect(c.pendingRequests.map((r) => r.requestId)).toEqual([b.reqs[0]!.requestId]);
    b.reply({ requestId: 'old:0:1', action: { t: 'move', dir: 'W' } }); // stale id: settles seat 1 to fallback
    const out = await p;
    expect(c.rejected.stale).toBe(2);
    expect(out.accepted.map((x) => x.source)).toEqual(['fallback', 'fallback']);
    expect(out.accepted.every((x) => x.action.t === 'wait')).toBe(true);
  });
});

describe('review M1 #2: controller observations are detached and frozen', () => {
  it('mutating the request cannot change the persistent order, legality, or the requestId', async () => {
    let round = 0;
    const errors: unknown[] = [];
    const evil = new Scripted((req) => {
      round++;
      if (round === 1) return { requestId: req.requestId, order: { t: 'goTo', at: { x: 2, y: 5 } } };
      const o = req.observation as unknown as Record<string, any>;
      const tries = [
        () => { o.self.order.at.x = 11; },
        () => { o.team.orders[0] = null; },
        () => { o.legal.move.push('S'); },
        () => { o.legal = { ...o.legal, move: ['N', 'E', 'S', 'W'] }; },
        () => { (req as any).requestId = 'hijack'; },
      ];
      for (const t of tries) { try { t(); errors.push(null); } catch (e) { errors.push(e); } }
      return { requestId: req.requestId, action: { t: 'strike', target: 999 } }; // no such Gloomling: illegal
    });
    const c = new Coordinator({ state: makeState(1), rules: testRules(), seats: [{ controller: evil }] });
    await c.playRound();
    const o2 = await c.playRound();
    expect(errors).toHaveLength(5);
    expect(errors.every((e) => e instanceof TypeError)).toBe(true); // every write hits a frozen object
    expect(c.orders[0]).toEqual({ t: 'goTo', at: { x: 2, y: 5 } });
    expect(c.rejected.illegal).toBe(1);
    expect(o2.accepted[0]).toMatchObject({ action: { t: 'move', dir: 'W' }, source: 'order' });
  });

  it('observations never alias session data, and each seat gets its own copy', async () => {
    const order = { t: 'goTo' as const, at: { x: 3, y: 3 } };
    const ping = { kind: 'hold' as const, at: { x: 2, y: 2 } };
    const s = makeState(2);
    const obs = buildObservation(s, 0, testRules(), { orders: [order, null], pings: [{ from: 1, ping, round: 1 }] });
    expect(obs.self.order).toEqual(order);
    expect(obs.self.order).not.toBe(order);
    expect(obs.team.orders[0]).not.toBe(order);
    expect(obs.pings[0]!.ping).not.toBe(ping);
    expect(Object.isFrozen(obs.legal.move)).toBe(true);
    expect(Object.isFrozen(obs.self.pos)).toBe(true);

    const a = new Deferred();
    const b = new Deferred();
    const c = new Coordinator({ state: makeState(2), rules: testRules(), seats: [{ controller: a }, { controller: b }] });
    const p = c.playRound();
    await flush();
    expect(a.reqs[0]!.observation).not.toBe(b.reqs[0]!.observation);
    expect(a.reqs[0]!.observation.actors).not.toBe(b.reqs[0]!.observation.actors);
    expect(Object.isFrozen(a.reqs[0])).toBe(true);
    expect(() => { (a.reqs[0]!.observation.actors[1]!.pos as { x: number }).x = 0; }).toThrow(TypeError);
    expect(b.reqs[0]!.observation.self.pos).toEqual(c.state.actors[1]!.pos);
    a.reply({ action: { t: 'wait' } });
    b.reply({ action: { t: 'wait' } });
    await p;
  });
});

describe('review M1 #5: per-request abort signals', () => {
  it("a timed-out controller's signal is aborted at once, while another seat is still pending", async () => {
    const clock = new FakeClock();
    const llm = new Deferred();
    const human = new HumanController();
    const c = new Coordinator({ state: makeState(2), rules: testRules(), seats: [{ controller: human }, { controller: llm, companion: new HelperBot() }], clock });
    const p = c.playRound();
    await flush();
    expect(llm.signals[0]!.aborted).toBe(false);
    clock.advance(10_000);
    await flush();
    expect(llm.signals[0]!.aborted).toBe(true);
    expect(c.pendingRequests.map((r) => r.requestId)).toEqual([human.request!.requestId]);
    human.lock();
    const out = await p;
    expect(out.accepted[1]!.source).toBe('fallback');
  });

  it('round completion and dispose abort every outstanding signal', async () => {
    const a = new Deferred();
    const b = new Deferred();
    const c = new Coordinator({ state: makeState(2), rules: testRules(), seats: [{ controller: a }, { controller: b }] });
    const p1 = c.playRound();
    await flush();
    a.reply({ action: { t: 'wait' } });
    await flush();
    expect(a.signals[0]!.aborted).toBe(false);
    b.reply({ action: { t: 'wait' } });
    await p1;
    expect(a.signals[0]!.aborted).toBe(true);
    expect(b.signals[0]!.aborted).toBe(true);
    const p2 = c.playRound();
    await flush();
    c.dispose();
    await expect(p2).rejects.toThrow(/disposed/);
    expect(a.signals[1]!.aborted).toBe(true);
    expect(b.signals[1]!.aborted).toBe(true);
  });
});

describe('review M1 #6: companion decisions are validated like any controller', () => {
  const silent = () => new Scripted((req) => ({ requestId: req.requestId }));
  const run = async (companion: (req: DecisionRequest) => unknown) => {
    const c = new Coordinator({ state: makeState(1), rules: testRules(), seats: [{ controller: silent(), companion: new Scripted(companion) }] });
    return { c, out: await c.playRound() };
  };

  it('extra action fields are rejected (never reach the accepted action or replay)', async () => {
    const { c, out } = await run((req) => ({ requestId: req.requestId, action: { t: 'move', dir: 'W', smuggled: 'x'.repeat(1000) } }));
    expect(c.rejected.malformed).toBe(1);
    expect(out.accepted[0]).toEqual({ actor: 0, action: { t: 'wait' }, source: 'fallback' });
  });

  it('unknown top-level keys, over-long labels and wrong requestIds are rejected', async () => {
    expect((await run((req) => ({ requestId: req.requestId, action: { t: 'wait' }, extra: 1 }))).c.rejected.malformed).toBe(1);
    expect((await run((req) => ({ requestId: req.requestId, action: { t: 'wait' }, label: 'x'.repeat(49) }))).c.rejected.malformed).toBe(1);
    expect((await run(() => ({ requestId: 'old:0:0', action: { t: 'wait' } }))).c.rejected.stale).toBe(1);
    expect((await run((req) => ({ requestId: req.requestId, action: { t: 'move', dir: 'S' } }))).c.rejected.illegal).toBe(1);
  });

  it('a valid companion decision is used as a clean copy, and the fallback label stays within 48 chars', async () => {
    const { c, out } = await run((req) => ({ requestId: req.requestId, action: { t: 'move', dir: 'W' }, label: 'L'.repeat(48) }));
    expect(out.accepted[0]).toEqual({ actor: 0, action: { t: 'move', dir: 'W' }, source: 'fallback' });
    expect(c.labels[0]!.length).toBeLessThanOrEqual(48);
    expect(c.labels[0]).toMatch(/\(fallback\)$/);
  });
});

describe('review M1 #7: snuffed actors cannot hold orders (§2.1.3)', () => {
  it('orders stay null through the whole respawn delay, then may be set again', async () => {
    const goTo = { t: 'goTo' as const, at: { x: 2, y: 2 } };
    const ctl = new Scripted((req) => ({ requestId: req.requestId, order: goTo }));
    const s = makeState(1);
    put(s, 0, 2, 9);
    s.actors[0]!.hp = 0; // acts in round 1, snuffed in its phase 7, respawns in round 4
    const c = new Coordinator({ state: s, rules: testRules(), seats: [{ controller: ctl }] });
    const statuses: string[] = [];
    for (let r = 1; r <= 4; r++) {
      const out = await c.playRound();
      statuses.push(c.state.actors[0]!.status);
      expect(c.orders[0]).toBeNull(); // cleared on snuff (round 1), never reinstalled while snuffed
      if (r > 1) expect(out.accepted[0]).toEqual({ actor: 0, action: { t: 'wait' }, source: 'idle' });
    }
    expect(statuses).toEqual(['snuffed', 'snuffed', 'snuffed', 'ok']);
    await c.playRound(); // back on the map: orders work again
    expect(c.orders[0]).toEqual(goTo);
  });
});
