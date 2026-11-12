// Runtime validation of every Decision from every controller. Types are not a trust boundary.
import type { Action, ActionType, Decision, LegalSet, Order, Ping } from './types';

export const LIMITS = { say: 140, label: 48, requestId: 128, guardRadius: 4 } as const;
export const M1_ORDER_KINDS: readonly Order['t'][] = ['goTo', 'gather', 'guard'];

export interface ValidateContext {
  requestId: string;
  legal: LegalSet;
  allowList: readonly ActionType[];
  orderKinds?: readonly Order['t'][];
  chat: boolean;
  w: number;
  h: number;
}

export type ValidateResult = { ok: true; decision: Decision } | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const DIRS = ['N', 'E', 'S', 'W'];
const PING_KINDS = ['help', 'goHere', 'hold', 'gather', 'danger'];

function onlyKeys(o: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(o).every((k) => keys.includes(k));
}

function posOk(v: unknown, ctx: ValidateContext): v is { x: number; y: number } {
  return isObj(v) && onlyKeys(v, ['x', 'y']) && isInt(v.x) && isInt(v.y) && v.x >= 0 && v.y >= 0 && v.x < ctx.w && v.y < ctx.h;
}

/** Shape-checks an action and returns a clean copy, or a reason string. */
export function parseAction(v: unknown, ctx: ValidateContext): Action | string {
  if (!isObj(v) || typeof v.t !== 'string') return 'action: not an object with t';
  const t = v.t;
  if (!ctx.allowList.includes(t as ActionType)) return `action: '${t}' not allowed in this mode`;
  const target = () => (isInt(v.target) && v.target >= 0 ? v.target : null);
  let a: Action;
  switch (t) {
    case 'wait':
    case 'drop':
      if (!onlyKeys(v, ['t'])) return 'action: extra keys';
      a = { t };
      break;
    case 'move':
      if (!onlyKeys(v, ['t', 'dir']) || typeof v.dir !== 'string' || !DIRS.includes(v.dir)) return 'action: bad move';
      a = { t, dir: v.dir as 'N' | 'E' | 'S' | 'W' };
      break;
    case 'strike':
    case 'mine':
    case 'pickup':
    case 'deliver':
    case 'repair': {
      const tg = target();
      if (!onlyKeys(v, ['t', 'target']) || tg === null) return `action: bad ${t} target`;
      a = { t, target: tg };
      break;
    }
    case 'build':
      if (!onlyKeys(v, ['t', 'kind', 'at']) || (v.kind !== 'beacon' && v.kind !== 'barricade') || !posOk(v.at, ctx)) return 'action: bad build';
      a = { t, kind: v.kind, at: { x: v.at.x, y: v.at.y } };
      break;
    case 'ability':
      if (!onlyKeys(v, ['t', 'at']) || (v.at !== undefined && !posOk(v.at, ctx))) return 'action: bad ability';
      a = v.at === undefined ? { t } : { t, at: { x: (v.at as { x: number }).x, y: (v.at as { y: number }).y } };
      break;
    default:
      return `action: unknown type '${t}'`;
  }
  return a;
}

export function actionInLegal(a: Action, legal: LegalSet): boolean {
  switch (a.t) {
    case 'wait': return true;
    case 'move': return legal.move.includes(a.dir);
    case 'strike': return legal.strike.includes(a.target);
    case 'mine': return legal.mine.includes(a.target);
    case 'pickup': return legal.pickup.includes(a.target);
    case 'deliver': return legal.deliver.includes(a.target);
    case 'repair': return legal.repair.includes(a.target);
    case 'drop': return legal.drop;
    case 'build': return legal.build.some((b) => b.kind === a.kind && b.at.some((p) => p.x === a.at.x && p.y === a.at.y));
    case 'ability': return legal.ability;
  }
}

export function parseOrder(v: unknown, ctx: ValidateContext): Order | string {
  if (!isObj(v) || typeof v.t !== 'string') return 'order: not an object with t';
  const kinds = ctx.orderKinds ?? M1_ORDER_KINDS;
  if (!kinds.includes(v.t as Order['t'])) return `order: '${v.t}' not supported`;
  switch (v.t) {
    case 'goTo':
      if (!onlyKeys(v, ['t', 'at']) || !posOk(v.at, ctx)) return 'order: bad goTo';
      return { t: 'goTo', at: { x: v.at.x, y: v.at.y } };
    case 'gather':
      if (!onlyKeys(v, ['t', 'vein']) || (v.vein !== undefined && !(isInt(v.vein) && v.vein >= 0))) return 'order: bad gather';
      return v.vein === undefined ? { t: 'gather' } : { t: 'gather', vein: v.vein as number };
    case 'guard':
      if (!onlyKeys(v, ['t', 'at', 'radius']) || !posOk(v.at, ctx) || !isInt(v.radius) || v.radius < 0 || v.radius > LIMITS.guardRadius) return 'order: bad guard';
      return { t: 'guard', at: { x: v.at.x, y: v.at.y }, radius: v.radius };
    case 'follow':
      if (!onlyKeys(v, ['t', 'who']) || !isInt(v.who) || v.who < 0 || v.who > 7) return 'order: bad follow';
      return { t: 'follow', who: v.who };
    case 'refuel':
      return onlyKeys(v, ['t']) ? { t: 'refuel' } : 'order: bad refuel';
    case 'build':
      if (!onlyKeys(v, ['t', 'kind', 'at']) || (v.kind !== 'beacon' && v.kind !== 'barricade') || !posOk(v.at, ctx)) return 'order: bad build';
      return { t: 'build', kind: v.kind, at: { x: v.at.x, y: v.at.y } };
    default:
      return 'order: unknown';
  }
}

function parsePing(v: unknown, ctx: ValidateContext): Ping | string {
  if (!isObj(v) || !onlyKeys(v, ['kind', 'at']) || typeof v.kind !== 'string' || !PING_KINDS.includes(v.kind) || !posOk(v.at, ctx)) return 'ping: malformed';
  return { kind: v.kind as Ping['kind'], at: { x: v.at.x, y: v.at.y } };
}

/** Validates shape, bounds, allow-list, round-start legality and string lengths. */
export function validateDecision(raw: unknown, ctx: ValidateContext): ValidateResult {
  if (!isObj(raw)) return { ok: false, reason: 'malformed: not an object' };
  if (!onlyKeys(raw, ['requestId', 'action', 'order', 'ping', 'say', 'label'])) return { ok: false, reason: 'malformed: unknown keys' };
  if (typeof raw.requestId !== 'string' || raw.requestId.length > LIMITS.requestId) return { ok: false, reason: 'malformed: requestId' };
  if (raw.requestId !== ctx.requestId) return { ok: false, reason: 'stale: requestId mismatch' };
  const out: { requestId: string; action?: Action; order?: Order | null; ping?: Ping; say?: string; label?: string } = { requestId: raw.requestId };
  if (raw.action !== undefined) {
    const a = parseAction(raw.action, ctx);
    if (typeof a === 'string') return { ok: false, reason: `malformed: ${a}` };
    if (!actionInLegal(a, ctx.legal)) return { ok: false, reason: `illegal: ${a.t} not in legal set` };
    out.action = a;
  }
  if (raw.order !== undefined) {
    if (raw.order === null) out.order = null;
    else {
      const o = parseOrder(raw.order, ctx);
      if (typeof o === 'string') return { ok: false, reason: `malformed: ${o}` };
      out.order = o;
    }
  }
  if (raw.ping !== undefined) {
    const p = parsePing(raw.ping, ctx);
    if (typeof p === 'string') return { ok: false, reason: `malformed: ${p}` };
    out.ping = p;
  }
  if (raw.say !== undefined) {
    if (!ctx.chat) return { ok: false, reason: 'malformed: say not allowed in this mode' };
    if (typeof raw.say !== 'string' || raw.say.length > LIMITS.say) return { ok: false, reason: 'malformed: say' };
    out.say = raw.say;
  }
  if (raw.label !== undefined) {
    if (typeof raw.label !== 'string' || raw.label.length > LIMITS.label) return { ok: false, reason: 'malformed: label' };
    out.label = raw.label;
  }
  return { ok: true, decision: out };
}
