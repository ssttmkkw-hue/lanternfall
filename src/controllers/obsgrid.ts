// Observation-only grid helpers for executors and bots (never reads engine state).
import type { Dir, Observation, Pos } from '../protocol/types';

export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];
export const DIR_VEC: Readonly<Record<Dir, Pos>> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };

export const manhattan = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const isAdjacent = (a: Pos, b: Pos) => manhattan(a, b) === 1;
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;

export function neighbours(p: Pos): Pos[] {
  return DIRS.map((d) => ({ x: p.x + DIR_VEC[d].x, y: p.y + DIR_VEC[d].y }));
}

export function terrainAt(obs: Observation, p: Pos): string {
  if (p.x < 0 || p.y < 0 || p.x >= obs.map.w || p.y >= obs.map.h) return '#';
  return obs.map.terrain[p.y]![p.x]!;
}

export function isLit(obs: Observation, p: Pos): boolean {
  return obs.map.lit[p.y]?.[p.x] === '1';
}

/** Walkable for planning: floor and no Gloomling (actors are ignored; they move). */
export function walkable(obs: Observation, p: Pos): boolean {
  if (terrainAt(obs, p) !== '.') return false;
  return !obs.entities.some((e) => e.kind === 'gloomling' && samePos(e.pos, p));
}

export interface BfsResult { dist: number[]; firstDir: (Dir | null)[] }

/** BFS from `from` over walkable tiles; records distance and the first step direction. */
export function bfs(obs: Observation, from: Pos): BfsResult {
  const { w, h } = obs.map;
  const dist = new Array<number>(w * h).fill(-1);
  const firstDir = new Array<Dir | null>(w * h).fill(null);
  const start = from.y * w + from.x;
  dist[start] = 0;
  const q = [start];
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
      firstDir[n] = c === start ? d : firstDir[c]!;
      q.push(n);
    }
  }
  return { dist, firstDir };
}

/** Nearest goal tile (lowest distance, then row-major) reachable from the BFS. */
export function nearestGoal(obs: Observation, r: BfsResult, goals: readonly Pos[]): { pos: Pos; dist: number; dir: Dir | null } | null {
  let best: { pos: Pos; dist: number; dir: Dir | null } | null = null;
  for (const g of goals) {
    if (g.x < 0 || g.y < 0 || g.x >= obs.map.w || g.y >= obs.map.h) continue;
    const i = g.y * obs.map.w + g.x;
    const d = r.dist[i]!;
    if (d < 0) continue;
    if (!best || d < best.dist || (d === best.dist && (g.y < best.pos.y || (g.y === best.pos.y && g.x < best.pos.x)))) {
      best = { pos: g, dist: d, dir: r.firstDir[i]! };
    }
  }
  return best;
}
