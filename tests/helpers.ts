import { computeLit } from '../src/engine/grid';
import { createInitialState } from '../src/engine/init';
import { HOLD_M1 } from '../src/engine/modes/hold';
import type { ModeRules } from '../src/engine/modes/types';
import { recomputeGloomPaths } from '../src/engine/resolve/gloom';
import type { GameState, MapDef } from '../src/engine/state';
import type { AcceptedAction, Action } from '../src/protocol/types';

/** 13×13 open test cave, Hearth at (6,6); corners are outside Hearth light. */
export const OPEN_MAP: MapDef = {
  id: 'test-open',
  name: 'Test',
  rows: [
    '#############',
    '#....nnnn...#',
    '#...........#',
    '#...........#',
    '#...........#',
    '#w.........e#',
    '#w....H....e#',
    '#w.........e#',
    '#w.........e#',
    '#...........#',
    '#...........#',
    '#...........#',
    '#############',
  ],
};

/** Hold rules with no surges unless given (keeps unit tests focused). */
export function testRules(over: Partial<ModeRules> = {}): ModeRules {
  return { ...HOLD_M1, surges: [], checkEnd: () => null, ...over };
}

export function makeState(nActors = 2, map: MapDef = OPEN_MAP, rules: ModeRules = testRules()): GameState {
  return createInitialState({
    matchId: 'test',
    seed: 7,
    map,
    rules,
    roster: Array.from({ length: nActors }, (_, i) => ({ id: i, team: 0, role: 'lanterner' as const })),
  });
}

export function put(s: GameState, actor: number, x: number, y: number): void {
  s.actors[actor]!.pos = { x, y };
}

export function addGloom(s: GameState, x: number, y: number, hp = 2): number {
  const id = s.nextId++;
  s.gloom.push({ id, pos: { x, y }, hp, path: [] });
  recomputeGloomPaths(s);
  return id;
}

export function addVein(s: GameState, x: number, y: number, amount: number, rules: ModeRules = testRules()): number {
  const id = s.nextId++;
  s.veins.push({ id, pos: { x, y }, amount });
  s.lit = computeLit(s, rules.params.hearthRadius);
  recomputeGloomPaths(s);
  return id;
}

export function addPile(s: GameState, x: number, y: number, amount = 1): number {
  const id = s.nextId++;
  s.piles.push({ id, pos: { x, y }, amount, since: s.round });
  return id;
}

export function acts(...list: [number, Action][]): AcceptedAction[] {
  return list.map(([actor, action]) => ({ actor, action, source: 'controller' as const }));
}

export const mv = (dir: 'N' | 'E' | 'S' | 'W'): Action => ({ t: 'move', dir });
export const WAIT: Action = { t: 'wait' };
