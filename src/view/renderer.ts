// Canvas2D renderer. Reads Observation snapshots only; never touches engine state.
import type { Action, Dir, Observation, Pos } from '../protocol/types';

export const TILE = 32;
const DIR_VEC: Record<Dir, Pos> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
const TWEEN_MS = 140;

const C = {
  floorLit: '#5a4632',
  floorDark: '#1c1a22',
  wall: '#3b3f4a',
  wallEdge: '#565b68',
  ember: '#ffb347',
  emberDeep: '#e2572b',
  vein: '#c2502a',
  veinEmpty: '#4a4038',
  hearth: '#ffcc66',
  you: '#5fb8ff',
  ally: '#7be08a',
  gloom: '#9b6bff',
  gloomPath: 'rgba(170,120,255,0.55)',
  text: '#f4ead8',
};

interface Tween { from: Pos; to: Pos; start: number }

export interface RenderOptions {
  selfId: number;
  pending: Action | null;
  locked: boolean;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private obs: Observation | null = null;
  private tweens: Record<string, Tween> = {};
  private shown: Record<string, Pos> = {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas2D not available');
    this.ctx = ctx;
  }

  setObservation(obs: Observation, now: number): void {
    const next: Record<string, Tween> = {};
    const place = (key: string, to: Pos) => {
      const from = this.shown[key] ?? to;
      next[key] = { from, to, start: now };
    };
    for (const a of obs.actors) place(`a${a.id}`, a.pos);
    for (const e of obs.entities) if (e.kind === 'gloomling') place(`e${e.id}`, e.pos);
    this.tweens = next;
    this.obs = obs;
    if (this.canvas.width !== obs.map.w * TILE) {
      this.canvas.width = obs.map.w * TILE;
      this.canvas.height = obs.map.h * TILE;
    }
  }

  private posOf(key: string, now: number): Pos | null {
    const t = this.tweens[key];
    if (!t) return null;
    const k = Math.min(1, (now - t.start) / TWEEN_MS);
    const p = { x: t.from.x + (t.to.x - t.from.x) * k, y: t.from.y + (t.to.y - t.from.y) * k };
    this.shown[key] = p;
    return p;
  }

  draw(now: number, opt: RenderOptions): void {
    const obs = this.obs;
    const g = this.ctx;
    if (!obs) return;
    const { w, h } = obs.map;
    g.clearRect(0, 0, w * TILE, h * TILE);

    // Tiles: brightness + a dark-tile symbol (never colour alone).
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = obs.map.terrain[y]![x]!;
        const lit = obs.map.lit[y]![x] === '1';
        const px = x * TILE;
        const py = y * TILE;
        if (t === '#') {
          g.fillStyle = C.wall;
          g.fillRect(px, py, TILE, TILE);
          g.fillStyle = C.wallEdge;
          g.fillRect(px, py, TILE, 3);
          if (!lit) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(px, py, TILE, TILE); }
          continue;
        }
        g.fillStyle = lit ? C.floorLit : C.floorDark;
        g.fillRect(px, py, TILE, TILE);
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        if (!lit) {
          // dark-tile symbol: two small diagonal ticks
          g.strokeStyle = 'rgba(140,140,170,0.35)';
          g.beginPath();
          g.moveTo(px + 4, py + 10); g.lineTo(px + 10, py + 4);
          g.moveTo(px + 22, py + 28); g.lineTo(px + 28, py + 22);
          g.stroke();
        }
      }
    }

    // Hearth glow
    const hearth = obs.entities.find((e) => e.kind === 'hearth');
    if (hearth && (hearth.fuel ?? 0) > 0) {
      const cx = hearth.pos.x * TILE + TILE / 2;
      const cy = hearth.pos.y * TILE + TILE / 2;
      const rad = g.createRadialGradient(cx, cy, 4, cx, cy, TILE * 4.5);
      rad.addColorStop(0, 'rgba(255,200,110,0.35)');
      rad.addColorStop(1, 'rgba(255,200,110,0)');
      g.fillStyle = rad;
      g.fillRect(cx - TILE * 5, cy - TILE * 5, TILE * 10, TILE * 10);
    }

    // Surge direction band
    if (obs.forecast.from) {
      const pulse = 0.25 + 0.2 * Math.sin(now / 200);
      g.fillStyle = `rgba(155,107,255,${pulse})`;
      const b = 6;
      if (obs.forecast.from === 'W') g.fillRect(0, 0, b, h * TILE);
      if (obs.forecast.from === 'E') g.fillRect(w * TILE - b, 0, b, h * TILE);
      if (obs.forecast.from === 'N') g.fillRect(0, 0, w * TILE, b);
      if (obs.forecast.from === 'S') g.fillRect(0, h * TILE - b, w * TILE, b);
    }

    // Static entities
    for (const e of obs.entities) {
      const cx = e.pos.x * TILE + TILE / 2;
      const cy = e.pos.y * TILE + TILE / 2;
      if (e.kind === 'vein') {
        const has = (e.amount ?? 0) > 0;
        g.fillStyle = has ? C.vein : C.veinEmpty;
        g.fillRect(e.pos.x * TILE + 1, e.pos.y * TILE + 1, TILE - 2, TILE - 2);
        if (has) {
          diamond(g, cx - 6, cy - 4, 6, C.ember);
          diamond(g, cx + 6, cy + 2, 5, C.emberDeep);
        }
        label(g, String(e.amount ?? 0), cx, cy + 12, 11);
      } else if (e.kind === 'hearth') {
        g.fillStyle = '#2a1c10';
        g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.fill();
        const f = Math.max(0, Math.min(1, (e.fuel ?? 0) / 60));
        g.strokeStyle = C.hearth; g.lineWidth = 3;
        g.beginPath(); g.arc(cx, cy, 14, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.stroke();
        g.lineWidth = 1;
        flame(g, cx, cy + 6, 9 + Math.sin(now / 120) * 1.5);
      } else if (e.kind === 'ember') {
        diamond(g, cx, cy, 6, C.ember);
        if ((e.amount ?? 1) > 1) label(g, String(e.amount), cx + 9, cy - 8, 10);
      }
    }

    // Gloom paths (next 5 tiles)
    g.setLineDash([3, 4]);
    g.strokeStyle = C.gloomPath;
    g.lineWidth = 2;
    for (const p of obs.forecast.gloomPaths) {
      const from = obs.entities.find((e) => e.id === p.id);
      if (!from || p.next.length === 0) continue;
      g.beginPath();
      g.moveTo(from.pos.x * TILE + TILE / 2, from.pos.y * TILE + TILE / 2);
      for (const q of p.next) g.lineTo(q.x * TILE + TILE / 2, q.y * TILE + TILE / 2);
      g.stroke();
    }
    g.setLineDash([]);
    g.lineWidth = 1;

    // Gloomlings
    for (const e of obs.entities) {
      if (e.kind !== 'gloomling') continue;
      const p = this.posOf(`e${e.id}`, now) ?? e.pos;
      const cx = p.x * TILE + TILE / 2;
      const cy = p.y * TILE + TILE / 2;
      spiky(g, cx, cy, 12, 7, 9, C.gloom);
      g.fillStyle = '#fff';
      g.fillRect(cx - 5, cy - 3, 3, 3); g.fillRect(cx + 2, cy - 3, 3, 3);
      pips(g, cx, cy - 15, e.hp ?? 0, '#d7b8ff');
    }

    // Pending action preview
    const me = obs.actors.find((a) => a.id === opt.selfId);
    if (me && opt.pending) {
      g.strokeStyle = opt.locked ? 'rgba(95,184,255,0.4)' : '#5fb8ff';
      g.lineWidth = 2;
      if (opt.pending.t === 'move') {
        const d = DIR_VEC[opt.pending.dir];
        g.strokeRect((me.pos.x + d.x) * TILE + 3, (me.pos.y + d.y) * TILE + 3, TILE - 6, TILE - 6);
      } else if ('target' in opt.pending) {
        const tid = opt.pending.target;
        const t = obs.entities.find((e) => e.id === tid);
        if (t) g.strokeRect(t.pos.x * TILE + 2, t.pos.y * TILE + 2, TILE - 4, TILE - 4);
      }
      g.lineWidth = 1;
    }

    // Actors
    for (const a of obs.actors) {
      const p = this.posOf(`a${a.id}`, now) ?? a.pos;
      const cx = p.x * TILE + TILE / 2;
      const cy = p.y * TILE + TILE / 2;
      const isMe = a.id === opt.selfId;
      g.fillStyle = isMe ? C.you : C.ally;
      g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#0b0b10'; g.lineWidth = 2; g.stroke(); g.lineWidth = 1;
      if (isMe && obs.self.status === 'dimmed') {
        g.setLineDash([2, 3]); g.strokeStyle = '#fff';
        g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
      label(g, isMe ? 'Y' : `B${a.id}`, cx, cy + 4, 11, '#0b0b10');
      if (a.carrying) diamond(g, cx + 10, cy - 10, 5, C.ember);
      pips(g, cx, cy + 15, a.hp, '#ff7a7a');
    }
  }
}

function diamond(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.7, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.7, y); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke();
}

function flame(g: CanvasRenderingContext2D, x: number, y: number, hgt: number) {
  g.fillStyle = '#ff9d2e';
  g.beginPath(); g.moveTo(x - 6, y); g.quadraticCurveTo(x, y - hgt * 2, x + 6, y); g.closePath(); g.fill();
  g.fillStyle = '#ffe28a';
  g.beginPath(); g.moveTo(x - 3, y); g.quadraticCurveTo(x, y - hgt, x + 3, y); g.closePath(); g.fill();
}

function spiky(g: CanvasRenderingContext2D, x: number, y: number, ro: number, ri: number, n: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = (i / (n * 2)) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath(); g.fill();
  g.strokeStyle = '#2b1550'; g.stroke();
}

function pips(g: CanvasRenderingContext2D, cx: number, y: number, n: number, color: string) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = color;
    g.fillRect(cx - n * 3 + i * 6, y - 1, 4, 3);
  }
}

function label(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = C.text) {
  g.font = `bold ${size}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
