// Local human seat. Tactical: pending input stays local; decide() resolves once, on Lock (DESIGN §5.1).
import type { Action, Controller, Decision, DecisionRequest, Ping } from '../../protocol/types';
import { actionInLegal } from '../../protocol/validate';

type Listener = () => void;

export class HumanController implements Controller {
  readonly id = 'human:local';
  readonly kind = 'human' as const;
  private req: DecisionRequest | null = null;
  private resolveFn: ((d: Decision) => void) | null = null;
  private pendingAction: Action | null = null;
  private pendingPing: Ping | undefined;
  private listeners: Listener[] = [];

  /** Current open request (null while waiting for the next round). */
  get request(): DecisionRequest | null { return this.req; }
  get pending(): Action | null { return this.pendingAction; }
  get awaitingLock(): boolean { return this.resolveFn !== null; }

  onChange(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }
  private emit() { for (const l of this.listeners) l(); }

  decide(req: DecisionRequest, signal: AbortSignal): Promise<Decision> {
    this.req = req;
    this.pendingAction = null;
    this.pendingPing = undefined;
    return new Promise<Decision>((resolve, reject) => {
      this.resolveFn = resolve;
      signal.addEventListener('abort', () => {
        if (this.req?.requestId === req.requestId) { this.resolveFn = null; this.req = null; this.emit(); }
        reject(new Error('aborted'));
      }, { once: true });
      this.emit();
    });
  }

  /** Sets the local pending action (only legal ones are accepted). Returns false if illegal. */
  setPending(action: Action | null): boolean {
    if (!this.req) return false;
    if (action && !actionInLegal(action, this.req.observation.legal)) return false;
    this.pendingAction = action;
    this.emit();
    return true;
  }

  setPing(ping: Ping | undefined): void { this.pendingPing = ping; this.emit(); }

  /** Undo: clears the pending choice (only before Lock). */
  undo(): void { this.setPending(null); }

  /** Lock is final for the round. With nothing pending, the human waits. */
  lock(): boolean {
    if (!this.req || !this.resolveFn) return false;
    const d: Decision = {
      requestId: this.req.requestId,
      action: this.pendingAction ?? { t: 'wait' },
      ...(this.pendingPing ? { ping: this.pendingPing } : {}),
    };
    const r = this.resolveFn;
    this.resolveFn = null;
    this.req = null;
    this.pendingAction = null;
    this.pendingPing = undefined;
    r(d);
    this.emit();
    return true;
  }

  dispose(): void { this.resolveFn = null; this.req = null; this.listeners = []; }
}
