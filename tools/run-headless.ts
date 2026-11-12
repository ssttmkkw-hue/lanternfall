// Tiny seeded bot-only runner (DESIGN §8 M1.4). No clock; results never depend on machine speed.
// Usage: npm run headless -- --seed 1 --n 100 [--bots 2] [--replay out.json]
import { writeFileSync } from 'node:fs';
import { HelperBot } from '../src/controllers/bots/helper';
import { walkIntegers } from '../src/engine/check';
import { HOLD_M1 } from '../src/engine/modes/hold';
import { createMatch } from '../src/session/match';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : def;
}

async function main(): Promise<number> {
  const seed0 = Number(arg('seed', '1'));
  const n = Number(arg('n', '1'));
  const bots = Number(arg('bots', '2'));
  const replayPath = arg('replay', '');
  if (!Number.isInteger(seed0) || !Number.isInteger(n) || n < 1 || !Number.isInteger(bots) || bots < 1 || bots > 8) {
    console.error('usage: run-headless --seed <int> --n <int> [--bots 1..8] [--replay file]');
    return 2;
  }
  const tally: Record<string, number> = {};
  let bad = 0;
  for (let k = 0; k < n; k++) {
    const seed = seed0 + k;
    const { coordinator, recorder } = createMatch({ seed, controllers: Array.from({ length: bots }, () => new HelperBot()) });
    let problem = '';
    while (!coordinator.over) {
      const out = await coordinator.playRound();
      const ints = walkIntegers(out.state);
      if (ints.length > 0) { problem = `invalid state at round ${out.round}: ${ints.slice(0, 3).join('; ')}`; break; }
      if (out.round > HOLD_M1.roundCap) { problem = `round cap overrun (${out.round})`; break; }
    }
    const s = coordinator.state;
    const result = problem ? 'INVALID' : s.result ?? 'none';
    tally[result] = (tally[result] ?? 0) + 1;
    if (problem) bad++;
    console.log(`seed=${seed} result=${result} rounds=${s.round} hearth=${s.hearth.fuel} hash=${recorder.toJSON().rounds.at(-1)?.hash ?? '-'}${problem ? ' ' + problem : ''}`);
    if (replayPath && k === 0) writeFileSync(replayPath, recorder.serialize());
  }
  console.log(`summary: ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' ')} (n=${n})`);
  return bad > 0 ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
