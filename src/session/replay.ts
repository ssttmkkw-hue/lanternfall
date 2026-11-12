// Replay recorder (DESIGN §7 "Replay contract"): header + RoundInput[] + per-round state hash.
import { createInitialState } from '../engine/init';
import { hashState } from '../engine/check';
import { hashValue } from '../engine/hash';
import type { ModeRules } from '../engine/modes/types';
import type { GameState, MapDef, RosterEntry } from '../engine/state';
import { step } from '../engine/step';
import type { RoundInput } from '../protocol/types';
import { ENGINE_VERSION, PROTOCOL_VERSION } from '../protocol/version';

export const REPLAY_FORMAT = 'lanternfall-replay' as const;
export const CHECKPOINT_EVERY = 50;
export const MAX_REPLAY_BYTES = 5_000_000;

export interface ReplayHeader {
  format: typeof REPLAY_FORMAT;
  engineVersion: string;
  protocolVersion: number;
  contentHash: string;
  seed: number;
  mode: string;
  mapId: string;
  matchId: string;
  roster: (RosterEntry & { controller: string })[];
  initialHash: string;
}

export interface ReplayRound { input: RoundInput; hash: string }

export interface Replay {
  header: ReplayHeader;
  rounds: ReplayRound[];
  checkpoints: { round: number; state: GameState }[];
  result: string | null;
}

export function contentHash(map: MapDef, rules: ModeRules): string {
  return hashValue({ map: { id: map.id, rows: map.rows }, mode: rules.id, allow: rules.allowList, cap: rules.roundCap, surges: rules.surges, params: rules.params });
}

export class ReplayRecorder {
  private readonly replay: Replay;
  constructor(initial: GameState, map: MapDef, rules: ModeRules, controllers: readonly string[]) {
    this.replay = {
      header: {
        format: REPLAY_FORMAT,
        engineVersion: ENGINE_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        contentHash: contentHash(map, rules),
        seed: initial.seed,
        mode: rules.id,
        mapId: map.id,
        matchId: initial.matchId,
        roster: initial.actors.map((a) => ({ id: a.id, team: a.team, role: a.role, controller: controllers[a.id] ?? 'unknown' })),
        initialHash: hashState(initial),
      },
      rounds: [],
      checkpoints: [],
      result: null,
    };
  }

  record(input: RoundInput, after: GameState): void {
    this.replay.rounds.push({ input: JSON.parse(JSON.stringify(input)) as RoundInput, hash: hashState(after) });
    if (after.round % CHECKPOINT_EVERY === 0) this.replay.checkpoints.push({ round: after.round, state: JSON.parse(JSON.stringify(after)) as GameState });
    this.replay.result = after.result;
  }

  get rounds(): number { return this.replay.rounds.length; }
  toJSON(): Replay { return JSON.parse(JSON.stringify(this.replay)) as Replay; }
  serialize(): string { return JSON.stringify(this.replay); }
}

export interface VerifyResult {
  ok: boolean;
  rounds: number;
  finalHash: string | null;
  result: string | null;
  mismatchAt?: number;
  error?: string;
}

/** Re-runs a replay's accepted actions and checks every per-round hash. */
export function verifyReplay(replay: Replay, maps: Readonly<Record<string, MapDef>>, rules: ModeRules): VerifyResult {
  const fail = (error: string, extra: Partial<VerifyResult> = {}): VerifyResult => ({ ok: false, rounds: 0, finalHash: null, result: null, error, ...extra });
  const h = replay.header;
  if (h.format !== REPLAY_FORMAT) return fail('not a Lanternfall replay');
  if (h.protocolVersion !== PROTOCOL_VERSION) return fail(`protocol version mismatch: replay ${h.protocolVersion}, engine ${PROTOCOL_VERSION}`);
  if (h.engineVersion !== ENGINE_VERSION) return fail(`engine version mismatch: replay ${h.engineVersion}, engine ${ENGINE_VERSION}`);
  const map = maps[h.mapId];
  if (!map) return fail(`unknown map ${h.mapId}`);
  if (contentHash(map, rules) !== h.contentHash) return fail('content hash mismatch (map or rules changed)');
  let state = createInitialState({ matchId: h.matchId, seed: h.seed, map, roster: h.roster.map(({ id, team, role }) => ({ id, team, role })), rules });
  if (hashState(state) !== h.initialHash) return fail('initial state hash mismatch', { mismatchAt: 0 });
  for (const r of replay.rounds) {
    if (r.input.round !== state.round + 1) return fail(`round sequence broken at ${r.input.round}`, { rounds: state.round });
    state = step(state, r.input.actions, rules).state;
    const hs = hashState(state);
    if (hs !== r.hash) return fail(`hash mismatch at round ${state.round}`, { mismatchAt: state.round, rounds: state.round, finalHash: hs });
  }
  return { ok: true, rounds: state.round, finalHash: hashState(state), result: state.result };
}

/** Size-capped, minimally schema-checked import. */
export function parseReplay(text: string): Replay {
  if (text.length > MAX_REPLAY_BYTES) throw new Error('replay too large');
  const r = JSON.parse(text) as Partial<Replay>;
  if (!r || typeof r !== 'object' || !r.header || !Array.isArray(r.rounds)) throw new Error('malformed replay');
  if (r.header.format !== REPLAY_FORMAT) throw new Error('not a Lanternfall replay');
  return { header: r.header, rounds: r.rounds, checkpoints: Array.isArray(r.checkpoints) ? r.checkpoints : [], result: r.result ?? null };
}
