import { hashValue } from './hash';
import type { GameState } from './state';

/** hashState covers exactly the replayable engine GameState. */
export function hashState(state: GameState): string {
  return hashValue(state);
}

/** Returns paths of every non-integer number / undefined in the state (empty = valid). */
export function walkIntegers(value: unknown, path = '$', out: string[] = []): string[] {
  if (value === undefined) out.push(`${path}: undefined`);
  else if (typeof value === 'number') {
    if (!Number.isInteger(value)) out.push(`${path}: ${value}`);
  } else if (Array.isArray(value)) value.forEach((v, i) => walkIntegers(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) walkIntegers((value as Record<string, unknown>)[k], `${path}.${k}`, out);
  }
  return out;
}
