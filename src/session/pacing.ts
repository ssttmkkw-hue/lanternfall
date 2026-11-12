/** Pacing policy. M1 ships Tactical; Live (deadline + flush) is gated behind Tactical acceptance (DESIGN §8). */
export type Pacing = { kind: 'tactical' } | { kind: 'live'; roundMs: number };
export const TACTICAL: Pacing = { kind: 'tactical' };

/** Per-controller-kind timeouts in ms (null = none). Built-in bots are synchronous and never time out. */
export const CONTROLLER_TIMEOUT_MS = { human: null, bot: null, llm: 10_000, remote: 10_000 } as const;
