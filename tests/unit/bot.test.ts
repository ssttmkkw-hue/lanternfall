import { describe, expect, it } from 'vitest';
import { HelperBot } from '../../src/controllers/bots/helper';
import { executeOrder } from '../../src/controllers/executor';
import { hash32 } from '../../src/engine/rng';
import { buildObservation } from '../../src/engine/observe';
import type { DecisionRequest } from '../../src/protocol/types';
import { createMatch } from '../../src/session/match';
import { Coordinator } from '../../src/session/coordinator';
import { addGloom, addPile, addVein, makeState, put, testRules } from '../helpers';

const R = testRules();
const req = (s: ReturnType<typeof makeState>, id = 0): DecisionRequest => ({
  requestId: `t:${s.round + 1}:${id}`, observation: buildObservation(s, id, R), decisionSeed: hash32(s.seed, s.round + 1, id), budget: { nodes: 1000, deadlineMs: null },
});

describe('executor (observation-only)', () => {
  it('gather: walks to a vein, mines, then delivers', () => {
    const s = makeState(1);
    const v = addVein(s, 3, 3, 3);
    put(s, 0, 2, 4);
    let ex = executeOrder({ t: 'gather', vein: v }, buildObservation(s, 0, R))!;
    expect(ex.action.t).toBe('move');
    put(s, 0, 2, 3);
    ex = executeOrder({ t: 'gather', vein: v }, buildObservation(s, 0, R))!;
    expect(ex.action).toEqual({ t: 'mine', target: v });
    s.actors[0]!.carrying = 1;
    put(s, 0, 5, 6);
    ex = executeOrder({ t: 'gather' }, buildObservation(s, 0, R))!;
    expect(ex.action).toEqual({ t: 'deliver', target: s.hearth.id });
  });

  it('guard: strikes adjacent threats, approaches near ones, otherwise holds', () => {
    const s = makeState(1);
    put(s, 0, 6, 4);
    const g = addGloom(s, 6, 3);
    expect(executeOrder({ t: 'guard', at: { x: 6, y: 6 }, radius: 3 }, buildObservation(s, 0, R))!.action).toEqual({ t: 'strike', target: g });
    s.gloom = [];
    expect(executeOrder({ t: 'guard', at: { x: 6, y: 6 }, radius: 3 }, buildObservation(s, 0, R))!.action).toEqual({ t: 'wait' });
  });

  it('goTo reports done on arrival', () => {
    const s = makeState(1);
    expect(executeOrder({ t: 'goTo', at: s.actors[0]!.pos }, buildObservation(s, 0, R))).toEqual({ action: { t: 'wait' }, done: true });
  });
});

describe('bot:helper@1', () => {
  it('is deterministic for the same request and publishes a label', () => {
    const s = makeState(1);
    addVein(s, 2, 2, 4);
    const bot = new HelperBot();
    const a = bot.decide(req(s));
    expect(bot.decide(req(s))).toEqual(a);
    expect(a.label).toBeTruthy();
    expect(a.label!.length).toBeLessThanOrEqual(48);
  });

  it('strikes an adjacent Gloomling, and feeds the Hearth when carrying next to it', () => {
    const s = makeState(1);
    put(s, 0, 6, 5);
    const g = addGloom(s, 7, 5);
    expect(new HelperBot().decide(req(s)).action).toEqual({ t: 'strike', target: g });
    s.gloom = [];
    s.actors[0]!.carrying = 1;
    expect(new HelperBot().decide(req(s)).action).toEqual({ t: 'deliver', target: s.hearth.id });
  });

  it('gathers, delivers and guards during Surges on its own (full bot-only match)', async () => {
    const { coordinator, recorder } = createMatch({ seed: 3, controllers: [new HelperBot(), new HelperBot()] });
    const labels = new Set<string>();
    const kinds = new Set<string>();
    while (!coordinator.over) {
      const o = await coordinator.playRound();
      coordinator.labels.forEach((l) => l && labels.add(l.split(' (')[0]!));
      o.events.forEach((e) => kinds.add(e.kind));
    }
    expect(kinds).toContain('mine');
    expect(kinds).toContain('deliver');
    expect(kinds).toContain('strike');
    expect([...labels].some((l) => l.startsWith('Guarding') || l.startsWith('Fighting'))).toBe(true);
    expect(coordinator.state.result).not.toBeNull();
    expect(recorder.rounds).toBe(coordinator.state.round);
  });
});

describe('review M1 #4: helper recovers loose Ember once veins are exhausted', () => {
  it('empty-handed on or next to a pile, with no veins left, it picks the Ember up', () => {
    const s = makeState(1); // the open test cave has no veins
    expect(s.veins).toEqual([]);
    put(s, 0, 2, 2);
    const p = addPile(s, 2, 2);
    s.round = 1;
    expect(new HelperBot().decide(req(s)).action).toEqual({ t: 'pickup', target: p });
    put(s, 0, 3, 2);
    expect(new HelperBot().decide(req(s)).action).toEqual({ t: 'pickup', target: p });
  });

  it('walks to the nearest reachable pile, picks it up and delivers it to the Hearth', async () => {
    const s = makeState(1);
    addVein(s, 10, 2, 0); // an exhausted vein
    addPile(s, 2, 10, 2);
    addPile(s, 9, 9, 1);
    const fuel0 = s.hearth.fuel;
    const c = new Coordinator({ state: s, rules: testRules(), seats: [{ controller: new HelperBot() }] });
    const kinds: string[] = [];
    for (let r = 0; r < 60 && c.state.piles.length > 0; r++) (await c.playRound()).events.forEach((e) => kinds.push(e.kind));
    for (let r = 0; r < 20 && c.state.actors[0]!.carrying > 0; r++) (await c.playRound()).events.forEach((e) => kinds.push(e.kind));
    expect(c.state.piles).toEqual([]);
    expect(kinds.filter((k) => k === 'pickup').length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((k) => k === 'deliver').length).toBe(3);
    expect(c.state.hearth.fuel).toBe(fuel0 - Math.floor(c.state.round / 2) + 3 * 5); // burn on even rounds, +5 per Ember
  });
});
