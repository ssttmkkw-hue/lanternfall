// Regenerates tests/golden/hold-m1-seed1.json. Review the hash diff before committing a change.
import { writeFileSync } from 'node:fs';
import { HelperBot } from '../src/controllers/bots/helper';
import { createMatch } from '../src/session/match';

const { coordinator, recorder } = createMatch({ seed: 1, controllers: [new HelperBot(), new HelperBot()], matchId: 'golden-1' });
await coordinator.runToEnd();
writeFileSync(new URL('../tests/golden/hold-m1-seed1.json', import.meta.url), JSON.stringify(recorder.toJSON(), null, 1) + '\n');
console.log(`golden written: ${recorder.rounds} rounds, result=${coordinator.state.result}`);
