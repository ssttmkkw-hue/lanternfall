// Match initialisation from a hand-built MapDef.
import type { Pos } from '../protocol/types';
import { computeLit } from './grid';
import type { ModeRules } from './modes/types';
import { seedRng } from './rng';
import {
  type ActorState, type GameState, type MapDef, type RosterEntry, type VeinState,
  TERRAIN_FLOOR, TERRAIN_WALL,
} from './state';
import { recomputeGloomPaths } from './resolve/gloom';

export interface ParsedMap {
  w: number;
  h: number;
  terrain: number[];
  hearth: Pos;
  veins: { pos: Pos; amount: number }[];
  spawns: { W: Pos[]; E: Pos[]; N: Pos[]; S: Pos[] };
}

export function parseMap(def: MapDef): ParsedMap {
  const h = def.rows.length;
  const w = def.rows[0]?.length ?? 0;
  if (w === 0 || h === 0) throw new Error(`map ${def.id}: empty`);
  const terrain: number[] = [];
  const veins: { pos: Pos; amount: number }[] = [];
  const spawns = { W: [] as Pos[], E: [] as Pos[], N: [] as Pos[], S: [] as Pos[] };
  let hearth: Pos | null = null;
  def.rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`map ${def.id}: row ${y} has width ${row.length}, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const c = row[x]!;
      if (c === '#') { terrain.push(TERRAIN_WALL); continue; }
      terrain.push(TERRAIN_FLOOR);
      if (c === '.') continue;
      if (c === 'H') {
        if (hearth) throw new Error(`map ${def.id}: more than one hearth`);
        hearth = { x, y };
      } else if (c >= '1' && c <= '9') veins.push({ pos: { x, y }, amount: c.charCodeAt(0) - 48 });
      else if (c === 'w') spawns.W.push({ x, y });
      else if (c === 'e') spawns.E.push({ x, y });
      else if (c === 'n') spawns.N.push({ x, y });
      else if (c === 's') spawns.S.push({ x, y });
      else throw new Error(`map ${def.id}: unknown tile '${c}' at ${x},${y}`);
    }
  });
  if (!hearth) throw new Error(`map ${def.id}: no hearth`);
  return { w, h, terrain, hearth, veins, spawns };
}

/** Hearth N, E, S, W neighbours, then the radius-2 ring in row-major order. */
export function respawnListFor(hearth: Pos, w: number, h: number): Pos[] {
  const out: Pos[] = [];
  const near: Pos[] = [
    { x: hearth.x, y: hearth.y - 1 },
    { x: hearth.x + 1, y: hearth.y },
    { x: hearth.x, y: hearth.y + 1 },
    { x: hearth.x - 1, y: hearth.y },
  ];
  out.push(...near);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 <= 1 || d2 > 4) continue;
      out.push({ x: hearth.x + dx, y: hearth.y + dy });
    }
  }
  return out.filter((p) => p.x >= 0 && p.y >= 0 && p.x < w && p.y < h);
}

export interface InitOptions {
  matchId: string;
  seed: number;
  map: MapDef;
  roster: readonly RosterEntry[];
  rules: ModeRules;
}

export function createInitialState(opts: InitOptions): GameState {
  const { map, rules } = opts;
  const pm = parseMap(map);
  let nextId = 1;
  const hearth = { id: nextId++, pos: { ...pm.hearth }, fuel: rules.params.hearthStart };
  const veins: VeinState[] = pm.veins.map((v) => ({ id: nextId++, pos: { ...v.pos }, amount: v.amount }));
  const respawnList = respawnListFor(pm.hearth, pm.w, pm.h);
  const blocked = (p: Pos) =>
    pm.terrain[p.y * pm.w + p.x] !== TERRAIN_FLOOR ||
    (p.x === pm.hearth.x && p.y === pm.hearth.y) ||
    veins.some((v) => v.pos.x === p.x && v.pos.y === p.y);
  const starts = respawnList.filter((p) => !blocked(p));
  const roster = [...opts.roster].sort((a, b) => a.id - b.id);
  if (roster.length > starts.length) throw new Error('too many actors for the start tiles');
  const actors: ActorState[] = roster.map((r, i) => ({
    id: r.id,
    team: r.team,
    role: r.role,
    pos: { ...starts[i]! },
    hp: rules.params.actorHp,
    fuel: rules.params.actorFuel,
    carrying: 0,
    cooldown: 0,
    status: 'ok',
    respawnIn: null,
  }));
  const state: GameState = {
    matchId: opts.matchId,
    mode: rules.id,
    mapId: map.id,
    seed: opts.seed >>> 0,
    round: 0,
    nextId,
    w: pm.w,
    h: pm.h,
    terrain: pm.terrain,
    lit: [],
    spawns: pm.spawns,
    respawnList,
    actors,
    hearth,
    veins,
    piles: [],
    gloom: [],
    spawnQueue: [],
    result: null,
    rng: seedRng(opts.seed >>> 0),
  };
  state.lit = computeLit(state, rules.params.hearthRadius);
  recomputeGloomPaths(state);
  return state;
}
