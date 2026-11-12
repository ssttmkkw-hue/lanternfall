// Phase 6: Hearth burn → recompute lit → actor fuel and Dimmed.
import { computeLit } from '../grid';
import type { ModeRules } from '../modes/types';
import { type GameState, idx } from '../state';

export function lightPhase(state: GameState, rules: ModeRules, round: number): void {
  if (round % 2 === 0) state.hearth.fuel = Math.max(0, state.hearth.fuel - 1);
  state.lit = computeLit(state, rules.params.hearthRadius);
  for (const a of [...state.actors].sort((x, y) => x.id - y.id)) {
    if (a.status === 'snuffed') continue;
    if (state.lit[idx(state, a.pos.x, a.pos.y)]) {
      a.fuel = rules.params.actorFuel;
      a.status = 'ok';
    } else {
      a.fuel = Math.max(0, a.fuel - 1);
      if (a.fuel === 0) a.status = 'dimmed';
    }
  }
}
