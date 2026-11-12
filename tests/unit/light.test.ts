// §2.1 conventions + §2.1.1 light, vision and refuelling
import { describe, expect, it } from 'vitest';
import { bresenham, computeLit, hasLos } from '../../src/engine/grid';
import { computeLegal } from '../../src/engine/legal';
import { buildObservation } from '../../src/engine/observe';
import { step } from '../../src/engine/step';
import { idx } from '../../src/engine/state';
import { WAIT, acts, addVein, makeState, mv, put, testRules } from '../helpers';

const R = testRules();

describe('geometry', () => {
  it('Bresenham is drawn source → target and ties step the major axis first', () => {
    expect(bresenham({ x: 0, y: 0 }, { x: 4, y: 2 })).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 2 },
    ]);
    expect(bresenham({ x: 0, y: 0 }, { x: 2, y: 1 })).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }]);
    expect(bresenham({ x: 2, y: 1 }, { x: 0, y: 0 })).toEqual([{ x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }]);
  });

  it('LOS: opaque tiles strictly between block; the opaque tile itself is reachable', () => {
    const w = 5;
    const opaque = new Array(25).fill(0);
    opaque[2] = 1; // (2,0)
    expect(hasLos(opaque, w, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
    expect(hasLos(opaque, w, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
  });

  it('radius uses dx²+dy² ≤ r²', () => {
    const s = makeState(1);
    const lit = computeLit(s, 4);
    expect(lit[idx(s, 6 + 4, 6)]).toBe(1);
    expect(lit[idx(s, 6 + 3, 6 + 2)]).toBe(1); // 13
    expect(lit[idx(s, 6 + 3, 6 + 3)]).toBe(0); // 18
    expect(lit[idx(s, 6 + 4, 6 + 1)]).toBe(0); // 17
  });

  it('veins are opaque (shadow behind them) and render lit themselves', () => {
    const s = makeState(1);
    addVein(s, 6, 4, 3);
    expect(s.lit[idx(s, 6, 4)]).toBe(1);
    expect(s.lit[idx(s, 6, 3)]).toBe(0);
  });

  it('a Hearth with 0 fuel lights nothing', () => {
    const s = makeState(1);
    s.hearth.fuel = 0;
    expect(computeLit(s, 4).every((v) => v === 0)).toBe(true);
  });
});

describe('fuel and Dimmed (phase 6)', () => {
  it('ending a round outside light drains 1; ending in light refills to max and clears Dimmed', () => {
    const s = makeState(1);
    put(s, 0, 1, 2);
    let out = step(s, acts([0, WAIT]), R).state;
    expect(out.actors[0]!.fuel).toBe(19);
    out.actors[0]!.fuel = 1;
    out = step(out, acts([0, WAIT]), R).state;
    expect(out.actors[0]!.fuel).toBe(0);
    expect(out.actors[0]!.status).toBe('dimmed');
    out.actors[0]!.pos = { x: 6, y: 4 };
    out = step(out, acts([0, WAIT]), R).state;
    expect(out.actors[0]!.fuel).toBe(20);
    expect(out.actors[0]!.status).toBe('ok');
  });

  it('refuel uses the lit set recomputed after this round\'s move', () => {
    const s = makeState(1);
    put(s, 0, 2, 6); // dx=4 → lit; step W to (1,6): dx=5 → dark
    s.actors[0]!.fuel = 5;
    const out = step(s, acts([0, mv('W')]), R).state;
    expect(out.actors[0]!.fuel).toBe(4);
  });

  it('Dimmed: only wait, and move on even rounds; still targetable', () => {
    const s = makeState(1);
    put(s, 0, 1, 2);
    s.actors[0]!.status = 'dimmed';
    s.actors[0]!.fuel = 0;
    s.round = 0; // deciding round 1 (odd)
    expect(computeLegal(s, 0, R).move).toEqual([]);
    s.round = 1; // round 2 (even)
    expect(computeLegal(s, 0, R).move.length).toBeGreaterThan(0);
    expect(computeLegal(s, 0, R).strike).toEqual([]);
  });

  it('the Hearth burns 1 on even rounds only', () => {
    let s = makeState(1);
    const f0 = s.hearth.fuel;
    s = step(s, acts([0, WAIT]), R).state; // round 1
    expect(s.hearth.fuel).toBe(f0);
    s = step(s, acts([0, WAIT]), R).state; // round 2
    expect(s.hearth.fuel).toBe(f0 - 1);
  });

  it('M1 is fully visible but not fully lit', () => {
    const s = makeState(1);
    const o = buildObservation(s, 0, R);
    expect(o.map.visible.every((r) => /^1+$/.test(r))).toBe(true);
    expect(o.map.lit.some((r) => r.includes('0'))).toBe(true);
  });
});
