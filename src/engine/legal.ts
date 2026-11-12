// Round-start legal action sets (DESIGN §7 "Legality vs resolution").
import type { Action, ActorId, Dir, EntityId, LegalSet } from '../protocol/types';
import { actionInLegal } from '../protocol/validate';
import { DIRS, DIR_VEC, adjacent, blockedGrid } from './grid';
import type { ModeRules } from './modes/types';
import { type GameState, idx, inBounds } from './state';

export const EMPTY_LEGAL: LegalSet = {
  move: [], strike: [], mine: [], pickup: [], deliver: [], repair: [], build: [], ability: false, drop: false,
};

/** Legal set for `actorId` when deciding round `state.round + 1`. */
export function computeLegal(state: GameState, actorId: ActorId, rules: ModeRules): LegalSet {
  const a = state.actors.find((x) => x.id === actorId);
  if (!a || a.status === 'snuffed' || state.result !== null) return EMPTY_LEGAL;
  const round = state.round + 1;
  const allow = { has: (t: Action['t']) => rules.allowList.includes(t) };
  const blocked = blockedGrid(state);
  const gloomAt = new Array<number>(state.w * state.h).fill(0);
  for (const g of state.gloom) gloomAt[idx(state, g.pos.x, g.pos.y)] = 1;

  const move: Dir[] = [];
  const dimmed = a.status === 'dimmed';
  if (allow.has('move') && (!dimmed || round % 2 === 0)) {
    for (const d of DIRS) {
      const x = a.pos.x + DIR_VEC[d].x;
      const y = a.pos.y + DIR_VEC[d].y;
      if (!inBounds(state, x, y)) continue;
      const i = idx(state, x, y);
      if (blocked[i] || gloomAt[i]) continue;
      move.push(d); // tiles held by actors are legal; contention resolves in phase 2
    }
  }
  if (dimmed) return { ...EMPTY_LEGAL, move };

  const strike: EntityId[] = allow.has('strike')
    ? state.gloom.filter((g) => adjacent(g.pos, a.pos)).map((g) => g.id)
    : [];
  const mine: EntityId[] = allow.has('mine') && a.carrying === 0
    ? state.veins.filter((v) => v.amount > 0 && adjacent(v.pos, a.pos)).map((v) => v.id)
    : [];
  const pickup: EntityId[] = allow.has('pickup') && a.carrying === 0
    ? state.piles
        .filter((p) => p.amount > 0 && (adjacent(p.pos, a.pos) || (p.pos.x === a.pos.x && p.pos.y === a.pos.y)))
        .map((p) => p.id)
    : [];
  const deliver: EntityId[] =
    allow.has('deliver') && a.carrying > 0 && state.hearth.fuel > 0 && adjacent(state.hearth.pos, a.pos)
      ? [state.hearth.id]
      : [];
  const drop = allow.has('drop') && a.carrying > 0;
  return { move, strike, mine, pickup, deliver, repair: [], build: [], ability: false, drop };
}

/** True if the action is in the allow-list and the round-start legal set. */
export function isActionLegal(action: Action, legal: LegalSet, rules: ModeRules): boolean {
  return rules.allowList.includes(action.t) && actionInLegal(action, legal);
}
