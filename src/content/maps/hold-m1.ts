import type { MapDef } from '../../engine/state';

/** Hand-built 16×16 Hold map (DESIGN §2.1.2). 30 Ember total: 6 near the Hearth, 24 out in the dark.
 *  Legend: '#' wall, '.' floor, 'H' hearth, digit = vein amount, w/e/n = spawn points. */
export const HOLD_M1_MAP: MapDef = {
  id: 'hold-m1',
  name: 'The First Hollow',
  rows: [
    '################',
    '#.....nnnn.....#',
    '#.6..........5.#',
    '#...##....##...#',
    '#...#......#...#',
    '#.......3......#',
    '#w............e#',
    '#w............e#',
    '#w......H.....e#',
    '#w............e#',
    '#..........3...#',
    '#...#......#...#',
    '#...##....##...#',
    '#.5..........4.#',
    '#.......4......#',
    '################',
  ],
};
