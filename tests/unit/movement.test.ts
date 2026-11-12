// §2.1.3 "Actor movement (phase 2)"
import { describe, expect, it } from 'vitest';
import { computeLegal } from '../../src/engine/legal';
import { step } from '../../src/engine/step';
import { WAIT, acts, addGloom, addVein, makeState, mv, put, testRules } from '../helpers';

const R = testRules();

describe('actor movement', () => {
  it('moves one tile', () => {
    const s = makeState(1);
    put(s, 0, 3, 3);
    const out = step(s, acts([0, mv('E')]), R).state;
    expect(out.actors[0]!.pos).toEqual({ x: 4, y: 3 });
  });

  it('several actors targeting one tile all fail', () => {
    const s = makeState(2);
    put(s, 0, 2, 3);
    put(s, 1, 4, 3);
    const r = step(s, acts([0, mv('E')], [1, mv('W')]), R);
    expect(r.state.actors[0]!.pos).toEqual({ x: 2, y: 3 });
    expect(r.state.actors[1]!.pos).toEqual({ x: 4, y: 3 });
    expect(r.events.filter((e) => e.kind === 'fizzle')).toHaveLength(2);
  });

  it('a move into an actor that does not vacate fails, and the failure propagates along the chain', () => {
    const s = makeState(3);
    put(s, 0, 2, 3);
    put(s, 1, 3, 3);
    put(s, 2, 4, 3); // stays put
    const out = step(s, acts([0, mv('E')], [1, mv('E')], [2, WAIT]), R).state;
    expect(out.actors[0]!.pos).toEqual({ x: 2, y: 3 });
    expect(out.actors[1]!.pos).toEqual({ x: 3, y: 3 });
  });

  it('a move into a vacating actor succeeds (train)', () => {
    const s = makeState(2);
    put(s, 0, 2, 3);
    put(s, 1, 3, 3);
    const out = step(s, acts([0, mv('E')], [1, mv('E')]), R).state;
    expect(out.actors[0]!.pos).toEqual({ x: 3, y: 3 });
    expect(out.actors[1]!.pos).toEqual({ x: 4, y: 3 });
  });

  it('ally swaps and rotations succeed', () => {
    const s = makeState(4);
    put(s, 0, 2, 2); put(s, 1, 3, 2); put(s, 2, 3, 3); put(s, 3, 2, 3);
    // rotation 0→E, 1→S, 2→W, 3→N
    const out = step(s, acts([0, mv('E')], [1, mv('S')], [2, mv('W')], [3, mv('N')]), R).state;
    expect(out.actors.map((a) => a.pos)).toEqual([{ x: 3, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 2 }]);
    const s2 = makeState(2);
    put(s2, 0, 2, 2); put(s2, 1, 3, 2);
    const out2 = step(s2, acts([0, mv('E')], [1, mv('W')]), R).state;
    expect(out2.actors[0]!.pos).toEqual({ x: 3, y: 2 });
    expect(out2.actors[1]!.pos).toEqual({ x: 2, y: 2 });
  });

  it('opposed swaps (different teams) fail', () => {
    const s = makeState(2);
    s.actors[1]!.team = 1;
    put(s, 0, 2, 2); put(s, 1, 3, 2);
    const out = step(s, acts([0, mv('E')], [1, mv('W')]), R).state;
    expect(out.actors[0]!.pos).toEqual({ x: 2, y: 2 });
    expect(out.actors[1]!.pos).toEqual({ x: 3, y: 2 });
  });

  it('walls, veins, the Hearth and round-start Gloomling tiles are not legal targets; actor tiles are', () => {
    const s = makeState(2);
    put(s, 0, 1, 1); // wall N and W
    put(s, 1, 2, 1); // actor E
    expect(computeLegal(s, 0, R).move).toEqual(['E', 'S']);
    addVein(s, 1, 2, 3);
    expect(computeLegal(s, 0, R).move).toEqual(['E']);
    put(s, 1, 5, 5);
    addGloom(s, 2, 1);
    expect(computeLegal(s, 0, R).move).toEqual([]);
    put(s, 0, 6, 5); // Hearth to the S
    expect(computeLegal(s, 0, R).move).not.toContain('S');
  });

  it('an illegal submission is rejected at intake and becomes wait', () => {
    const s = makeState(1);
    put(s, 0, 1, 1);
    const r = step(s, acts([0, mv('N')]), R);
    expect(r.state.actors[0]!.pos).toEqual({ x: 1, y: 1 });
    expect(r.applied[0]!.action).toEqual(WAIT);
    expect(r.events.some((e) => e.kind === 'rejected')).toBe(true);
  });
});
