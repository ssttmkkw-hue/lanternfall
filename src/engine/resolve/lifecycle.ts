// Phase 7: snuff actors at 0 HP, then respawn the actors that are due.
import type { ActorId } from '../../protocol/types';
import type { EngineEvent } from '../events';
import { blockedGrid } from '../grid';
import type { ModeRules } from '../modes/types';
import { type GameState, idx, inBounds } from '../state';
import { dropEmber } from './economy';

export function lifecyclePhase(state: GameState, rules: ModeRules, round: number, events: EngineEvent[]): ActorId[] {
  const p = rules.params;
  const snuffedNow: ActorId[] = [];
  for (const a of [...state.actors].sort((x, y) => x.id - y.id)) {
    if (a.status === 'snuffed' || a.hp > 0) continue;
    if (a.carrying > 0) dropEmber(state, a.pos, a.carrying);
    a.carrying = 0;
    a.status = 'snuffed';
    a.respawnIn = p.respawnDelay;
    snuffedNow.push(a.id);
    events.push({ round, kind: 'snuffed', actor: a.id, text: `Actor ${a.id} is Snuffed! Respawn in ${p.respawnDelay}` });
  }
  const blocked = blockedGrid(state);
  for (const a of [...state.actors].sort((x, y) => x.id - y.id)) {
    if (a.status !== 'snuffed' || snuffedNow.includes(a.id)) continue;
    a.respawnIn = Math.max(0, (a.respawnIn ?? 0) - 1);
    if (a.respawnIn > 0) continue;
    const spot = state.respawnList.find(
      (sp) =>
        inBounds(state, sp.x, sp.y) &&
        !blocked[idx(state, sp.x, sp.y)] &&
        !state.actors.some((o) => o.status !== 'snuffed' && o.pos.x === sp.x && o.pos.y === sp.y) &&
        !state.gloom.some((g) => g.pos.x === sp.x && g.pos.y === sp.y),
    );
    if (!spot) continue; // retry next round
    a.pos = { x: spot.x, y: spot.y };
    a.hp = p.actorHp;
    a.fuel = p.actorFuel;
    a.status = 'ok';
    a.carrying = 0;
    a.cooldown = 0;
    a.respawnIn = null;
    events.push({ round, kind: 'respawn', actor: a.id, text: `Actor ${a.id} rekindles at the Hearth` });
  }
  return snuffedNow;
}
