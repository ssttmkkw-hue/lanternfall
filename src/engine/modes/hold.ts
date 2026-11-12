// Hold the Light, M1 slice (DESIGN §2.1.2).
import type { GameState, MatchResult } from '../state';
import type { ModeRules } from './types';

export const HOLD_M1: ModeRules = {
  id: 'hold',
  allowList: ['wait', 'move', 'strike', 'mine', 'pickup', 'drop', 'deliver'],
  roundCap: 160,
  chat: false,
  surges: [
    { round: 40, from: 'W', count: 2 },
    { round: 80, from: 'E', count: 3 },
    { round: 120, from: 'N', count: 4 },
  ],
  params: {
    actorHp: 3,
    actorFuel: 20,
    hearthStart: 30,
    hearthCap: 60,
    hearthRadius: 4,
    emberValue: 5,
    gloomHp: 2,
    gloomActorDamage: 1,
    gloomStructureDamage: 3,
    strikeDamage: 1,
    respawnDelay: 3,
    forecastDirWithin: 8,
    forecastPathLen: 5,
  },
  checkEnd(state: GameState, round: number): MatchResult | null {
    // 1. Loss beats win in the same round.
    if (state.hearth.fuel <= 0) return 'loss';
    // 2. Last surge fully spawned and no Gloomlings remain.
    const last = this.surges.length - 1;
    const lastSpawned = round >= this.surges[last]!.round && !state.spawnQueue.some((q) => q.wave === last);
    if (lastSpawned && state.gloom.length === 0) return 'win';
    // 3. Dawn at the end of the round cap.
    if (round >= this.roundCap) return 'dawn';
    return null;
  },
};
