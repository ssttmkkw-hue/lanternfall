// Bootstrap: one local human (actor 0) + one helper bot (actor 1), Tactical pacing.
import { HelperBot } from '../controllers/bots/helper';
import { HumanController } from '../controllers/human/human';
import { bindKeyboard } from '../controllers/human/keyboard';
import type { Observation } from '../protocol/types';
import { realClock } from '../session/clock';
import type { Coordinator } from '../session/coordinator';
import { createMatch } from '../session/match';
import type { ReplayRecorder } from '../session/replay';
import { renderHud } from '../ui/hud';
import { Renderer } from '../view/renderer';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board');
const hud = $('hud');
const overlay = $('overlay');
const renderer = new Renderer(canvas);

let coordinator: Coordinator | null = null;
let recorder: ReplayRecorder | null = null;
let human = new HumanController();
let unbindKeys: (() => void) | null = null;
let obs: Observation | null = null;
let log: string[] = [];
let message = '';
let quickLock = true;
let token = 0;

function seedFromHash(): number {
  const m = /seed=(\d+)/.exec(location.hash);
  return m ? Number(m[1]) >>> 0 : newSeed();
}

function refresh() {
  if (!obs || !coordinator) return;
  renderHud(hud, {
    obs, pending: human.pending, awaitingLock: human.awaitingLock, quickLock,
    rosterSize: coordinator.state.actors.length, sources: coordinator.sources, log, message,
  });
}

function showObservation(o: Observation) {
  obs = o;
  renderer.setObservation(o, performance.now());
  for (const e of o.events) log.push(`R${e.round}: ${e.text}`);
  log = log.slice(-50);
  refresh();
}

function endScreen(c: Coordinator) {
  const r = c.state.result;
  const title = r === 'loss' ? 'The Hearth went out' : r === 'win' ? 'Victory: the last Surge is broken' : 'Dawn: the Hearth held';
  overlay.innerHTML = `<div class="card"><h1>${title}</h1>
    <p>Round ${c.state.round} · Hearth fuel ${c.state.hearth.fuel}</p>
    <p><button id="again">Play again</button> <button id="dl">Download replay</button></p></div>`;
  overlay.hidden = false;
  $('again').onclick = () => start(newSeed());
  $('dl').onclick = downloadReplay;
}

// Seed choice is UI-side; the engine itself stays deterministic.
function newSeed() { return Math.floor(Math.random() * 1e9); }

function downloadReplay() {
  if (!recorder) return;
  const blob = new Blob([recorder.serialize()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lanternfall-${recorder.toJSON().header.matchId}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function start(seed: number) {
  const my = ++token;
  coordinator?.dispose();
  unbindKeys?.();
  overlay.hidden = true;
  log = [`Match seed ${seed}. Keep the Hearth burning!`];
  message = '';
  human = new HumanController();
  const m = createMatch({ seed, controllers: [human, new HelperBot()], clock: realClock });
  coordinator = m.coordinator;
  recorder = m.recorder;
  human.onChange(() => {
    if (my !== token) return;
    const req = human.request;
    if (req && req.observation !== obs) {
      message = '';
      showObservation(req.observation);
      // Snuffed: no choices exist, so wait is locked automatically after a short beat.
      if (req.observation.self.status === 'snuffed') {
        setTimeout(() => { if (my === token && human.request?.requestId === req.requestId) human.lock(); }, 350);
      }
    } else refresh();
  });
  unbindKeys = bindKeyboard(window, human, {
    quickLock,
    onMessage: (t) => { message = t; refresh(); },
    onToggleQuickLock: (on) => { quickLock = on; refresh(); },
  });
  const c = coordinator;
  try {
    while (!c.over && my === token) await c.playRound();
  } catch (e) {
    if (my === token) console.error(e);
    return;
  }
  if (my !== token) return;
  showObservation(c.observationFor(0));
  endScreen(c);
}

function frame(now: number) {
  renderer.draw(now, { selfId: 0, pending: human.pending, locked: !human.awaitingLock });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

$('restart').onclick = () => start(newSeed());
$('lock').onclick = () => human.lock();
$('replay').onclick = downloadReplay;
$('begin').onclick = () => { $('intro').hidden = true; void start(seedFromHash()); };
window.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && !$('intro').hidden) { e.preventDefault(); $('begin').click(); }
  // With Shift held, browsers report 'R' (or 'r' under Caps Lock). Ignored while the start card is up.
  if ((e.key === 'R' || e.key === 'r') && e.shiftKey && $('intro').hidden) void start(newSeed());
});
