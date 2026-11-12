// §2.1.3 strikes, Gloomling action/priority/movement/path
import { describe, expect, it } from 'vitest';
import { computeLegal } from '../../src/engine/legal';
import { recomputeGloomPaths } from '../../src/engine/resolve/gloom';
import { step } from '../../src/engine/step';
import { WAIT, acts, addGloom, makeState, mv, put, testRules } from '../helpers';

const R = testRules();

describe('strikes (phase 3)', () => {
  it('damage from simultaneous strikes sums; dead Gloomlings are removed and do not act', () => {
    const s = makeState(2);
    put(s, 0, 1, 2); put(s, 1, 3, 2);
    const g = addGloom(s, 2, 2);
    const r = step(s, acts([0, { t: 'strike', target: g }], [1, { t: 'strike', target: g }]), R);
    expect(r.state.gloom).toHaveLength(0);
    expect(r.state.actors.map((a) => a.hp)).toEqual([3, 3]);
  });

  it('one strike leaves it at 1 HP and it attacks the same round', () => {
    const s = makeState(1);
    put(s, 0, 1, 2);
    const g = addGloom(s, 2, 2);
    const out = step(s, acts([0, { t: 'strike', target: g }]), R).state;
    expect(out.gloom[0]!.hp).toBe(1);
    expect(out.actors[0]!.hp).toBe(2);
  });

  it('only Gloomlings adjacent at round start are strike targets', () => {
    const s = makeState(1);
    put(s, 0, 1, 2);
    addGloom(s, 3, 2);
    expect(computeLegal(s, 0, R).strike).toEqual([]);
  });
});

describe('Gloomling action (phase 5)', () => {
  it('attacks the adjacent actor with the lowest HP, then lowest id', () => {
    const s = makeState(2);
    put(s, 0, 2, 1); put(s, 1, 2, 3);
    addGloom(s, 2, 2);
    let out = step(s, acts([0, WAIT], [1, WAIT]), R).state;
    expect(out.actors.map((a) => a.hp)).toEqual([2, 3]); // tie → lowest id
    out = step(out, acts([0, WAIT], [1, WAIT]), R).state;
    expect(out.actors.map((a) => a.hp)).toEqual([1, 3]); // lowest HP
  });

  it('uses positions after phase 2: an actor stepping away is not attacked', () => {
    const s = makeState(1);
    put(s, 0, 2, 3);
    addGloom(s, 2, 2);
    const out = step(s, acts([0, mv('S')]), R).state;
    expect(out.actors[0]!.hp).toBe(3);
  });

  it('attacks the Hearth (−3) when no actor is adjacent, and never moves and attacks together', () => {
    const s = makeState(1);
    put(s, 0, 1, 1);
    addGloom(s, 6, 5);
    const f = s.hearth.fuel;
    const out = step(s, acts([0, WAIT]), R).state;
    expect(out.hearth.fuel).toBe(f - 3);
    expect(out.gloom[0]!.pos).toEqual({ x: 6, y: 5 });
  });

  it('damage is applied together and clamped at 0', () => {
    const s = makeState(1);
    put(s, 0, 1, 1);
    s.hearth.fuel = 4;
    addGloom(s, 6, 5); addGloom(s, 6, 7);
    const out = step(s, acts([0, WAIT]), R).state;
    expect(out.hearth.fuel).toBe(0);
  });

  it('moves one step along its path; on a round-start lit tile only on even rounds', () => {
    const s = makeState(1);
    put(s, 0, 11, 11);
    addGloom(s, 1, 1); // dark corner
    const p0 = s.gloom[0]!.path[0]!;
    let out = step(s, acts([0, WAIT]), R).state; // round 1, dark → moves
    expect(out.gloom[0]!.pos).toEqual(p0);
    const t = makeState(1);
    put(t, 0, 11, 11);
    addGloom(t, 6, 3); // lit (dy = 3)
    out = step(t, acts([0, WAIT]), R).state; // round 1 odd → stays
    expect(out.gloom[0]!.pos).toEqual({ x: 6, y: 3 });
    out = step(out, acts([0, WAIT]), R).state; // round 2 even → moves
    expect(out.gloom[0]!.pos).toEqual({ x: 6, y: 4 });
  });

  it('is blocked by actors and by lower-id Gloomlings that moved first; may enter a vacated tile', () => {
    const s = makeState(1);
    put(s, 0, 11, 11);
    const a = addGloom(s, 1, 9);
    const b = addGloom(s, 1, 10);
    s.gloom.find((g) => g.id === a)!.path = [{ x: 2, y: 9 }];
    s.gloom.find((g) => g.id === b)!.path = [{ x: 1, y: 9 }];
    const out = step(s, acts([0, WAIT]), R).state;
    expect(out.gloom.map((g) => g.pos)).toEqual([{ x: 2, y: 9 }, { x: 1, y: 9 }]);

    const t = makeState(1);
    put(t, 0, 2, 9);
    const c = addGloom(t, 1, 9);
    t.gloom.find((g) => g.id === c)!.path = [{ x: 2, y: 9 }, { x: 3, y: 9 }];
    t.actors[0]!.pos = { x: 2, y: 10 };
    // actor steps N into the Gloomling's next tile in phase 2 → it is blocked... but now adjacent, so it attacks instead
    const out2 = step(t, acts([0, mv('N')]), R).state;
    expect(out2.gloom[0]!.pos).toEqual({ x: 1, y: 9 });
    expect(out2.actors[0]!.hp).toBe(2);
  });

  it('path: BFS (N,E,S,W order) to a tile adjacent to the Hearth, recomputed in phase 10', () => {
    const s = makeState(1);
    addGloom(s, 6, 1);
    const path = s.gloom[0]!.path;
    expect(path.at(-1)).toEqual({ x: 6, y: 5 });
    expect(path).toHaveLength(4);
    s.gloom[0]!.pos = { x: 1, y: 6 };
    recomputeGloomPaths(s);
    expect(s.gloom[0]!.path.at(-1)).toEqual({ x: 5, y: 6 });
  });
});
