// §7 determinism: double runs, serialization round-trip, integer walk, golden replay.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAPS } from '../../src/content/maps';
import { HelperBot } from '../../src/controllers/bots/helper';
import { hashState, walkIntegers } from '../../src/engine/check';
import { canonicalize, fnv1a32, hashValue } from '../../src/engine/hash';
import { createInitialState } from '../../src/engine/init';
import { HOLD_M1 } from '../../src/engine/modes/hold';
import { hash32, makeRng } from '../../src/engine/rng';
import type { GameState } from '../../src/engine/state';
import { step } from '../../src/engine/step';
import { createMatch } from '../../src/session/match';
import { type Replay, parseReplay, verifyReplay } from '../../src/session/replay';

async function play(seed: number) {
  const { coordinator, recorder } = createMatch({ seed, controllers: [new HelperBot(), new HelperBot()] });
  const hashes: string[] = [];
  while (!coordinator.over) hashes.push((await coordinator.playRound()).hash);
  return { hashes, replay: recorder.toJSON(), state: coordinator.state };
}

describe('primitives', () => {
  it('canonical serialization sorts keys and FNV-1a is stable', () => {
    expect(canonicalize({ b: 1, a: [2, { d: null, c: 'x' }] })).toBe('{"a":[2,{"c":"x","d":null}],"b":1}');
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(() => canonicalize({ x: NaN })).toThrow();
  });

  it('sfc32 and hash32 are deterministic and seed-sensitive', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(makeRng(43)()).not.toBe(xs[0]);
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(1, 3, 2));
  });
});

describe('determinism', () => {
  it('the same seed yields identical per-round hashes', async () => {
    const a = await play(11);
    const b = await play(11);
    expect(a.hashes).toEqual(b.hashes);
    expect(a.hashes.length).toBeGreaterThan(40);
  });

  it('state is integers only every round', async () => {
    const { coordinator } = createMatch({ seed: 5, controllers: [new HelperBot(), new HelperBot()] });
    while (!coordinator.over) {
      const o = await coordinator.playRound();
      expect(walkIntegers(o.state)).toEqual([]);
    }
  });

  it('a JSON round-trip of state mid-match does not change the outcome', async () => {
    const { replay } = await play(9);
    const rounds = replay.rounds;
    // Re-run from the replay, round-tripping state through JSON at round 60.
    let s: GameState = createInitialState({ matchId: replay.header.matchId, seed: 9, map: MAPS[replay.header.mapId]!, rules: HOLD_M1, roster: replay.header.roster });
    for (const r of rounds) {
      if (s.round === 60) s = JSON.parse(JSON.stringify(s)) as GameState;
      s = step(s, r.input.actions, HOLD_M1).state;
    }
    expect(hashState(s)).toBe(rounds.at(-1)!.hash);
  });

  it('a recorded replay verifies, and a tampered one reports the first mismatching round', async () => {
    const { replay } = await play(4);
    const parsed = parseReplay(JSON.stringify(replay));
    expect(verifyReplay(parsed, MAPS, HOLD_M1)).toMatchObject({ ok: true, rounds: replay.rounds.length });
    const bad: Replay = JSON.parse(JSON.stringify(replay));
    bad.rounds[10]!.input = { round: 11, actions: [] };
    const v = verifyReplay(bad, MAPS, HOLD_M1);
    expect(v.ok).toBe(false);
    expect(v.mismatchAt).toBeGreaterThanOrEqual(11);
    const wrongVersion: Replay = JSON.parse(JSON.stringify(replay));
    wrongVersion.header.protocolVersion = 999;
    expect(verifyReplay(wrongVersion, MAPS, HOLD_M1).error).toMatch(/protocol version/);
    expect(() => parseReplay('x'.repeat(6_000_000))).toThrow(/too large/);
  });

  it('golden replay (tests/golden/hold-m1-seed1.json) reproduces every per-round hash', () => {
    const golden = parseReplay(readFileSync(new URL('../golden/hold-m1-seed1.json', import.meta.url), 'utf8'));
    const v = verifyReplay(golden, MAPS, HOLD_M1);
    expect(v.error).toBeUndefined();
    expect(v.ok).toBe(true);
    expect(v.rounds).toBe(golden.rounds.length);
  });

  it('the golden replay is what the current bots produce (unreviewed behaviour change guard)', async () => {
    const golden = parseReplay(readFileSync(new URL('../golden/hold-m1-seed1.json', import.meta.url), 'utf8'));
    const { coordinator, recorder } = createMatch({ seed: 1, controllers: [new HelperBot(), new HelperBot()], matchId: 'golden-1' });
    await coordinator.runToEnd();
    expect(recorder.toJSON().rounds.map((r) => r.hash)).toEqual(golden.rounds.map((r) => r.hash));
  });

  it('headless-style batch: every seeded bot-only match ends by the 160-round cap with valid state', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { state, hashes } = await play(seed);
      expect(state.result).not.toBeNull();
      expect(state.round).toBeLessThanOrEqual(HOLD_M1.roundCap);
      expect(hashes).toHaveLength(state.round);
      expect(walkIntegers(state)).toEqual([]);
    }
  });
});

describe('review M1 #3: replay import is schema-validated; derived state must match', () => {
  let base: Replay;
  const fresh = async (): Promise<Replay> => {
    if (!base) base = (await play(4)).replay;
    return JSON.parse(JSON.stringify(base)) as Replay;
  };
  const mutate = async (f: (r: any) => void): Promise<string> => {
    const r = await fresh();
    f(r);
    return JSON.stringify(r);
  };

  it('malformed nested fields are rejected at import with a clear error', async () => {
    const cases: [string, (r: any) => void][] = [
      ['missing roster', (r) => { delete r.header.roster; }],
      ['empty roster', (r) => { r.header.roster = []; }],
      ['roster entry with a bad role', (r) => { r.header.roster[0].role = 'wizard'; }],
      ['roster ids out of order', (r) => { r.header.roster[0].id = 5; }],
      ['missing header', (r) => { delete r.header; }],
      ['non-integer seed', (r) => { r.header.seed = 1.5; }],
      ['negative seed', (r) => { r.header.seed = -1; }],
      ['string protocolVersion', (r) => { r.header.protocolVersion = '1'; }],
      ['null round record', (r) => { r.rounds[3] = null; }],
      ['null input', (r) => { r.rounds[3].input = null; }],
      ['null actions', (r) => { r.rounds[3].input.actions = null; }],
      ['null action entry', (r) => { r.rounds[3].input.actions[0] = null; }],
      ['unknown action type', (r) => { r.rounds[3].input.actions[0].action = { t: 'teleport' }; }],
      ['extra action field', (r) => { r.rounds[3].input.actions[0].action = { t: 'wait', x: 1 }; }],
      ['actor out of roster', (r) => { r.rounds[3].input.actions[0].actor = 7; }],
      ['duplicate actor', (r) => { r.rounds[3].input.actions[1] = r.rounds[3].input.actions[0]; }],
      ['bad source', (r) => { r.rounds[3].input.actions[0].source = 'cheat'; }],
      ['fractional round', (r) => { r.rounds[3].input.round = 3.5; }],
      ['missing hash', (r) => { delete r.rounds[3].hash; }],
      ['checkpoint without state', (r) => { r.checkpoints[0].state = null; }],
      ['checkpoint beyond the rounds', (r) => { r.checkpoints[0].round = 99_999; }],
      ['unknown result', (r) => { r.result = 'victory'; }],
    ];
    for (const [name, f] of cases) {
      const text = await mutate(f);
      expect(() => parseReplay(text), name).toThrow(/malformed replay/);
    }
    expect(() => parseReplay('{not json')).toThrow(/malformed replay: not JSON/);
    expect(() => parseReplay('null')).toThrow(/malformed replay/);
  });

  it('verifyReplay never throws on malformed objects that bypass parseReplay', async () => {
    const r = await fresh();
    delete (r.header as any).roster;
    expect(verifyReplay(r, MAPS, HOLD_M1)).toMatchObject({ ok: false, error: expect.stringMatching(/malformed replay/) });
    const r2 = await fresh();
    (r2.rounds as any)[5] = null;
    expect(verifyReplay(r2, MAPS, HOLD_M1)).toMatchObject({ ok: false, error: expect.stringMatching(/malformed replay/) });
  });

  it('actions outside the mode allow-list are rejected before simulation', async () => {
    const r = await fresh();
    (r.rounds[3]!.input.actions as any)[0].action = { t: 'build', kind: 'beacon', at: { x: 2, y: 2 } };
    const v = verifyReplay(parseReplay(JSON.stringify(r)), MAPS, HOLD_M1);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/not allowed/);
  });

  it('a declared result that disagrees with the replayed state is rejected', async () => {
    const r = await fresh();
    expect(r.result).not.toBeNull();
    r.result = r.result === 'loss' ? 'win' : 'loss';
    expect(verifyReplay(parseReplay(JSON.stringify(r)), MAPS, HOLD_M1).error).toMatch(/declared result/);
    const truncated = await fresh(); // claims the final result but stops early
    truncated.rounds.pop();
    expect(verifyReplay(parseReplay(JSON.stringify(truncated)), MAPS, HOLD_M1).error).toMatch(/declared result .* replayed result null/);
    const nulled = await fresh();
    nulled.result = null;
    expect(verifyReplay(parseReplay(JSON.stringify(nulled)), MAPS, HOLD_M1).ok).toBe(false);
  });

  it('rounds recorded after the match ended, and tampered checkpoints, are rejected', async () => {
    const r = await fresh();
    const last = r.rounds.at(-1)!;
    r.rounds.push({ input: { round: last.input.round + 1, actions: [] }, hash: last.hash });
    expect(verifyReplay(parseReplay(JSON.stringify(r)), MAPS, HOLD_M1).error).toMatch(/after the match ended/);
    const cp = await fresh();
    expect(cp.checkpoints.length).toBeGreaterThan(0);
    cp.checkpoints[0]!.state.hearth.fuel += 1;
    expect(verifyReplay(parseReplay(JSON.stringify(cp)), MAPS, HOLD_M1).error).toMatch(/checkpoint/);
  });
});
