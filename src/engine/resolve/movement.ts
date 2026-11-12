// Phase 2: simultaneous actor movement (DESIGN §2.1.3).
import type { ActorId, Dir } from '../../protocol/types';
import type { EngineEvent } from '../events';
import { DIR_VEC } from '../grid';
import type { GameState } from '../state';

export interface MoveIntent { actor: ActorId; dir: Dir }

export function movementPhase(state: GameState, moves: readonly MoveIntent[], round: number, events: EngineEvent[]): void {
  const key = (x: number, y: number) => y * state.w + x;
  const movers = [...moves]
    .sort((a, b) => a.actor - b.actor)
    .map((m) => {
      const a = state.actors.find((x) => x.id === m.actor)!;
      const to = { x: a.pos.x + DIR_VEC[m.dir].x, y: a.pos.y + DIR_VEC[m.dir].y };
      return { actor: a, from: key(a.pos.x, a.pos.y), to: key(to.x, to.y), toPos: to, ok: true, reason: '' };
    });

  // 1. Several actors targeting one tile: all of them fail.
  for (const m of movers) {
    if (movers.filter((o) => o.to === m.to).length > 1) { m.ok = false; m.reason = 'contested tile'; }
  }

  // Occupants at round start (on-map actors only).
  const occupantAt = (tile: number) =>
    state.actors.find((a) => a.status !== 'snuffed' && key(a.pos.x, a.pos.y) === tile);
  const moverOf = (actorId: ActorId) => movers.find((m) => m.actor.id === actorId);

  const propagate = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of movers) {
        if (!m.ok) continue;
        const occ = occupantAt(m.to);
        if (!occ) continue;
        const om = moverOf(occ.id);
        if (!om || !om.ok) { m.ok = false; m.reason = 'blocked'; changed = true; }
      }
    }
  };
  propagate();

  // 2. Cycles (swaps, rotations) succeed only if every participant is an ally.
  let cycleFailed = true;
  while (cycleFailed) {
    cycleFailed = false;
    for (const start of movers) {
      if (!start.ok) continue;
      const chain = [start];
      let cur = start;
      for (;;) {
        const occ = occupantAt(cur.to);
        const next = occ ? moverOf(occ.id) : undefined;
        if (!next || !next.ok) break;
        if (next === start) {
          if (chain.some((c) => c.actor.team !== start.actor.team)) {
            for (const c of chain) { c.ok = false; c.reason = 'opposed swap'; }
            cycleFailed = true;
          }
          break;
        }
        if (chain.includes(next)) break;
        chain.push(next);
        cur = next;
      }
    }
    if (cycleFailed) propagate();
  }

  for (const m of movers) {
    if (m.ok) {
      m.actor.pos = { x: m.toPos.x, y: m.toPos.y };
    } else {
      events.push({ round, kind: 'fizzle', actor: m.actor.id, text: `Actor ${m.actor.id} move failed (${m.reason})` });
    }
  }
}
