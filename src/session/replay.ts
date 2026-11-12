// Replay recorder (DESIGN §7 "Replay contract"): header + RoundInput[] + per-round state hash.
import { createInitialState } from '../engine/init';
import { hashState } from '../engine/check';
import { hashValue } from '../engine/hash';
import type { ModeRules } from '../engine/modes/types';
import type { GameState, MapDef, RosterEntry } from '../engine/state';
import { step } from '../engine/step';
import type { ActionType, RoundInput } from '../protocol/types';
import { parseAction, parsePing, type ValidateContext } from '../protocol/validate';
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

const MAX_ROUNDS = 100_000;
const MAX_ACTORS = 8;
const MAX_STR = 256;
const ROLES = ['lanterner', 'warden', 'scout', 'smith', 'medic'];
const RESULTS = ['win', 'loss', 'dawn'];
const SOURCES = ['controller', 'order', 'fallback', 'idle'];
const ALL_ACTIONS: readonly ActionType[] = ['wait', 'move', 'strike', 'mine', 'pickup', 'drop', 'deliver', 'build', 'repair', 'ability'];
/** Shape context for replay actions; map bounds are generous here and the mode allow-list is applied in verifyReplay. */
const SHAPE_CTX: ValidateContext = {
  requestId: '', allowList: ALL_ACTIONS, chat: false, w: 1024, h: 1024,
  legal: { move: [], strike: [], mine: [], pickup: [], deliver: [], repair: [], build: [], ability: false, drop: false },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_STR;

/** Full schema check of an untrusted replay (header, roster, rounds, actions, checkpoints).
 *  Returns null when well-formed, else a reason. Never throws. */
export function replaySchemaError(r: unknown): string | null {
  if (!isObj(r)) return 'replay is not an object';
  const h = r.header;
  if (!isObj(h)) return 'header missing';
  if (h.format !== REPLAY_FORMAT) return 'not a Lanternfall replay';
  for (const k of ['engineVersion', 'contentHash', 'mode', 'mapId', 'matchId', 'initialHash'] as const) {
    if (!isStr(h[k])) return `header.${k} must be a string`;
  }
  if (!isInt(h.protocolVersion, 0, 1_000_000)) return 'header.protocolVersion must be an integer';
  if (!isInt(h.seed, 0, 0xffffffff)) return 'header.seed must be a uint32';
  if (!Array.isArray(h.roster) || h.roster.length < 1 || h.roster.length > MAX_ACTORS) return `header.roster must hold 1..${MAX_ACTORS} entries`;
  for (let i = 0; i < h.roster.length; i++) {
    const e: unknown = h.roster[i];
    if (!isObj(e) || e.id !== i || !isInt(e.team, 0, 7) || typeof e.role !== 'string' || !ROLES.includes(e.role) || !isStr(e.controller)) {
      return `header.roster[${i}] malformed`;
    }
  }
  const nActors = h.roster.length;
  if (!Array.isArray(r.rounds) || r.rounds.length > MAX_ROUNDS) return 'rounds must be an array';
  for (let i = 0; i < r.rounds.length; i++) {
    const rec: unknown = r.rounds[i];
    if (!isObj(rec) || !isObj(rec.input) || !isStr(rec.hash)) return `rounds[${i}] malformed`;
    const inp = rec.input;
    if (!isInt(inp.round, 1, MAX_ROUNDS)) return `rounds[${i}].input.round must be a positive integer`;
    if (!Array.isArray(inp.actions) || inp.actions.length > nActors) return `rounds[${i}].input.actions malformed`;
    const seen = new Set<number>();
    for (let j = 0; j < inp.actions.length; j++) {
      const a: unknown = inp.actions[j];
      const where = `rounds[${i}].input.actions[${j}]`;
      if (!isObj(a) || !isInt(a.actor, 0, nActors - 1) || seen.has(a.actor)) return `${where}: bad or duplicate actor`;
      seen.add(a.actor);
      if (typeof a.source !== 'string' || !SOURCES.includes(a.source)) return `${where}: bad source`;
      if (Object.keys(a).some((k) => !['actor', 'action', 'ping', 'source'].includes(k))) return `${where}: unknown keys`;
      const act = parseAction(a.action, SHAPE_CTX);
      if (typeof act === 'string') return `${where}: ${act}`;
      if (a.ping !== undefined && typeof parsePing(a.ping, SHAPE_CTX) === 'string') return `${where}: bad ping`;
    }
  }
  if (r.checkpoints !== undefined) {
    if (!Array.isArray(r.checkpoints)) return 'checkpoints must be an array';
    for (let i = 0; i < r.checkpoints.length; i++) {
      const c: unknown = r.checkpoints[i];
      if (!isObj(c) || !isInt(c.round, 1, r.rounds.length) || !isObj(c.state)) return `checkpoints[${i}] malformed`;
    }
  }
  if (r.result !== undefined && r.result !== null && (typeof r.result !== 'string' || !RESULTS.includes(r.result))) return 'result must be null or a match result';
  return null;
}

/** Re-runs a replay's accepted actions and checks every per-round hash, the checkpoints and the declared result. */
export function verifyReplay(replay: Replay, maps: Readonly<Record<string, MapDef>>, rules: ModeRules): VerifyResult {
  const fail = (error: string, extra: Partial<VerifyResult> = {}): VerifyResult => ({ ok: false, rounds: 0, finalHash: null, result: null, error, ...extra });
  const schema = replaySchemaError(replay);
  if (schema) return fail(`malformed replay: ${schema}`);
  const h = replay.header;
  if (h.format !== REPLAY_FORMAT) return fail('not a Lanternfall replay');
  if (h.protocolVersion !== PROTOCOL_VERSION) return fail(`protocol version mismatch: replay ${h.protocolVersion}, engine ${PROTOCOL_VERSION}`);
  if (h.engineVersion !== ENGINE_VERSION) return fail(`engine version mismatch: replay ${h.engineVersion}, engine ${ENGINE_VERSION}`);
  const map = maps[h.mapId];
  if (!map) return fail(`unknown map ${h.mapId}`);
  if (contentHash(map, rules) !== h.contentHash) return fail('content hash mismatch (map or rules changed)');
  if (h.mode !== rules.id) return fail(`mode mismatch: replay ${h.mode}, rules ${rules.id}`);
  let state = createInitialState({ matchId: h.matchId, seed: h.seed, map, roster: h.roster.map(({ id, team, role }) => ({ id, team, role })), rules });
  if (hashState(state) !== h.initialHash) return fail('initial state hash mismatch', { mismatchAt: 0 });
  for (const r of replay.rounds) {
    if (state.result !== null) return fail(`round ${r.input.round} recorded after the match ended (${state.result})`, { rounds: state.round });
    if (r.input.round !== state.round + 1) return fail(`round sequence broken at ${r.input.round}`, { rounds: state.round });
    const bad = r.input.actions.find((a) => !rules.allowList.includes(a.action.t));
    if (bad) return fail(`round ${r.input.round}: action '${bad.action.t}' not allowed in mode ${rules.id}`, { rounds: state.round });
    try {
      state = step(state, r.input.actions, rules).state;
    } catch (err) {
      return fail(`invalid step input at round ${r.input.round}: ${err instanceof Error ? err.message : String(err)}`, { rounds: state.round });
    }
    const hs = hashState(state);
    if (hs !== r.hash) return fail(`hash mismatch at round ${state.round}`, { mismatchAt: state.round, rounds: state.round, finalHash: hs });
  }
  for (const c of replay.checkpoints ?? []) {
    let hc: string;
    try { hc = hashState(c.state); } catch { hc = ''; }
    if (hc !== replay.rounds[c.round - 1]!.hash) return fail(`checkpoint at round ${c.round} does not match its round hash`, { mismatchAt: c.round, rounds: state.round });
  }
  const declared = replay.result ?? null;
  if (declared !== state.result) {
    return fail(`declared result ${String(declared)} disagrees with replayed result ${String(state.result)}`, { rounds: state.round, finalHash: hashState(state) });
  }
  return { ok: true, rounds: state.round, finalHash: hashState(state), result: state.result };
}

/** Size-capped, fully schema-validated import (DESIGN §7). Throws a clear error on any malformed field. */
export function parseReplay(text: string): Replay {
  if (text.length > MAX_REPLAY_BYTES) throw new Error('replay too large');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('malformed replay: not JSON'); }
  const err = replaySchemaError(raw);
  if (err) throw new Error(err === 'not a Lanternfall replay' ? err : `malformed replay: ${err}`);
  const r = raw as Partial<Replay> & Pick<Replay, 'header' | 'rounds'>;
  return { header: r.header, rounds: r.rounds, checkpoints: r.checkpoints ?? [], result: r.result ?? null };
}
