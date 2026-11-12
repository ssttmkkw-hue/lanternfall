// GameState: plain JSON, integer fields only (plus a few enum strings and nulls).
import type { ActorId, Dir, EntityId, ModeId, Pos, RoleId, TeamId } from '../protocol/types';
import type { RngState } from './rng';

export const TERRAIN_FLOOR = 0;
export const TERRAIN_WALL = 1;

export type ActorStatus = 'ok' | 'dimmed' | 'snuffed';

export interface ActorState {
  id: ActorId;
  team: TeamId;
  role: RoleId;
  pos: { x: number; y: number }; // last position while snuffed (off-map)
  hp: number;
  fuel: number;
  carrying: number; // 0 or 1 Ember
  cooldown: number;
  status: ActorStatus;
  respawnIn: number | null;
}

export interface HearthState { id: EntityId; pos: { x: number; y: number }; fuel: number }
export interface VeinState { id: EntityId; pos: { x: number; y: number }; amount: number }
export interface PileState { id: EntityId; pos: { x: number; y: number }; amount: number; since: number }
export interface GloomState {
  id: EntityId;
  pos: { x: number; y: number };
  hp: number;
  path: { x: number; y: number }[];
}
export interface QueuedSpawn { wave: number; from: Dir }

export type MatchResult = 'win' | 'dawn' | 'loss';

export interface GameState {
  matchId: string;
  mode: ModeId;
  mapId: string;
  seed: number;
  /** Last fully resolved round. The round being decided is round + 1. */
  round: number;
  nextId: EntityId;
  w: number;
  h: number;
  terrain: number[];
  lit: number[];
  spawns: { W: Pos[]; E: Pos[]; N: Pos[]; S: Pos[] };
  respawnList: Pos[];
  actors: ActorState[];
  hearth: HearthState;
  veins: VeinState[];
  piles: PileState[];
  gloom: GloomState[];
  spawnQueue: QueuedSpawn[];
  result: MatchResult | null;
  rng: RngState;
}

export interface MapDef {
  id: string;
  name: string;
  /** Legend: '#' wall, '.' floor, 'H' hearth, '3'-'9' vein with that amount,
   *  'w'/'e'/'n'/'s' floor with a spawn point for that edge. */
  rows: readonly string[];
}

export interface RosterEntry { id: ActorId; team: TeamId; role: RoleId }

export function idx(state: { w: number }, x: number, y: number): number {
  return y * state.w + x;
}

export function inBounds(state: { w: number; h: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.w && y < state.h;
}

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
