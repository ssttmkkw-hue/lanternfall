// §2.1.3 Snuff (phase 7, round R) and Respawn (phase 7, round R+3)
import { describe, expect, it } from 'vitest';
import { computeLegal } from '../../src/engine/legal';
import { buildObservation } from '../../src/engine/observe';
import { HOLD_M1 } from '../../src/engine/modes/hold';
import { step } from '../../src/engine/step';
import { WAIT, acts, addGloom, makeState, put, testRules } from '../helpers';

const R = testRules();

describe('snuff and respawn', () => {
  it('0 HP → Snuffed in the same round: Ember drops (merging), leaves the map, respawnIn = 3', () => {
    const s = makeState(2);
    put(s, 0, 2, 2); put(s, 1, 9, 9);
    s.actors[0]!.hp = 1;
    s.actors[0]!.carrying = 1;
    s.piles.push({ id: s.nextId++, pos: { x: 2, y: 2 }, amount: 1, since: 0 });
    addGloom(s, 2, 1);
    const out = step(s, acts([0, WAIT], [1, WAIT]), R).state;
    const a = out.actors[0]!;
    expect(a.status).toBe('snuffed');
    expect(a.respawnIn).toBe(3);
    expect(a.carrying).toBe(0);
    expect(out.piles[0]!.amount).toBe(2);
    expect(computeLegal(out, 0, R).move).toEqual([]);
    const o = buildObservation(out, 1, R);
    expect(o.actors.map((x) => x.id)).toEqual([1]);
    expect(buildObservation(out, 0, R).self.respawnIn).toBe(3);
  });

  it('respawns in phase 7 of round R+3 on the first free respawn tile, restored, acting from R+4', () => {
    const s = makeState(2);
    put(s, 0, 2, 2); put(s, 1, 6, 5); // actor 1 occupies the Hearth's N neighbour
    s.actors[0]!.hp = 1;
    s.actors[0]!.fuel = 3;
    const g = addGloom(s, 2, 1);
    let out = step(s, acts([0, WAIT], [1, WAIT]), R).state; // R = 1
    out.gloom = out.gloom.filter((x) => x.id !== g);
    out = step(out, acts([1, WAIT]), R).state; // 2
    expect(out.actors[0]!.respawnIn).toBe(2);
    out = step(out, acts([1, WAIT]), R).state; // 3
    expect(out.actors[0]!.status).toBe('snuffed');
    out = step(out, acts([1, WAIT]), R).state; // 4 = R+3
    const a = out.actors[0]!;
    expect(a.status).toBe('ok');
    expect(a.pos).toEqual({ x: 7, y: 6 }); // N is taken, so E
    expect([a.hp, a.fuel, a.carrying, a.cooldown, a.respawnIn]).toEqual([3, 20, 0, 0, null]);
    expect(computeLegal(out, 0, R).move.length).toBeGreaterThan(0); // acts in round 5
  });

  it('retries next round when no respawn tile is free', () => {
    const s = makeState(1);
    s.actors[0]!.status = 'snuffed';
    s.actors[0]!.hp = 0;
    s.actors[0]!.respawnIn = 1;
    for (const p of s.respawnList) s.gloom.push({ id: s.nextId++, pos: { ...p }, hp: 2, path: [] });
    let out = step(s, acts(), R).state;
    expect(out.actors[0]!.status).toBe('snuffed');
    expect(out.actors[0]!.respawnIn).toBe(0);
    out.gloom = [];
    out = step(out, acts(), R).state;
    expect(out.actors[0]!.status).toBe('ok');
  });

  it('every actor being Snuffed at once is not a loss', () => {
    const s = makeState(1);
    s.actors[0]!.status = 'snuffed';
    s.actors[0]!.respawnIn = 3;
    const out = step(s, acts(), HOLD_M1).state;
    expect(out.result).toBeNull();
  });
});
