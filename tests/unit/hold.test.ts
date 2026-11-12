// §2.1.2 Hold the Light: schedule, forecast, spawn queue, end checks, Ember budget
import { describe, expect, it } from 'vitest';
import { HOLD_M1_MAP } from '../../src/content/maps/hold-m1';
import { createInitialState } from '../../src/engine/init';
import { HOLD_M1 } from '../../src/engine/modes/hold';
import { buildObservation, forecastOf } from '../../src/engine/observe';
import { recomputeGloomPaths } from '../../src/engine/resolve/gloom';
import { step } from '../../src/engine/step';
import { type GameState, TERRAIN_FLOOR, idx } from '../../src/engine/state';
import { acts, testRules } from '../helpers';

function holdState(n = 1): GameState {
  return createInitialState({ matchId: 't', seed: 1, map: HOLD_M1_MAP, rules: HOLD_M1, roster: Array.from({ length: n }, (_, i) => ({ id: i, team: 0, role: 'lanterner' as const })) });
}

function bfsDist(s: GameState, from: { x: number; y: number }): number[] {
  const blocked = (i: number) => s.terrain[i] !== TERRAIN_FLOOR || s.veins.some((v) => idx(s, v.pos.x, v.pos.y) === i) || idx(s, s.hearth.pos.x, s.hearth.pos.y) === i;
  const d = new Array(s.w * s.h).fill(-1);
  const st = idx(s, from.x, from.y);
  d[st] = 0;
  const q = [st];
  for (let k = 0; k < q.length; k++) {
    const c = q[k]!;
    const x = c % s.w, y = Math.floor(c / s.w);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const n = idx(s, x + dx, y + dy);
      if (d[n] !== -1 || blocked(n)) continue;
      d[n] = d[c] + 1;
      q.push(n);
    }
  }
  return d;
}

describe('Hold M1 map', () => {
  const s = holdState();
  it('is 16×16 with a single Hearth and 4 spawn points on each of W, E, N', () => {
    expect([s.w, s.h]).toEqual([16, 16]);
    expect(s.hearth.pos).toEqual({ x: 8, y: 8 });
    expect([s.spawns.W.length, s.spawns.E.length, s.spawns.N.length]).toEqual([4, 4, 4]);
  });

  it('Ember budget: 30 total (3× the need of 10); ≤6 within 5 steps of the Hearth, the rest outside Hearth light, all reachable', () => {
    const total = s.veins.reduce((n, v) => n + v.amount, 0);
    expect(total).toBe(30);
    const need = Math.ceil((HOLD_M1.roundCap / 2 - HOLD_M1.params.hearthStart) / HOLD_M1.params.emberValue);
    expect(need).toBe(10);
    expect(total).toBeGreaterThanOrEqual(3 * need);
    for (const v of s.veins) expect(v.amount).toBeGreaterThanOrEqual(3);
    for (const v of s.veins) expect(v.amount).toBeLessThanOrEqual(6);
    // distance from the Hearth = 1 + BFS distance from a Hearth-adjacent tile to a vein-adjacent tile
    const nearHearth = [{ x: 8, y: 7 }, { x: 9, y: 8 }, { x: 8, y: 9 }, { x: 7, y: 8 }].map((p) => bfsDist(s, p));
    let near = 0;
    for (const v of s.veins) {
      const adj = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => idx(s, v.pos.x + dx!, v.pos.y + dy!));
      const steps = Math.min(...nearHearth.flatMap((d) => adj.map((i) => (d[i]! >= 0 ? d[i]! + 2 : Infinity))));
      expect(Number.isFinite(steps)).toBe(true); // reachable
      if (steps <= 5) near += v.amount;
      else expect(s.lit[idx(s, v.pos.x, v.pos.y)]).toBe(0);
    }
    expect(near).toBeLessThanOrEqual(6);
    expect(near).toBeGreaterThan(0);
  });

  it('every spawn point can reach the Hearth', () => {
    const d = bfsDist(s, { x: 8, y: 7 });
    for (const p of [...s.spawns.W, ...s.spawns.E, ...s.spawns.N]) expect(d[idx(s, p.x, p.y)]).toBeGreaterThan(0);
  });

  it('respawn list: Hearth N, E, S, W then the radius-2 ring row-major', () => {
    expect(s.respawnList.slice(0, 4)).toEqual([{ x: 8, y: 7 }, { x: 9, y: 8 }, { x: 8, y: 9 }, { x: 7, y: 8 }]);
    expect(s.respawnList.slice(4, 8)).toEqual([{ x: 8, y: 6 }, { x: 7, y: 7 }, { x: 9, y: 7 }, { x: 6, y: 8 }]);
    expect(s.respawnList).toHaveLength(12);
  });
});

describe('Hold schedule', () => {
  it('Surges spawn at 40 (W, 2), 80 (E, 3), 120 (N, 4) onto spawn points in ascending id', () => {
    let s = holdState();
    const counts: Record<number, number> = {};
    for (let r = 1; r <= 120; r++) {
      s.hearth.fuel = 50; // keep alive
      s.gloom = s.gloom.filter(() => false); // clear previous waves for counting
      s = step(s, acts([0, { t: 'wait' }]), HOLD_M1).state;
      if (s.gloom.length) counts[r] = s.gloom.length;
      if (r === 40) expect(s.gloom.map((g) => g.pos)).toEqual(s.spawns.W.slice(0, 2));
    }
    expect(counts).toEqual({ 40: 2, 80: 3, 120: 4 });
  });

  it('forecast: surgeInRounds always shown, direction once ≤ 8, null after Surge 3', () => {
    const s = holdState();
    s.round = 30; // deciding round 31
    expect(forecastOf(s, HOLD_M1)).toEqual({ surgeInRounds: 9 });
    s.round = 31;
    expect(forecastOf(s, HOLD_M1)).toEqual({ surgeInRounds: 8, from: 'W' });
    s.round = 119;
    expect(forecastOf(s, HOLD_M1)).toEqual({ surgeInRounds: 0, from: 'N' });
    s.round = 120;
    expect(forecastOf(s, HOLD_M1)).toEqual({ surgeInRounds: null });
  });

  it('gloomPaths show exactly each Gloomling\'s next 5 tiles of a known path', () => {
    const s = holdState();
    const path = [2, 3, 4, 5, 6, 7, 8].map((x) => ({ x, y: 6 }));
    s.gloom.push({ id: 99, pos: { x: 1, y: 6 }, hp: 2, path });
    s.round = 41;
    const o = buildObservation(s, 0, HOLD_M1);
    expect(o.forecast.gloomPaths).toEqual([{ id: 99, next: path.slice(0, 5) }]);
  });

  it('gloomPaths from the real planner: the first 5 tiles of the BFS path toward the Hearth', () => {
    const s = holdState();
    s.gloom.push({ id: 99, pos: { ...s.spawns.W[0]! }, hp: 2, path: [] });
    recomputeGloomPaths(s);
    const full = s.gloom[0]!.path;
    expect(full.length).toBeGreaterThan(5);
    // starts adjacent to the spawn point, one tile per step
    expect(Math.abs(full[0]!.x - 1) + Math.abs(full[0]!.y - 6)).toBe(1);
    const next = buildObservation(s, 0, HOLD_M1).forecast.gloomPaths[0]!.next;
    expect(next).toHaveLength(5);
    expect(next).toEqual(full.slice(0, 5));
  });

  it('spawn queue: occupied points are skipped; unplaced creatures retry later, before newer waves', () => {
    const rules = testRules({ surges: [{ round: 1, from: 'W', count: 3 }, { round: 2, from: 'W', count: 1 }] });
    let s = createInitialState({ matchId: 't', seed: 1, map: HOLD_M1_MAP, rules, roster: [{ id: 0, team: 0, role: 'lanterner' }] });
    s.actors[0]!.pos = { ...s.spawns.W[0]! };
    s.gloom.push({ id: s.nextId++, pos: { ...s.spawns.W[1]! }, hp: 2, path: [] }, { id: s.nextId++, pos: { ...s.spawns.W[2]! }, hp: 2, path: [] });
    s = step(s, acts([0, { t: 'wait' }]), rules).state;
    // only W[3] was free: 1 of wave 0 placed, 2 queued
    expect(s.spawnQueue).toEqual([{ wave: 0, from: 'W' }, { wave: 0, from: 'W' }]);
    expect(s.gloom.at(-1)!.pos).toEqual(s.spawns.W[3]);

    // Round 2: the newer wave (1) arrives while one point (W[1]) is free. The queued wave-0 creature
    // retries first and takes it; the newer wave queues behind the remaining wave-0 creature (FIFO).
    s.gloom = s.gloom.filter((g) => !(g.pos.x === s.spawns.W[1]!.x && g.pos.y === s.spawns.W[1]!.y));
    for (const g of s.gloom) g.path = []; // blockers hold their spawn points
    const before = s.nextId;
    s = step(s, acts([0, { t: 'wait' }]), rules).state;
    expect(s.spawnQueue).toEqual([{ wave: 0, from: 'W' }, { wave: 1, from: 'W' }]);
    expect(s.gloom.filter((g) => g.id >= before).map((g) => g.pos)).toEqual([s.spawns.W[1]]);

    // Round 3: everything free. The wave-0 creature is placed before the wave-1 one, in ascending points.
    s.gloom = [];
    s.actors[0]!.pos = { x: 8, y: 7 };
    const mid = s.nextId;
    s = step(s, acts([0, { t: 'wait' }]), rules).state;
    expect(s.spawnQueue).toEqual([]);
    const placed = s.gloom.filter((g) => g.id >= mid).sort((a, b) => a.id - b.id);
    expect(placed.map((g) => g.pos)).toEqual([s.spawns.W[0], s.spawns.W[1]]);
  });

  it('end precedence: loss beats win in the same round; win when Surge 3 fully spawned and cleared; dawn at 160', () => {
    const s = holdState();
    s.hearth.fuel = 0;
    s.gloom = [];
    expect(HOLD_M1.checkEnd(s, 130)).toBe('loss');
    s.hearth.fuel = 10;
    expect(HOLD_M1.checkEnd(s, 130)).toBe('win');
    s.spawnQueue = [{ wave: 2, from: 'N' }];
    expect(HOLD_M1.checkEnd(s, 130)).toBeNull();
    expect(HOLD_M1.checkEnd(s, 160)).toBe('dawn');
    s.spawnQueue = [];
    expect(HOLD_M1.checkEnd(s, 100)).toBeNull();
  });

  it('the Hearth reaching 0 ends the match as a loss', () => {
    const s = holdState();
    s.hearth.fuel = 1;
    s.round = 1; // round 2 burns
    const out = step(s, acts([0, { t: 'wait' }]), HOLD_M1).state;
    expect(out.result).toBe('loss');
  });
});
