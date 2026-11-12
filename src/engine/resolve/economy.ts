// Phase 4: economy in sub-order deliver → mine → pickup → drop.
import type { ActorId, EntityId } from '../../protocol/types';
import type { EngineEvent } from '../events';
import { adjacent, samePos } from '../grid';
import type { RuleParams } from '../modes/types';
import type { GameState } from '../state';

export interface EconomyIntents {
  deliver: { actor: ActorId; target: EntityId }[];
  mine: { actor: ActorId; target: EntityId }[];
  pickup: { actor: ActorId; target: EntityId }[];
  drop: { actor: ActorId }[];
}

export function dropEmber(state: GameState, pos: { x: number; y: number }, amount: number): void {
  const pile = state.piles.find((p) => samePos(p.pos, pos));
  if (pile) pile.amount += amount;
  else state.piles.push({ id: state.nextId++, pos: { x: pos.x, y: pos.y }, amount, since: state.round + 1 });
}

export function economyPhase(state: GameState, it: EconomyIntents, params: RuleParams, round: number, events: EngineEvent[]): void {
  const actor = (id: ActorId) => state.actors.find((a) => a.id === id)!;
  const fizzle = (id: ActorId, what: string, reason: string) =>
    events.push({ round, kind: 'fizzle', actor: id, text: `Actor ${id} ${what} fizzled (${reason})` });
  const byId = <T extends { actor: ActorId }>(xs: T[]) => [...xs].sort((a, b) => a.actor - b.actor);

  for (const d of byId(it.deliver)) {
    const a = actor(d.actor);
    if (a.carrying > 0 && d.target === state.hearth.id && state.hearth.fuel > 0 && adjacent(a.pos, state.hearth.pos)) {
      a.carrying = 0;
      state.hearth.fuel = Math.min(params.hearthCap, state.hearth.fuel + params.emberValue);
      events.push({ round, kind: 'deliver', actor: a.id, text: `Actor ${a.id} feeds the Hearth (+${params.emberValue})` });
    } else fizzle(a.id, 'deliver', 'not possible');
  }

  for (const m of byId(it.mine)) {
    const a = actor(m.actor);
    const v = state.veins.find((x) => x.id === m.target);
    if (!v || v.amount <= 0) { fizzle(a.id, 'mine', 'vein exhausted'); continue; }
    if (a.carrying > 0 || !adjacent(a.pos, v.pos)) { fizzle(a.id, 'mine', 'not possible'); continue; }
    v.amount -= 1;
    a.carrying = 1;
    events.push({ round, kind: 'mine', actor: a.id, text: `Actor ${a.id} mines Ember (${v.amount} left)` });
  }

  for (const p of byId(it.pickup)) {
    const a = actor(p.actor);
    if (it.pickup.filter((o) => o.target === p.target).length > 1) { fizzle(a.id, 'pickup', 'contested pile'); continue; }
    const pile = state.piles.find((x) => x.id === p.target);
    if (!pile || pile.amount <= 0 || a.carrying > 0 || !(adjacent(a.pos, pile.pos) || samePos(a.pos, pile.pos))) {
      fizzle(a.id, 'pickup', 'not possible');
      continue;
    }
    pile.amount -= 1;
    a.carrying = 1;
    events.push({ round, kind: 'pickup', actor: a.id, text: `Actor ${a.id} picks up Ember` });
  }
  state.piles = state.piles.filter((p) => p.amount > 0);

  for (const d of byId(it.drop)) {
    const a = actor(d.actor);
    if (a.carrying <= 0) { fizzle(a.id, 'drop', 'not carrying'); continue; }
    a.carrying = 0;
    dropEmber(state, a.pos, 1);
    events.push({ round, kind: 'drop', actor: a.id, text: `Actor ${a.id} drops Ember` });
  }
}
