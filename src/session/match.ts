// Match setup shared by the browser app, the headless runner and tests.
import { createInitialState } from '../engine/init';
import { HOLD_M1 } from '../engine/modes/hold';
import type { ModeRules } from '../engine/modes/types';
import type { MapDef } from '../engine/state';
import { HOLD_M1_MAP } from '../content/maps/hold-m1';
import { HelperBot } from '../controllers/bots/helper';
import type { Controller } from '../protocol/types';
import type { Clock } from './clock';
import { Coordinator, type Seat } from './coordinator';
import { ReplayRecorder } from './replay';

export interface MatchSetup {
  seed: number;
  controllers: readonly Controller[];
  map?: MapDef;
  rules?: ModeRules;
  clock?: Clock | null;
  matchId?: string;
}

export function createMatch(setup: MatchSetup): { coordinator: Coordinator; recorder: ReplayRecorder } {
  const map = setup.map ?? HOLD_M1_MAP;
  const rules = setup.rules ?? HOLD_M1;
  const seed = setup.seed >>> 0;
  const state = createInitialState({
    matchId: setup.matchId ?? `hold-${seed.toString(16)}`,
    seed,
    map,
    rules,
    roster: setup.controllers.map((_, i) => ({ id: i, team: 0, role: 'lanterner' as const })),
  });
  const recorder = new ReplayRecorder(state, map, rules, setup.controllers.map((c) => c.id));
  const seats: Seat[] = setup.controllers.map((c) => (c.kind === 'human' ? { controller: c } : { controller: c, companion: new HelperBot() }));
  const coordinator = new Coordinator({ state, rules, seats, clock: setup.clock ?? null, recorder });
  return { coordinator, recorder };
}
