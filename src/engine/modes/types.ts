import type { ActionType, Dir, ModeId } from '../../protocol/types';
import type { GameState, MatchResult } from '../state';

export interface SurgeDef { round: number; from: Dir; count: number }

export interface RuleParams {
  actorHp: number;
  actorFuel: number;
  hearthStart: number;
  hearthCap: number;
  hearthRadius: number;
  emberValue: number;
  gloomHp: number;
  gloomActorDamage: number;
  gloomStructureDamage: number;
  strikeDamage: number;
  respawnDelay: number;
  forecastDirWithin: number;
  forecastPathLen: number;
}

/** A mode plugin over the shared engine (DESIGN §3). */
export interface ModeRules {
  readonly id: ModeId;
  readonly allowList: readonly ActionType[];
  readonly roundCap: number;
  readonly chat: boolean;
  readonly surges: readonly SurgeDef[];
  readonly params: RuleParams;
  checkEnd(state: GameState, round: number): MatchResult | null;
}
