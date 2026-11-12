// buildObservation(state, actorId): per-actor, JSON-only, fog-respecting (M1: fog off).
import type { ActorId, Dir, Observation, ObservedEvent, Order, Ping } from '../protocol/types';
import { PROTOCOL_VERSION } from '../protocol/version';
import type { EngineEvent } from './events';
import { computeLegal } from './legal';
import type { ModeRules } from './modes/types';
import { type GameState, TERRAIN_WALL, idx } from './state';

/** Session data the coordinator owns (never part of GameState or its hash). */
export interface SessionView {
  events?: readonly EngineEvent[];
  orders?: readonly (Order | null)[];
  labels?: readonly (string | undefined)[];
  pings?: readonly { from: ActorId; ping: Ping; round: number }[];
}

/** Recursively freezes a plain-JSON value in place and returns it. */
export function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

/** Detached deep copy of plain JSON session data (orders, pings), so controllers never hold live references. */
const detach = <T>(v: T): T => (v === null || v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export function terrainRows(state: GameState): string[] {
  const rows: string[] = [];
  for (let y = 0; y < state.h; y++) {
    let r = '';
    for (let x = 0; x < state.w; x++) r += state.terrain[idx(state, x, y)] === TERRAIN_WALL ? '#' : '.';
    rows.push(r);
  }
  const set = (x: number, y: number, c: string) => {
    rows[y] = rows[y]!.slice(0, x) + c + rows[y]!.slice(x + 1);
  };
  for (const v of state.veins) set(v.pos.x, v.pos.y, 'V');
  set(state.hearth.pos.x, state.hearth.pos.y, 'H');
  return rows;
}

export function forecastOf(state: GameState, rules: ModeRules): { surgeInRounds: number | null; from?: Dir } {
  const round = state.round + 1;
  const next = rules.surges.find((s) => s.round >= round);
  if (!next) return { surgeInRounds: null };
  const inRounds = next.round - round;
  return inRounds <= rules.params.forecastDirWithin ? { surgeInRounds: inRounds, from: next.from } : { surgeInRounds: inRounds };
}

/** Builds a detached, deeply frozen observation: mutating it can never reach session or engine data. */
export function buildObservation(state: GameState, actorId: ActorId, rules: ModeRules, session: SessionView = {}): Observation {
  return deepFreeze(buildObservationRaw(state, actorId, rules, session));
}

function buildObservationRaw(state: GameState, actorId: ActorId, rules: ModeRules, session: SessionView): Observation {
  const me = state.actors.find((a) => a.id === actorId);
  if (!me) throw new Error(`buildObservation: unknown actor ${actorId}`);
  const round = state.round + 1;
  const rowsOf = (grid: readonly number[]) => {
    const out: string[] = [];
    for (let y = 0; y < state.h; y++) out.push(grid.slice(y * state.w, (y + 1) * state.w).map((v) => (v ? '1' : '0')).join(''));
    return out;
  };
  const allVisible: string[] = [];
  for (let y = 0; y < state.h; y++) allVisible.push('1'.repeat(state.w));
  const orders: Record<ActorId, Order | null> = {};
  for (const a of state.actors) if (a.team === me.team) orders[a.id] = detach(session.orders?.[a.id] ?? null);
  const events: ObservedEvent[] = (session.events ?? []).map((e) => ({ round: e.round, kind: e.kind, text: e.text }));

  return {
    protocolVersion: PROTOCOL_VERSION,
    matchId: state.matchId,
    round,
    mode: {
      id: rules.id,
      phase: state.result ? 'over' : 'play',
      roundsLeft: Math.max(0, rules.roundCap - state.round),
      scores: {},
    },
    self: {
      id: me.id,
      team: me.team,
      role: me.role,
      pos: { x: me.pos.x, y: me.pos.y },
      hp: me.hp,
      fuel: me.fuel,
      carrying: me.carrying > 0 ? 'ember' : null,
      cooldown: me.cooldown,
      status: me.status,
      respawnIn: me.status === 'snuffed' ? me.respawnIn : null,
      order: detach(session.orders?.[me.id] ?? null),
    },
    map: { w: state.w, h: state.h, terrain: terrainRows(state), lit: rowsOf(state.lit), visible: allVisible },
    actors: state.actors
      .filter((a) => a.status !== 'snuffed')
      .map((a) => {
        const label = session.labels?.[a.id];
        return {
          id: a.id, team: a.team, role: a.role, pos: { x: a.pos.x, y: a.pos.y }, hp: a.hp,
          carrying: a.carrying > 0 ? ('ember' as const) : null,
          ...(label ? { label } : {}),
        };
      }),
    entities: [
      { id: state.hearth.id, kind: 'hearth', pos: { ...state.hearth.pos }, fuel: state.hearth.fuel },
      ...state.veins.map((v) => ({ id: v.id, kind: 'vein', pos: { ...v.pos }, amount: v.amount })),
      ...state.piles.map((p) => ({ id: p.id, kind: 'ember', pos: { ...p.pos }, amount: p.amount })),
      ...state.gloom.map((g) => ({ id: g.id, kind: 'gloomling', pos: { ...g.pos }, hp: g.hp })),
    ].sort((a, b) => a.id - b.id),
    forecast: {
      ...forecastOf(state, rules),
      gloomPaths: state.gloom.map((g) => ({ id: g.id, next: g.path.slice(0, rules.params.forecastPathLen).map((p) => ({ ...p })) })),
    },
    team: { orders },
    pings: (session.pings ?? []).filter((p) => round - p.round <= 5).map((p) => ({ from: p.from, ping: detach(p.ping), round: p.round })),
    events,
    chat: [],
    legal: detach(computeLegal(state, actorId, rules)),
  };
}
