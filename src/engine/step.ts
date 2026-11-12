// step(state, accepted, rules) → { state, events }. Pure and deterministic (DESIGN §7).
import type { AcceptedAction, Action, ActorId } from '../protocol/types';
import type { EngineEvent } from './events';
import { computeLegal, isActionLegal } from './legal';
import type { ModeRules } from './modes/types';
import { strikePhase } from './resolve/combat';
import { type EconomyIntents, economyPhase } from './resolve/economy';
import { gloomPhase, recomputeGloomPaths, spawnPhase } from './resolve/gloom';
import { lifecyclePhase } from './resolve/lifecycle';
import { lightPhase } from './resolve/light';
import { type MoveIntent, movementPhase } from './resolve/movement';
import { type GameState, cloneState } from './state';

export interface StepResult {
  state: GameState;
  events: EngineEvent[];
  /** Actions as applied after intake (invalid submissions replaced by wait). */
  applied: { actor: ActorId; action: Action }[];
  snuffed: ActorId[];
}

export function step(prev: GameState, accepted: readonly AcceptedAction[], rules: ModeRules): StepResult {
  if (prev.result !== null) throw new Error('step: match is already over');
  const state = cloneState(prev);
  const round = prev.round + 1;
  const events: EngineEvent[] = [];
  const roundStartLit = prev.lit;

  // Phase 1: intake. Re-check submission validity against the round-start legal set.
  const applied: { actor: ActorId; action: Action }[] = [];
  for (const a of [...state.actors].sort((x, y) => x.id - y.id)) {
    if (a.status === 'snuffed') continue;
    const sub = accepted.filter((x) => x.actor === a.id);
    let action: Action = { t: 'wait' };
    if (sub.length === 1 && isActionLegal(sub[0]!.action, computeLegal(prev, a.id, rules), rules)) {
      action = sub[0]!.action;
    } else if (sub.length > 0) {
      events.push({ round, kind: 'rejected', actor: a.id, text: `Actor ${a.id} submission rejected at intake` });
    }
    applied.push({ actor: a.id, action });
  }

  const moves: MoveIntent[] = [];
  const strikes: { actor: ActorId; target: number }[] = [];
  const eco: EconomyIntents = { deliver: [], mine: [], pickup: [], drop: [] };
  for (const { actor, action } of applied) {
    switch (action.t) {
      case 'move': moves.push({ actor, dir: action.dir }); break;
      case 'strike': strikes.push({ actor, target: action.target }); break;
      case 'deliver': eco.deliver.push({ actor, target: action.target }); break;
      case 'mine': eco.mine.push({ actor, target: action.target }); break;
      case 'pickup': eco.pickup.push({ actor, target: action.target }); break;
      case 'drop': eco.drop.push({ actor }); break;
      default: break; // wait; build/repair/ability are reserved (M2)
    }
  }

  movementPhase(state, moves, round, events); // 2
  strikePhase(state, strikes, rules.params.strikeDamage, round, events); // 3 (3b reserved)
  economyPhase(state, eco, rules.params, round, events); // 4 (build/repair reserved)
  gloomPhase(state, rules, roundStartLit, round, events); // 5
  lightPhase(state, rules, round); // 6
  const snuffed = lifecyclePhase(state, rules, round, events); // 7
  spawnPhase(state, rules, round, events); // 8
  state.round = round;
  state.result = rules.checkEnd(state, round); // 9
  if (state.result) {
    const text = state.result === 'loss' ? 'The Hearth goes out.' : state.result === 'win' ? 'The last Surge is broken!' : 'Dawn breaks. The Hearth held.';
    events.push({ round, kind: 'end', text });
  }
  recomputeGloomPaths(state); // 10 (forecast is derived in observe)
  return { state, events, applied, snuffed };
}
