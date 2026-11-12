// §2.1.3 "Economy (phase 4)"
import { describe, expect, it } from 'vitest';
import { computeLegal } from '../../src/engine/legal';
import { step } from '../../src/engine/step';
import { WAIT, acts, addPile, addVein, makeState, put, testRules } from '../helpers';

const R = testRules();

describe('economy', () => {
  it('deliver: carrying and adjacent to the Hearth adds 5, capped at 60 (overflow lost)', () => {
    const s = makeState(1);
    put(s, 0, 6, 5);
    s.actors[0]!.carrying = 1;
    s.hearth.fuel = 30;
    let out = step(s, acts([0, { t: 'deliver', target: s.hearth.id }]), R).state;
    expect(out.hearth.fuel).toBe(35);
    expect(out.actors[0]!.carrying).toBe(0);
    const t = makeState(1);
    put(t, 0, 6, 5);
    t.actors[0]!.carrying = 1;
    t.hearth.fuel = 58;
    out = step(t, acts([0, { t: 'deliver', target: t.hearth.id }]), R).state;
    expect(out.hearth.fuel).toBe(60);
  });

  it('mine: empty-handed next to a vein; shared vein goes to lower ids while it lasts, the rest fizzle', () => {
    const s = makeState(2);
    const v = addVein(s, 3, 3, 1);
    put(s, 0, 2, 3); put(s, 1, 4, 3);
    const r = step(s, acts([0, { t: 'mine', target: v }], [1, { t: 'mine', target: v }]), R);
    expect(r.state.actors.map((a) => a.carrying)).toEqual([1, 0]);
    expect(r.state.veins.find((x) => x.id === v)!.amount).toBe(0);
    expect(r.events.some((e) => e.kind === 'fizzle' && e.actor === 1)).toBe(true);
  });

  it('veins do not replenish and empty veins leave the legal set', () => {
    const s = makeState(1);
    const v = addVein(s, 3, 3, 1);
    put(s, 0, 2, 3);
    let out = step(s, acts([0, { t: 'mine', target: v }]), R).state;
    out.actors[0]!.carrying = 0;
    for (let i = 0; i < 5; i++) out = step(out, acts([0, WAIT]), R).state;
    expect(out.veins.find((x) => x.id === v)!.amount).toBe(0);
    expect(computeLegal(out, 0, R).mine).toEqual([]);
  });

  it('pickup from own or adjacent tile; two pickups on one pile both fail', () => {
    const s = makeState(2);
    const p = addPile(s, 3, 3, 2);
    put(s, 0, 3, 3); put(s, 1, 4, 3);
    expect(computeLegal(s, 0, R).pickup).toEqual([p]);
    let out = step(s, acts([0, { t: 'pickup', target: p }], [1, { t: 'pickup', target: p }]), R).state;
    expect(out.actors.map((a) => a.carrying)).toEqual([0, 0]);
    out = step(out, acts([0, { t: 'pickup', target: p }], [1, WAIT]), R).state;
    expect(out.actors[0]!.carrying).toBe(1);
    expect(out.piles[0]!.amount).toBe(1);
  });

  it('drop onto own tile merges into a pile; dropped Ember is pickable only next round', () => {
    const s = makeState(2);
    put(s, 0, 3, 3); put(s, 1, 4, 3);
    s.actors[0]!.carrying = 1;
    const out = step(s, acts([0, { t: 'drop' }], [1, WAIT]), R).state;
    expect(out.piles).toHaveLength(1);
    expect(out.piles[0]!.pos).toEqual({ x: 3, y: 3 });
    expect(computeLegal(out, 1, R).pickup).toEqual([out.piles[0]!.id]);
    out.actors[1]!.carrying = 1;
    out.actors[1]!.pos = { x: 3, y: 3 };
    out.actors[0]!.pos = { x: 2, y: 3 };
    const out2 = step(out, acts([1, { t: 'drop' }], [0, WAIT]), R).state;
    expect(out2.piles).toHaveLength(1);
    expect(out2.piles[0]!.amount).toBe(2);
  });

  it('sub-order: deliver happens before mine within a round', () => {
    const s = makeState(2);
    const v = addVein(s, 7, 4, 3);
    put(s, 0, 6, 5); put(s, 1, 7, 5);
    s.actors[0]!.carrying = 1;
    const r = step(s, acts([0, { t: 'deliver', target: s.hearth.id }], [1, { t: 'mine', target: v }]), R);
    const kinds = r.events.filter((e) => e.kind === 'deliver' || e.kind === 'mine').map((e) => e.kind);
    expect(kinds).toEqual(['deliver', 'mine']);
  });
});
