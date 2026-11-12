// Phase 5 (Gloom actions), phase 8 (spawns) and phase 10 (path planning).
import type { Pos } from '../../protocol/types';
import type { EngineEvent } from '../events';
import { DIRS, DIR_VEC, adjacent, blockedGrid } from '../grid';
import type { ModeRules } from '../modes/types';
import { type GameState, idx, inBounds } from '../state';

/** BFS over unblocked floor (actors/Gloomlings ignored) to a tile adjacent to the nearest lit structure. */
export function planPath(state: GameState, blocked: readonly number[], from: Pos): Pos[] {
  // M1: the only structure is the Hearth.
  const structures = state.hearth.fuel > 0 ? [state.hearth] : [];
  if (structures.length === 0) return [];
  const goalOwner = new Array<number>(state.w * state.h).fill(0);
  for (const s of [...structures].sort((a, b) => a.id - b.id)) {
    for (const d of DIRS) {
      const x = s.pos.x + DIR_VEC[d].x;
      const y = s.pos.y + DIR_VEC[d].y;
      if (inBounds(state, x, y) && !goalOwner[idx(state, x, y)]) goalOwner[idx(state, x, y)] = s.id;
    }
  }
  const start = idx(state, from.x, from.y);
  if (goalOwner[start]) return [];
  const prev = new Array<number>(state.w * state.h).fill(-1);
  prev[start] = start;
  const queue = [start];
  let goal = -1;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]!;
    // M1 has one structure; multi-structure tie-breaking (lowest id) arrives with Beacons in M2.
    if (goalOwner[cur]) { goal = cur; break; }
    const cx = cur % state.w;
    const cy = (cur - cx) / state.w;
    for (const d of DIRS) {
      const x = cx + DIR_VEC[d].x;
      const y = cy + DIR_VEC[d].y;
      if (!inBounds(state, x, y)) continue;
      const ni = idx(state, x, y);
      if (prev[ni] !== -1 || blocked[ni]) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (goal < 0) return [];
  const path: Pos[] = [];
  for (let c = goal; c !== start; c = prev[c]!) path.push({ x: c % state.w, y: (c - (c % state.w)) / state.w });
  return path.reverse();
}

export function recomputeGloomPaths(state: GameState): void {
  const blocked = blockedGrid(state);
  for (const g of state.gloom) g.path = planPath(state, blocked, g.pos);
}

export function gloomPhase(state: GameState, rules: ModeRules, roundStartLit: readonly number[], round: number, events: EngineEvent[]): void {
  const p = rules.params;
  const blocked = blockedGrid(state);
  const actorDmg = new Array<number>(state.actors.length).fill(0);
  let hearthDmg = 0;
  for (const g of [...state.gloom].sort((a, b) => a.id - b.id)) {
    const targets = state.actors
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.status !== 'snuffed' && adjacent(a.pos, g.pos))
      .sort((x, y) => x.a.hp - y.a.hp || x.a.id - y.a.id);
    if (targets.length > 0) {
      const t = targets[0]!;
      actorDmg[t.i] = actorDmg[t.i]! + p.gloomActorDamage;
      events.push({ round, kind: 'gloom-attack', actor: t.a.id, text: `Gloomling #${g.id} claws actor ${t.a.id}` });
      continue;
    }
    if (state.hearth.fuel > 0 && adjacent(state.hearth.pos, g.pos)) {
      hearthDmg += p.gloomStructureDamage;
      events.push({ round, kind: 'gloom-attack', text: `Gloomling #${g.id} drains the Hearth (-${p.gloomStructureDamage})` });
      continue;
    }
    const next = g.path[0];
    if (!next) continue;
    if (roundStartLit[idx(state, g.pos.x, g.pos.y)] && round % 2 !== 0) continue; // slowed in light
    if (!inBounds(state, next.x, next.y) || !adjacent(next, g.pos)) continue;
    const ni = idx(state, next.x, next.y);
    if (blocked[ni]) continue;
    if (state.actors.some((a) => a.status !== 'snuffed' && a.pos.x === next.x && a.pos.y === next.y)) continue;
    if (state.gloom.some((o) => o !== g && o.pos.x === next.x && o.pos.y === next.y)) continue;
    g.pos = { x: next.x, y: next.y };
    g.path = g.path.slice(1);
  }
  state.actors.forEach((a, i) => { a.hp = Math.max(0, a.hp - actorDmg[i]!); });
  state.hearth.fuel = Math.max(0, state.hearth.fuel - hearthDmg);
}

export function spawnPhase(state: GameState, rules: ModeRules, round: number, events: EngineEvent[]): void {
  rules.surges.forEach((s, wave) => {
    if (s.round === round) {
      for (let i = 0; i < s.count; i++) state.spawnQueue.push({ wave, from: s.from });
      events.push({ round, kind: 'surge', text: `Surge ${wave + 1} rises from the ${s.from}!` });
    }
  });
  const remaining = [];
  for (const q of state.spawnQueue) {
    const spot = state.spawns[q.from].find(
      (sp) =>
        !state.actors.some((a) => a.status !== 'snuffed' && a.pos.x === sp.x && a.pos.y === sp.y) &&
        !state.gloom.some((g) => g.pos.x === sp.x && g.pos.y === sp.y) &&
        !(state.hearth.pos.x === sp.x && state.hearth.pos.y === sp.y),
    );
    if (!spot) { remaining.push(q); continue; }
    state.gloom.push({ id: state.nextId++, pos: { x: spot.x, y: spot.y }, hp: rules.params.gloomHp, path: [] });
  }
  state.spawnQueue = remaining;
}
