// Phase 3: strikes, applied simultaneously.
import type { ActorId, EntityId } from '../../protocol/types';
import type { EngineEvent } from '../events';
import type { GameState } from '../state';

export interface StrikeIntent { actor: ActorId; target: EntityId }

export function strikePhase(state: GameState, strikes: readonly StrikeIntent[], damage: number, round: number, events: EngineEvent[]): void {
  const dmg = new Array<number>(state.gloom.length).fill(0);
  for (const s of [...strikes].sort((a, b) => a.actor - b.actor)) {
    const gi = state.gloom.findIndex((g) => g.id === s.target);
    if (gi < 0) continue; // cannot happen in M1: targets were adjacent at round start and nothing removes them earlier
    dmg[gi] = dmg[gi]! + damage;
    events.push({ round, kind: 'strike', actor: s.actor, text: `Actor ${s.actor} strikes Gloomling #${s.target}` });
  }
  state.gloom.forEach((g, i) => { g.hp = Math.max(0, g.hp - dmg[i]!); });
  for (const g of state.gloom) {
    if (g.hp === 0) events.push({ round, kind: 'gloom-slain', text: `Gloomling #${g.id} is dispelled` });
  }
  state.gloom = state.gloom.filter((g) => g.hp > 0);
}
