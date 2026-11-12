// bot:helper@1 — gather / deliver / guard utility bot (DESIGN §5.2). Synchronous and deterministic:
// reads only its Observation, breaks ties with decisionSeed, never calls Math.random.
import type { Action, Controller, Decision, DecisionRequest, Observation, Order, Pos } from '../../protocol/types';
import { makeRng } from '../../engine/rng';
import { executeOrder, hearthOf } from '../executor';
import { DIRS, DIR_VEC, bfs, isLit, manhattan, neighbours, walkable } from '../obsgrid';

export interface HelperWeights {
  /** Rounds-before-Surge at which the bot returns to guard. */
  braceAt: number;
  /** Gloomlings within this many tiles of the Hearth trigger guarding. */
  threatRange: number;
  /** Spare fuel kept in reserve when venturing into the dark. */
  fuelMargin: number;
}

export const DEFAULT_HELPER: HelperWeights = { braceAt: 3, threatRange: 12, fuelMargin: 2 };

/** Multi-source BFS distance from every walkable tile to the nearest lit walkable tile. */
function distanceToLight(obs: Observation): number[] {
  const { w, h } = obs.map;
  const dist = new Array<number>(w * h).fill(-1);
  const q: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (isLit(obs, { x, y }) && walkable(obs, { x, y })) { dist[y * w + x] = 0; q.push(y * w + x); }
  for (let i = 0; i < q.length; i++) {
    const c = q[i]!;
    const cx = c % w;
    const cy = (c - cx) / w;
    for (const d of DIRS) {
      const p = { x: cx + DIR_VEC[d].x, y: cy + DIR_VEC[d].y };
      if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) continue;
      const n = p.y * w + p.x;
      if (dist[n] !== -1 || !walkable(obs, p)) continue;
      dist[n] = dist[c]! + 1;
      q.push(n);
    }
  }
  return dist;
}

export class HelperBot implements Controller {
  readonly id = 'bot:helper@1';
  readonly kind = 'bot' as const;
  constructor(private readonly weights: HelperWeights = DEFAULT_HELPER) {}

  decide(req: DecisionRequest): Decision {
    const plan = this.plan(req);
    const exec = plan.order ? executeOrder(plan.order, req.observation) : null;
    let action: Action = plan.action ?? exec?.action ?? { t: 'wait' };
    action = this.yieldOnContention(req, action);
    return { requestId: req.requestId, action, order: plan.order, label: plan.label };
  }

  /** Simultaneous moves into one tile all fail. To break symmetric deadlocks, yield (seeded coin)
   *  to a lower-id ally that could be stepping into the same tile. */
  private yieldOnContention(req: DecisionRequest, action: Action): Action {
    if (action.t !== 'move') return action;
    const me = req.observation.self;
    const t = { x: me.pos.x + DIR_VEC[action.dir].x, y: me.pos.y + DIR_VEC[action.dir].y };
    const rival = req.observation.actors.some((a) => a.id < me.id && a.team === me.team && manhattan(a.pos, t) === 1);
    if (!rival) return action;
    const coin = makeRng(req.decisionSeed ^ 0x5bd1e995)() & 1;
    return coin ? { t: 'wait' } : action;
  }

  plan(req: DecisionRequest): { order: Order | null; action?: Action; label: string } {
    const obs = req.observation;
    const me = obs.self;
    const w = this.weights;
    const hearth = hearthOf(obs);
    if (me.status === 'snuffed') return { order: null, action: { t: 'wait' }, label: `Snuffed, back in ${me.respawnIn ?? 0}` };
    if (!hearth) return { order: null, action: { t: 'wait' }, label: 'Lost' };
    const guardHearth: Order = { t: 'guard', at: { x: hearth.pos.x, y: hearth.pos.y }, radius: 3 };

    // 1. Fight anything adjacent.
    const gloom = obs.entities.filter((e) => e.kind === 'gloomling');
    const strikeable = gloom.filter((g) => obs.legal.strike.includes(g.id)).sort((a, b) => (a.hp ?? 0) - (b.hp ?? 0) || a.id - b.id);
    if (strikeable.length > 0) return { order: guardHearth, action: { t: 'strike', target: strikeable[0]!.id }, label: 'Fighting a Gloomling' };

    // 1b. Feeding the Hearth is never wrong while standing next to it.
    if (me.carrying && obs.legal.deliver.includes(hearth.id) && (hearth.fuel ?? 0) + 5 <= 60) {
      return { order: { t: 'gather' }, action: { t: 'deliver', target: hearth.id }, label: 'Feeding the Hearth' };
    }

    // 2. Answer an ally's hold/help/danger ping (newest first).
    const ping = [...obs.pings].reverse().find((p) => p.from !== me.id && p.ping.kind !== 'gather' && p.ping.kind !== 'goHere');
    if (ping && gloom.length > 0) {
      return { order: { t: 'guard', at: ping.ping.at, radius: 2 }, label: `Holding at (${ping.ping.at.x},${ping.ping.at.y}) (your ping)` };
    }

    // 3. Threats near the Hearth → guard.
    if (gloom.some((g) => manhattan(g.pos, hearth.pos) <= w.threatRange)) {
      return { order: guardHearth, label: 'Guarding the Hearth' };
    }

    // 4. Surge imminent → brace (deliver first if already carrying).
    const surge = obs.forecast.surgeInRounds;
    if (surge !== null && surge <= w.braceAt && !me.carrying) {
      return { order: guardHearth, label: `Bracing for the Surge from ${obs.forecast.from ?? '?'}` };
    }

    // 5. Low lantern → head for light.
    const toLight = distanceToLight(obs);
    const myI = me.pos.y * obs.map.w + me.pos.x;
    const here = toLight[myI]!;
    if (!isLit(obs, me.pos) && here >= 0 && me.fuel <= here + w.fuelMargin) {
      const goal = this.nearestLit(obs);
      if (goal) return { order: { t: 'goTo', at: goal }, label: 'Low lantern, back to the light' };
    }

    // 6. Carrying → deliver (or hold it while the Hearth is near its cap).
    const fuel = hearth.fuel ?? 0;
    if (me.carrying) {
      if (fuel + 5 > 60) return { order: { t: 'guard', at: hearth.pos, radius: 2 }, label: 'Holding Ember until the Hearth needs it' };
      return { order: { t: 'gather' }, label: 'Carrying Ember to the Hearth' };
    }

    // 7. Pick a vein: reachable, affordable on the current lantern, nearest; seed breaks ties.
    const rng = makeRng(req.decisionSeed);
    const fromMe = bfs(obs, me.pos);
    const teammateVeins = Object.entries(obs.team.orders)
      .filter(([id, o]) => Number(id) !== me.id && o?.t === 'gather' && o.vein !== undefined)
      .map(([, o]) => (o as { vein: number }).vein);
    let best: { id: number; score: number; tie: number } | null = null;
    for (const v of obs.entities.filter((e) => e.kind === 'vein' && (e.amount ?? 0) > 0).sort((a, b) => a.id - b.id)) {
      const tie = rng();
      let d = Infinity;
      let back = Infinity;
      for (const n of neighbours(v.pos)) {
        if (n.x < 0 || n.y < 0 || n.x >= obs.map.w || n.y >= obs.map.h) continue;
        const i = n.y * obs.map.w + n.x;
        const dn = fromMe.dist[i]!;
        if (dn < 0) continue;
        if (dn < d) { d = dn; back = toLight[i]!; }
      }
      if (!Number.isFinite(d) || back < 0) continue;
      const out = isLit(obs, me.pos) ? back : d;
      if (out + 1 + back + w.fuelMargin > me.fuel) continue;
      const crowded = teammateVeins.includes(v.id) && (v.amount ?? 0) <= 2 ? 6 : 0;
      const score = d + crowded;
      if (!best || score < best.score || (score === best.score && tie < best.tie)) best = { id: v.id, score, tie };
    }
    if (best) return { order: { t: 'gather', vein: best.id }, label: `Gathering Ember (vein #${best.id})` };

    // 8. Loose Ember: pick it up when legal (underfoot or adjacent), else walk to the nearest reachable pile.
    if (obs.legal.pickup.length > 0) {
      return { order: { t: 'gather' }, action: { t: 'pickup', target: obs.legal.pickup[0]! }, label: 'Recovering dropped Ember' };
    }
    let pile: { pos: Pos; d: number } | null = null;
    for (const e of obs.entities) {
      if (e.kind !== 'ember') continue;
      const d = fromMe.dist[e.pos.y * obs.map.w + e.pos.x]!;
      if (d >= 0 && (!pile || d < pile.d)) pile = { pos: e.pos, d };
    }
    if (pile) return { order: { t: 'goTo', at: { x: pile.pos.x, y: pile.pos.y } }, label: 'Recovering dropped Ember' };

    return { order: guardHearth, label: 'Keeping watch by the Hearth' };
  }

  private nearestLit(obs: Observation): Pos | null {
    const r = bfs(obs, obs.self.pos);
    let best: Pos | null = null;
    let bd = Infinity;
    for (let y = 0; y < obs.map.h; y++)
      for (let x = 0; x < obs.map.w; x++) {
        const d = r.dist[y * obs.map.w + x]!;
        if (d >= 0 && d < bd && isLit(obs, { x, y })) { bd = d; best = { x, y }; }
      }
    return best;
  }
}
