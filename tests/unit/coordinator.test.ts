// §5.1 round protocol, Tactical pacing, FakeClock-driven timeouts.
import { describe, expect, it } from 'vitest';
import { HelperBot } from '../../src/controllers/bots/helper';
import { HumanController } from '../../src/controllers/human/human';
import type { Controller, Decision, DecisionRequest } from '../../src/protocol/types';
import { FakeClock } from '../../src/session/clock';
import { Coordinator } from '../../src/session/coordinator';
import { createMatch } from '../../src/session/match';
import { makeState, testRules } from '../helpers';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Async controller whose replies are released by the test. */
class Deferred implements Controller {
  readonly id = 'llm:fake';
  readonly kind = 'llm' as const;
  reqs: DecisionRequest[] = [];
  private resolvers: ((d: Decision) => void)[] = [];
  decide(req: DecisionRequest): Promise<Decision> {
    this.reqs.push(req);
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
