// DOM HUD: HP, fuel, carried, Hearth, surge countdown/direction, respawn timer, teammates, log.
import type { Action, Observation } from '../protocol/types';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function describeAction(a: Action | null): string {
  if (!a) return '—';
  switch (a.t) {
    case 'move': return `Move ${a.dir}`;
    case 'wait': return 'Wait';
    case 'strike': return `Strike #${a.target}`;
    case 'mine': return 'Mine Ember';
    case 'pickup': return 'Pick up Ember';
    case 'deliver': return 'Feed the Hearth';
    case 'drop': return 'Drop Ember';
    default: return a.t;
  }
}

function bar(value: number, max: number, cls: string): string {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return `<div class="bar ${cls}" role="meter" aria-valuenow="${value}" aria-valuemax="${max}"><span style="width:${pct}%"></span><b>${value}/${max}</b></div>`;
}

export interface HudState {
  obs: Observation;
  pending: Action | null;
  awaitingLock: boolean;
  quickLock: boolean;
  rosterSize: number;
  sources: readonly (string | undefined)[];
  log: readonly string[];
  message: string;
}

export function renderHud(el: HTMLElement, s: HudState): void {
  const o = s.obs;
  const me = o.self;
  const hearth = o.entities.find((e) => e.kind === 'hearth');
  const gloom = o.entities.filter((e) => e.kind === 'gloomling').length;
  const surge = o.forecast.surgeInRounds === null
    ? 'All Surges have risen'
    : o.forecast.surgeInRounds === 0
      ? `Surge <b>this round</b> from <b>${o.forecast.from}</b>!`
      : `Next Surge in <b>${o.forecast.surgeInRounds}</b>${o.forecast.from ? ` from <b>${o.forecast.from}</b> ⚠` : ''}`;
  const status = me.status === 'snuffed'
    ? `<span class="warn">Snuffed: back in ${me.respawnIn ?? 0}</span>`
    : me.status === 'dimmed' ? '<span class="warn">Dimmed (move on even rounds)</span>' : 'OK';
  const mates: string[] = [];
  for (let id = 0; id < s.rosterSize; id++) {
    if (id === me.id) continue;
    const a = o.actors.find((x) => x.id === id);
    const src = s.sources[id] === 'fallback' ? ' <span title="fallback bot">⟲</span>' : '';
    mates.push(a
      ? `<li><b>B${id}</b> HP ${a.hp}${a.carrying ? ' · ◆ Ember' : ''}<br><i>${esc(a.label ?? '')}</i>${src}</li>`
      : `<li><b>B${id}</b> <span class="warn">snuffed, respawning</span></li>`);
  }
  el.innerHTML = `
    <section><h2>Round ${o.round} <small>/ ${o.round - 1 + (o.mode.roundsLeft ?? 0)}</small></h2>
      <div>Hearth</div>${bar(hearth?.fuel ?? 0, 60, 'hearth')}
      <p>${surge}. Gloomlings: ${gloom}</p></section>
    <section><h2>You</h2>
      <div>HP</div>${bar(me.hp, 3, 'hp')}
      <div>Lantern fuel</div>${bar(me.fuel, 20, 'fuel')}
      <p>Carrying: ${me.carrying ? '◆ Ember' : 'nothing'} · Status: ${status}</p></section>
    <section><h2>Your action</h2>
      <p class="pending">${s.awaitingLock ? describeAction(s.pending) : '<i>resolving…</i>'}</p>
      <p><small>Quick lock: <b>${s.quickLock ? 'ON' : 'OFF'}</b> (T)</small></p>
      <p class="msg" aria-live="polite">${esc(s.message)}</p></section>
    <section><h2>Team</h2><ul>${mates.join('')}</ul></section>
    <section><h2>Log</h2><ol class="log">${s.log.slice(-8).map((l) => `<li>${esc(l)}</li>`).join('')}</ol></section>`;
}
