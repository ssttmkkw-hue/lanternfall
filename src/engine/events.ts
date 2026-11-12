import type { ActorId } from '../protocol/types';

export interface EngineEvent {
  round: number;
  kind: string; // 'move-failed' | 'fizzle' | 'strike' | 'gloom-slain' | 'deliver' | 'mine' | ...
  text: string;
  actor?: ActorId;
}
