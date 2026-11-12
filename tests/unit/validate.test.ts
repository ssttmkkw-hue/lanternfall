import { describe, expect, it } from 'vitest';
import { HOLD_M1 } from '../../src/engine/modes/hold';
import type { LegalSet } from '../../src/protocol/types';
import { validateDecision } from '../../src/protocol/validate';

const legal: LegalSet = { move: ['N', 'E'], strike: [7], mine: [], pickup: [], deliver: [], repair: [], build: [], ability: false, drop: false };
const ctx = { requestId: 'm:1:0', legal, allowList: HOLD_M1.allowList, chat: false, w: 16, h: 16 };

describe('validateDecision', () => {
  it('accepts a legal decision and returns a clean copy', () => {
    const r = validateDecision({ requestId: 'm:1:0', action: { t: 'move', dir: 'N' }, label: 'hi', order: { t: 'gather', vein: 3 } }, ctx);
    expect(r).toEqual({ ok: true, decision: { requestId: 'm:1:0', action: { t: 'move', dir: 'N' }, label: 'hi', order: { t: 'gather', vein: 3 } } });
  });

  const bad: [string, unknown][] = [
    ['not an object', 42],
    ['null', null],
    ['array', []],
    ['unknown key', { requestId: 'm:1:0', hack: 1 }],
    ['stale id', { requestId: 'm:0:0' }],
    ['bad dir', { requestId: 'm:1:0', action: { t: 'move', dir: 'NE' } }],
    ['illegal dir', { requestId: 'm:1:0', action: { t: 'move', dir: 'S' } }],
    ['illegal target', { requestId: 'm:1:0', action: { t: 'strike', target: 8 } }],
    ['float target', { requestId: 'm:1:0', action: { t: 'strike', target: 7.5 } }],
    ['extra action key', { requestId: 'm:1:0', action: { t: 'wait', x: 1 } }],
    ['build not in M1', { requestId: 'm:1:0', action: { t: 'build', kind: 'beacon', at: { x: 1, y: 1 } } }],
    ['repair not in M1', { requestId: 'm:1:0', action: { t: 'repair', target: 7 } }],
    ['ability not in M1', { requestId: 'm:1:0', action: { t: 'ability' } }],
    ['drop not legal', { requestId: 'm:1:0', action: { t: 'drop' } }],
    ['label too long', { requestId: 'm:1:0', label: 'x'.repeat(49) }],
    ['say in a no-chat mode', { requestId: 'm:1:0', say: 'hello' }],
    ['order out of bounds', { requestId: 'm:1:0', order: { t: 'goTo', at: { x: 16, y: 0 } } }],
    ['guard radius > 4', { requestId: 'm:1:0', order: { t: 'guard', at: { x: 1, y: 1 }, radius: 5 } }],
    ['follow order not in M1', { requestId: 'm:1:0', order: { t: 'follow', who: 1 } }],
    ['bad ping', { requestId: 'm:1:0', ping: { kind: 'nuke', at: { x: 1, y: 1 } } }],
    ['huge requestId', { requestId: 'x'.repeat(1000) }],
  ];
  it.each(bad)('rejects %s', (_, raw) => {
    expect(validateDecision(raw, ctx).ok).toBe(false);
  });

  it('accepts say ≤ 140 in chat modes and rejects longer', () => {
    expect(validateDecision({ requestId: 'm:1:0', say: 'x'.repeat(140) }, { ...ctx, chat: true }).ok).toBe(true);
    expect(validateDecision({ requestId: 'm:1:0', say: 'x'.repeat(141) }, { ...ctx, chat: true }).ok).toBe(false);
  });

  it('fuzz: random junk never throws and is never accepted with an illegal action', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const atoms = [null, 0, -1, 1.5, 'N', 'm:1:0', true, {}, [], { t: 'move', dir: 'S' }, { t: 'strike', target: 7 }, { x: 1, y: 2 }];
    const pick = () => atoms[Math.floor(rnd() * atoms.length)];
    for (let i = 0; i < 2000; i++) {
      const raw: Record<string, unknown> = { requestId: rnd() < 0.8 ? 'm:1:0' : pick() };
      for (const k of ['action', 'order', 'ping', 'label', 'say']) if (rnd() < 0.4) raw[k] = pick();
      const r = validateDecision(raw, ctx);
      if (r.ok && r.decision.action) expect(['move', 'strike', 'wait']).toContain(r.decision.action.t);
    }
  });
});
