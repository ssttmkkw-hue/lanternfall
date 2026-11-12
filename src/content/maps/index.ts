import type { MapDef } from '../../engine/state';
import { HOLD_M1_MAP } from './hold-m1';

export const MAPS: Readonly<Record<string, MapDef>> = { [HOLD_M1_MAP.id]: HOLD_M1_MAP };
export { HOLD_M1_MAP };
