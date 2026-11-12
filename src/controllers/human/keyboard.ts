// Keyboard → pending Action → Lock. The only DOM-aware piece of the human controller.
import type { Action, Dir, LegalSet } from '../../protocol/types';
import type { HumanController } from './human';

export interface KeyboardOptions {
  /** Action keys lock immediately (one key per round). Enter still locks; toggle with T. */
  quickLock: boolean;
  onMessage(text: string): void;
  onToggleQuickLock(on: boolean): void;
}

const MOVE_KEYS: Record<string, Dir> = {
  ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W',
  w: 'N', d: 'E', s: 'S', a: 'W', W: 'N', D: 'E', S: 'S', A: 'W',
};

export function interactAction(legal: LegalSet): Action | null {
  if (legal.deliver[0] !== undefined) return { t: 'deliver', target: legal.deliver[0] };
  if (legal.mine[0] !== undefined) return { t: 'mine', target: legal.mine[0] };
  if (legal.pickup[0] !== undefined) return { t: 'pickup', target: legal.pickup[0] };
  return null;
}

export function bindKeyboard(target: Window, human: HumanController, opts: KeyboardOptions): () => void {
  let strikeCycle = 0;
  const choose = (a: Action | null, what: string) => {
    if (!human.request) return;
    if (!a || !human.setPending(a)) { opts.onMessage(`Can't ${what} right now.`); return; }
    if (opts.quickLock) human.lock();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.target instanceof HTMLInputElement || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const req = human.request;
    const legal = req?.observation.legal;
    const dir = MOVE_KEYS[ev.key];
    let handled = true;
    if (ev.key === 't' || ev.key === 'T') {
      opts.quickLock = !opts.quickLock;
      opts.onToggleQuickLock(opts.quickLock);
    } else if (!req || !legal) {
      handled = dir !== undefined || ev.key === ' ';
    } else if (dir) {
      choose({ t: 'move', dir }, `move ${dir}`);
    } else if (ev.key === ' ' || ev.key === '.') {
      choose({ t: 'wait' }, 'wait');
    } else if (ev.key === 'e' || ev.key === 'E') {
      choose(interactAction(legal), 'deliver, mine or pick up');
    } else if (ev.key === 'f' || ev.key === 'F') {
      const t = legal.strike.length ? legal.strike[strikeCycle++ % legal.strike.length]! : null;
      choose(t === null ? null : { t: 'strike', target: t }, 'strike (no adjacent Gloomling)');
    } else if (ev.key === 'q' || ev.key === 'Q') {
      choose(legal.drop ? { t: 'drop' } : null, 'drop');
    } else if (ev.key === 'Enter') {
      human.lock();
    } else if (ev.key === 'Backspace' || ev.key === 'z' || ev.key === 'Z') {
      human.undo();
    } else handled = false;
    if (handled) ev.preventDefault();
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
