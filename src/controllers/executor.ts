// Order → Action, using only the actor's Observation (DESIGN §5). M1 subset: goTo, gather, guard.
import type { Action, Observation, Order, Pos } from '../protocol/types';
import { actionInLegal } from '../protocol/validate';
import { bfs, isAdjacent, manhattan, nearestGoal, neighbours, samePos } from './obsgrid';

export interface ExecResult {
  action: Action;
  /** The order's goal is reached (goTo) and it can be cleared. */
  done: boolean;
}

const WAIT: Action = { t: 'wait' };

function stepToward(obs: Observation, goals: readonly Pos[]): Action | null {
  const me = obs.self.pos;
  if (goals.some((g) => samePos(g, me))) return WAIT;
  const best = nearestGoal(obs, bfs(obs, me), goals);
  if (!best || !best.dir) return null;
  return { t: 'move', dir: best.dir };
}

function legalOrWait(obs: Observation, a: Action | null): Action | null {
  if (!a) return null;
  if (actionInLegal(a, obs.legal)) return a;
  // Dimmed on an odd round, or a target became illegal: hold still rather than give up the order.
  return a.t === 'move' ? WAIT : null;
}

export function hearthOf(obs: Observation) {
  return obs.entities.find((e) => e.kind === 'hearth');
}

/** Returns null when the order is impossible (caller falls back). */
export function executeOrder(order: Order, obs: Observation): ExecResult | null {
  if (obs.self.status === 'snuffed') return { action: WAIT, done: false };
  switch (order.t) {
    case 'goTo': {
      if (samePos(obs.self.pos, order.at)) return { action: WAIT, done: true };
      const a = legalOrWait(obs, stepToward(obs, [order.at]));
      return a ? { action: a, done: false } : null;
    }
    case 'gather':
      return execGather(order, obs);
    case 'guard':
      return execGuard(order, obs);
    default:
      return null; // follow / refuel / build arrive in M2
  }
}

function execGather(order: { vein?: number }, obs: Observation): ExecResult | null {
  const hearth = hearthOf(obs);
  if (!hearth) return null;
  if (obs.self.carrying) {
    if (obs.legal.deliver.includes(hearth.id)) return { action: { t: 'deliver', target: hearth.id }, done: false };
    const a = legalOrWait(obs, stepToward(obs, neighbours(hearth.pos)));
    return a ? { action: a, done: false } : null;
  }
  // Loose Ember first (adjacent or underfoot), then the chosen vein.
  if (obs.legal.pickup.length > 0) return { action: { t: 'pickup', target: obs.legal.pickup[0]! }, done: false };
  const veins = obs.entities.filter((e) => e.kind === 'vein' && (e.amount ?? 0) > 0);
  const target = order.vein !== undefined ? veins.find((v) => v.id === order.vein) : undefined;
  const candidates = target ? [target] : veins;
  if (candidates.length === 0) return null;
  for (const v of candidates) if (obs.legal.mine.includes(v.id)) return { action: { t: 'mine', target: v.id }, done: false };
  const goals = candidates.flatMap((v) => neighbours(v.pos));
  const a = legalOrWait(obs, stepToward(obs, goals));
  return a ? { action: a, done: false } : null;
}

function execGuard(order: { at: Pos; radius: number }, obs: Observation): ExecResult | null {
  const gloom = obs.entities
    .filter((e) => e.kind === 'gloomling')
    .sort((a, b) => (a.hp ?? 0) - (b.hp ?? 0) || a.id - b.id);
  const strikeable = gloom.filter((g) => obs.legal.strike.includes(g.id));
  if (strikeable.length > 0) return { action: { t: 'strike', target: strikeable[0]!.id }, done: false };
  const threats = gloom.filter((g) => manhattan(g.pos, order.at) <= order.radius + 2);
  if (threats.length > 0) {
    const goals = threats.flatMap((g) => neighbours(g.pos));
    if (threats.some((g) => isAdjacent(g.pos, obs.self.pos))) return { action: WAIT, done: false };
    const a = legalOrWait(obs, stepToward(obs, goals));
    if (a) return { action: a, done: false };
  }
  if (manhattan(obs.self.pos, order.at) > order.radius) {
    const ring: Pos[] = [];
    for (let dy = -order.radius; dy <= order.radius; dy++)
      for (let dx = -order.radius; dx <= order.radius; dx++)
        if (Math.abs(dx) + Math.abs(dy) <= order.radius) ring.push({ x: order.at.x + dx, y: order.at.y + dy });
    const a = legalOrWait(obs, stepToward(obs, ring));
    return a ? { action: a, done: false } : null;
  }
  return { action: WAIT, done: false };
}
