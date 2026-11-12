// Grid helpers: opacity, passability, Bresenham LOS, illumination.
import type { Dir, Pos } from '../protocol/types';
import { type GameState, TERRAIN_WALL, idx, inBounds } from './state';

export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];
export const DIR_VEC: Readonly<Record<Dir, Pos>> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function adjacent(a: Pos, b: Pos): boolean {
  return manhattan(a, b) === 1;
}

/** Opaque: walls and veins. */
export function opaqueGrid(state: GameState): number[] {
  const g = state.terrain.map((t) => (t === TERRAIN_WALL ? 1 : 0));
  for (const v of state.veins) g[idx(state, v.pos.x, v.pos.y)] = 1;
  return g;
}

/** Static blockers for movement and path planning: walls, veins, structures. */
export function blockedGrid(state: GameState): number[] {
  const g = opaqueGrid(state);
  g[idx(state, state.hearth.pos.x, state.hearth.pos.y)] = 1;
  return g;
}

/** Integer Bresenham from s to t, inclusive; ties step the major axis first. */
export function bresenham(s: Pos, t: Pos): Pos[] {
  const pts: Pos[] = [];
  const dx = Math.abs(t.x - s.x);
  const dy = Math.abs(t.y - s.y);
  const sx = t.x > s.x ? 1 : t.x < s.x ? -1 : 0;
  const sy = t.y > s.y ? 1 : t.y < s.y ? -1 : 0;
  let x = s.x;
  let y = s.y;
  pts.push({ x, y });
  if (dx >= dy) {
    let d = 2 * dy - dx;
    for (let i = 0; i < dx; i++) {
      x += sx;
      if (d > 0) { y += sy; d -= 2 * dx; }
      d += 2 * dy;
      pts.push({ x, y });
    }
  } else {
    let d = 2 * dx - dy;
    for (let i = 0; i < dy; i++) {
      y += sy;
      if (d > 0) { x += sx; d -= 2 * dy; }
      d += 2 * dx;
      pts.push({ x, y });
    }
  }
  return pts;
}

export function hasLos(opaque: readonly number[], w: number, s: Pos, t: Pos): boolean {
  const line = bresenham(s, t);
  for (let i = 1; i < line.length - 1; i++) {
    const p = line[i]!;
    if (opaque[p.y * w + p.x]) return false;
  }
  return true;
}

/** Tiles within radius r (dx²+dy² ≤ r²) of src that src has LOS to. */
export function discWithLos(state: GameState, opaque: readonly number[], src: Pos, r: number): number[] {
  const out: number[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = src.x + dx;
      const y = src.y + dy;
      if (!inBounds(state, x, y)) continue;
      if (hasLos(opaque, state.w, src, { x, y })) out.push(idx(state, x, y));
    }
  }
  return out;
}

/** Illumination: Hearth (fuel > 0) radius. Beacons arrive in M2. */
export function computeLit(state: GameState, hearthRadius: number): number[] {
  const lit = new Array<number>(state.w * state.h).fill(0);
  if (state.hearth.fuel > 0) {
    const opaque = opaqueGrid(state);
    for (const i of discWithLos(state, opaque, state.hearth.pos, hearthRadius)) lit[i] = 1;
  }
  return lit;
}
