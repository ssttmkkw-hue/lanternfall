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
