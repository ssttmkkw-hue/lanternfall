# Proposal: **Lanternfall** — a human + AI co-op/competitive browser game

Author: Claude · Status: draft for cross-review with Codex · Source brief: `docs/BRIEF.md`

---

## 1. Concept

The world has gone dark. Below the surface lies **the Deep**, a cavern network that is randomly generated
for each run and fills with **Gloom**, a creeping darkness that spawns creatures and dims light.
Players are **Lanterners**: small crews who go down, gather **Ember** (fuel and currency),
light **Beacons** to claim and protect ground, and get back out before their lanterns run dry.

- **View:** top-down 2D on a tile grid (32 px tiles). Readable pixel or vector art. Light radius is the
  main visual and gameplay element: what you can see, what you can reach, what monsters avoid.
- **Why it suits human + AI play:** the game state is discrete and turns into structured data easily
  (tiles, entities, light levels). Decisions are spatial and strategic, so you don't need twitch
  reflexes. An AI that thinks every ~1 s can still play well. Roles (Scout, Warden, Smith, Medic)
  give AI and humans different jobs that work together.
- **Tone:** cozy-tense. Expect "we're nearly out of light, run!" moments rather than gore.
- **Session length:** 8–20 minutes per match. Easy to start, deep through roles, upgrades and modes.

## 2. Core gameplay loop

```
Descend → Explore (light reveals map) → Gather Ember → Spend: light Beacons / craft / upgrade
   ↑                                                              ↓
Meta-progress (unlocks, cosmetics)  ←  Extract / Win condition  ←  Defend vs Gloom surges
```

**Moment to moment (each tick, 10 Hz sim):** move on the grid (8-direction, sub-tile positions in
fixed-point), interact (mine an Ember vein, pick up, drop, give an item to an ally), use your role
ability, and attack (melee arc or ranged spark).

**Minute to minute:** your **lantern fuel** drains over time and drains faster outside Beacon light.
Beacons cost Ember. They create safe zones and refuel players, and the Gloom attacks them. Every 90 s or so
a **Surge** comes: Gloom pushes in from the dark edges and the team has to hold its Beacons.

**Match to match:** you earn **Cinders** (meta currency, stored only in localStorage) and spend them
to unlock roles, lantern mods and map biomes. AI bots use the same unlock pool, so a "bot loadout"
is a real decision.

### Roles (M1 has Scout + Warden; others come later)

| Role   | Ability (cooldown)                                   | Weakness             |
|--------|------------------------------------------------------|----------------------|
| Scout  | Flare: briefly reveals a large radius (20 s)         | Low HP, small lantern |
| Warden | Bulwark: stops Gloom spread in a cone (15 s)         | Slow                 |
| Smith  | Builds and repairs Beacons/walls at half Ember cost  | No ranged attack     |
| Medic  | Kindle: heals and refuels allies in radius (25 s)    | Low damage           |

## 3. Modes (all of them allow any mix of humans and AI)

Every mode is a `ModeRules` plugin on top of one shared engine (see §5.3). A slot is either
`human-local`, `human-remote` (future), or `ai:<botId>`.

1. **Hold the Light (co-op PvE, 1–4 players):** the team has to keep the central Hearth Beacon
   alive through N Surges (default 8) while expanding outward for Ember. You lose if the Hearth goes out.
   Solo human + 3 bots is the main way to play at launch. *M1 mode.*
2. **Ember Rush (competitive, 2 teams of 1–4):** two crews start on opposite sides of a mirrored map.
   Most Ember extracted at the lift by the timer wins. You can steal from enemy carts, and both
   teams face Gloom. Human+AI vs human+AI, or 1 human vs 1 bot for a duel.
3. **Lightkeepers (team territory control):** the map has 5 Beacon sites. Holding a lit Beacon
   gives points per second. Beacons can be "snuffed" by standing in them unopposed. This plays like
   king-of-the-hill. Bots matter here for map-wide coverage.
4. **The Dimming (hidden-role social mode, 4–6):** everyone looks like a co-op crew, but one player
   (human or AI) is secretly a **Hollow** who wins if the Hearth goes out. There's a public
   "ping/accuse" panel with canned messages, and LLM agents can also send free-text chat. This mode is
   where LLM agents become really interesting (bluffing, deduction). Rule bots play it using heuristics.
5. **Delve (co-op roguelite, stretch):** a chain of 5 floors with between-floor shops and boss
   creatures. It reuses everything above.
6. **Arena: Bot Ladder (AI vs AI, spectator):** headless matches run at max speed, used for bot
   tuning, regression tests and a public "bot leaderboard" for user-submitted rule scripts later.

Modes 1–3 use the same map generator with different presets. Mode 4 adds an information-hiding
layer, which the observation model already supports (see §4.2).

## 4. AI participation model

### 4.1 Principles

- **Same seat, same rules.** An AI controls a player slot only through the same `Action` input a
  human controller produces. The engine can't tell the difference, so there's no cheating
  through engine access.
- **Fog-respecting observations.** AI gets a per-player `Observation` built by the engine.
  It never gets the raw `GameState`, so hidden roles and dark tiles stay hidden.
- **Async-tolerant.** The sim never waits for an AI. A slow agent (LLM, ~0.5–5 s) issues
  **intents** that last across ticks, and a local deterministic **executor** turns them into
  per-tick actions. Fast bots can act every tick.
- **No secrets in the frontend bundle, ever.** See §4.5.

### 4.2 Core TypeScript types (`src/ai/types.ts`)

```ts
export type PlayerId = number;          // slot index 0..7
export type Tick = number;
export type Vec = { x: number; y: number };   // tile coords (fixed-point in engine, ints here)

/** Per-tick low-level input — identical for humans and bots. */
export type Action =
  | { kind: 'move'; dir: Dir8 | null }
  | { kind: 'interact'; target?: EntityRef }
  | { kind: 'attack'; aim: Vec }
  | { kind: 'ability'; aim?: Vec }
  | { kind: 'give'; to: PlayerId; item: ItemKind }
  | { kind: 'build'; what: Buildable; at: Vec }
  | { kind: 'ping'; at: Vec; msg: PingKind }
  | { kind: 'noop' };

/** Higher-level, multi-tick goals. Expanded by the local Executor. */
export type Intent =
  | { kind: 'goTo'; at: Vec }
  | { kind: 'gather'; near?: Vec }
  | { kind: 'defend'; target: EntityRef; radius: number }
  | { kind: 'attackNearest'; within: number }
  | { kind: 'build'; what: Buildable; at: Vec }
  | { kind: 'follow'; who: PlayerId }
  | { kind: 'retreat' }
  | { kind: 'say'; text: string }              // chat; length-capped, mode-gated
  | { kind: 'raw'; action: Action };           // escape hatch for fast bots

export interface Observation {
  tick: Tick;
  self: { id: PlayerId; team: number; role: RoleId; pos: Vec; hp: number; fuel: number;
          inventory: Record<ItemKind, number>; cooldowns: Record<string, number>;
          secret?: { hollow: boolean } };          // only present for the owner
  visibleTiles: { origin: Vec; w: number; h: number; tiles: Uint8Array; light: Uint8Array };
  entities: EntityView[];                          // only lit/visible ones
  allies: AllyView[];                              // positions known via shared light
  mode: { id: ModeId; phase: string; timeLeft: number; score: Record<number, number> };
  events: GameEvent[];                             // since this agent's last observation
  chat: ChatLine[];
}

export interface AgentContext {
  playerId: PlayerId;
  modeId: ModeId;
  rulesSummary: string;     // human-readable text, used by LLM prompts
  rng: () => number;        // seeded per agent so local bots are deterministic
}

export interface AIPlayer {
  readonly id: string;               // 'rule:warden-v1', 'llm:anthropic', ...
  readonly cadence: { minTicksBetweenDecisions: number; async: boolean };
  init(ctx: AgentContext): void | Promise<void>;
  /** Sync bots return immediately; async agents return a Promise the host does not await. */
  decide(obs: Observation): Intent[] | Promise<Intent[]>;
  dispose?(): void;
}
```

### 4.3 Turn / tick protocol

- The engine runs at a **fixed 10 ticks/s** (rendering interpolates at display refresh rate).
- The `AgentHost` (one per AI slot) runs each tick:
  1. If `tick - lastDecisionTick >= cadence.minTicksBetweenDecisions` and nothing is pending:
     build `Observation`, call `decide`.
  2. **Sync agent** (`async: false`): intents are applied **in the same tick**. Rule bots use
     cadence 1–5. They are fully deterministic, so they're safe for replays and lockstep.
  3. **Async agent**: the promise resolves at some later tick T'. Its intents are queued and applied
     at the **next tick boundary** after resolution, and stamped with `issuedAtTick`, which goes
     into the input log. Replays use the logged intents, not the agent, so replays stay deterministic.
  4. **Timeout/fallback:** if an async decision takes longer than `maxLatencyTicks` (default 50 = 5 s),
     the slot falls back to its **companion rule bot** for that period. That way an LLM player never
     just stands there.
  5. The `Executor` turns the current intent stack into one `Action` per tick using
     A* on the tile grid (cached flow fields for common targets), plus simple steering.
- Every slot produces an `Action` per tick. Those actions are the **only input to `step()`**.

### 4.4 Local rule-based bots (now)

- **Architecture:** a small utility-AI. Each bot scores candidate intents
  (`gather`, `defend hearth`, `retreat to refuel`, `attack threat`, `build beacon`), using weights
  from a JSON personality profile (`cautious`, `greedy`, `support`). Values are tunable in the Arena mode.
- **Difficulty** = decision cadence + perception noise (seeded) + weight quality.
  `easy` = 10-tick cadence, ±2-tile aim jitter. `hard` = 2-tick cadence with no jitter.
- **Team awareness:** bots read ally pings and respond to `ping: 'help' | 'here' | 'gather'`, so a
  human can command bots by pinging without needing any chat UI.
- M1 ships `rule:warden-v1` and `rule:scout-v1` for Hold the Light. Later milestones add one bot per
  role and per mode (Ember Rush raider, Lightkeeper holder, Dimming Hollow/crew).

### 4.5 LLM adapter (later): no secrets in the frontend

There are two adapters behind the same `AIPlayer` interface:

**A. `BrowserLLMAgent` (bring your own key, browser only)**
- The user pastes their own API key into a settings dialog. It's stored in `sessionStorage` by default,
  with an opt-in "remember on this device" checkbox that moves it to `localStorage`. There's a clear
  "forget key" button. The key is never written to the repo, URL, logs, replays or telemetry.
- Requests go straight from the browser to the provider's API, using providers that allow browser CORS
  with explicit opt-in headers (e.g. Anthropic's `anthropic-dangerous-direct-browser-access`).
  This works fine for a static site. The UI warns that browser extensions on the page could read the key.
- Provider-neutral: `LLMProvider { complete(req): Promise<LLMResponse> }`. Implementations for
  Anthropic and an OpenAI-compatible endpoint. The latter also covers **local** models (Ollama /
  LM Studio on `localhost`), which are free and need no key.
- Prompting: system prompt = `rulesSummary` + role card + JSON schema for `Intent[]`. User message =
  compact text rendering of the `Observation` (ASCII mini-map of visible tiles plus an entity list).
  Use tool calling / structured output for the reply. Replies are validated with a zod schema.
  Invalid output → companion bot fallback.
- Cost/latency guard: cadence ≥ 20 ticks (2 s). Per-match token budget shown to the user. Calls are
  skipped if the observation hasn't changed meaningfully (hash of the salient fields).

**B. `RemoteAgent` (separate backend, optional, later)**
- WebSocket protocol: `{type:'obs', tick, obs}` → `{type:'intents', tick, intents}`.
- The backend (anyone can self-host; not part of the Pages deploy) holds its own keys server-side.
  The frontend only stores a backend URL. This is also how third-party bots written in Python
  etc. can join.

Both adapters are optional, lazy-loaded chunks. The default build works fully offline with rule bots.

## 5. Technical architecture

### 5.1 Stack

- **Vite + TypeScript (strict)**, ES modules, `pnpm` (or npm if Codex prefers; decide in M1).
- **Rendering: PixiJS v8.** Reasoning: we need a fast WebGL 2D renderer with sprites, tilemaps, filters
  (for light/fog shaders) and a small API surface. **Phaser** comes with its own scene loop, physics and
  timing, and that fights against a separately owned deterministic sim. We'd only use a fraction of it.
  Raw Canvas2D would make the lighting/fog layer and large maps slow. Pixi only draws, which is
  exactly the separation we want. (Fallback: if the Pixi bundle size becomes a concern, the renderer
  interface lets us swap it out.)
- **UI chrome** (menus, lobby, settings, key dialog): plain TS + lightweight DOM (or Preact if it grows).
  It sits outside the canvas for accessibility.
- **Testing:** Vitest for engine/AI unit tests. Golden-replay tests (see §5.3). Playwright smoke test
  on the built site (M3+).
- **Lint:** ESLint with a `no-restricted-globals` rule that bans `Math.random`, `Date.now`,
  `performance.now` in `src/engine/**`.

### 5.2 Source layout

```
src/
  engine/      # PURE deterministic sim — no DOM, no Pixi, no async. Runs in Node & Workers.
    state.ts       GameState (plain data, serialisable)
    step.ts        step(state, actions[], rules) -> { state, events }
    rng.ts         seeded PRNG (xoshiro128**), state stored in GameState
    fixed.ts       fixed-point math (16.16 ints)
    mapgen/        cellular-automata caverns + seeded feature placement
    systems/       movement, light, gloom, combat, economy, building
    modes/         holdTheLight.ts, emberRush.ts, lightkeepers.ts, dimming.ts
    observe.ts     buildObservation(state, playerId) — fog & secret filtering
  ai/
    types.ts       (§4.2)
    host.ts        AgentHost: cadence, async queue, timeout fallback
    executor.ts    Intent -> Action (A*, flow fields)
    bots/          rule bots + personality JSON
    llm/           BrowserLLMAgent, providers, prompt builders (lazy chunk)
    remote/        RemoteAgent (lazy chunk)
  render/        # PixiJS: reads state snapshots, interpolates; never mutates state
  input/         # keyboard/gamepad/touch -> Action
  ui/            # DOM menus, lobby, HUD overlays
  net/           # (M5+) transports & sync
  app/           # bootstrap, game loop driver, worker wiring
```

### 5.3 Deterministic engine, separate from rendering

- `GameState` is plain JSON-serialisable data: entity arrays (struct-of-arrays for hot data), the tile
  grid as `Uint8Array`, and RNG state. No classes with hidden state, no Maps that iterate in insertion order
  across peers, no floating point in sim logic (fixed-point only). Order of iteration = entity id.
- `step()` is a pure function of `(state, actions, rules)`. `ModeRules` hooks: `setup`, `onTick`,
  `onEvent`, `isOver`, `score`, `observeFilter`.
- **Input log + seed = full replay.** `hashState()` (FNV-1a over the canonical buffer) every 30 ticks.
  CI runs golden replays and fails if a hash changes unexpectedly. Hash mismatch detection is also
  the desync check later for netplay.
- The loop driver runs the sim in a **Web Worker** (M3+). The main thread only renders snapshots and sends
  inputs. That keeps rendering smooth when maps are large or there are many bots. In M1 it can run on the main thread
  behind the same interface.
- Render interpolation: the renderer holds `prev` and `curr` snapshots and lerps by `alpha`.

### 5.4 Static deploy to GitHub Pages

- `vite build` with `base: '/<repo-name>/'` (configurable through an env var). Hash-based routing (no server
  rewrites). All assets are bundled, nothing calls an API at runtime unless the user opts in to an LLM.
- GitHub Actions workflow: `pnpm i && pnpm test && pnpm build` → `actions/deploy-pages`. Free tier only.
- Secret hygiene: `.gitignore` includes `.env*`, CI runs `gitleaks` (free) on PRs, and there are no `VITE_*`
  keys at all. Anything prefixed `VITE_` ends up in the bundle, so the policy is "never".

### 5.5 Multiplayer networking path (future, staged)

Because the engine is deterministic and the only inputs are per-tick `Action`s:

1. **Stage 0 (now):** local only. Hot-seat on the same keyboard/gamepad for 2 humans plus bots.
2. **Stage 1, P2P lockstep over WebRTC:** peers exchange only actions, with a 2–3 tick input delay.
   Signaling via manual copy-paste of an offer/answer (zero infra) or a free public signaling option. AI
   bots run on the **host** only, and their actions are broadcast like a human's. That keeps bots
   deterministic and means LLM keys stay with whoever owns the bot. Desync detection via
   `hashState`.
3. **Stage 2, host-authoritative relay:** for >4 players or bad connections, one peer is
   authoritative and sends snapshot deltas, and clients do prediction plus reconciliation for their
   own avatar.
4. **Stage 3, optional dedicated server:** the same `src/engine` runs unchanged in Node (no DOM
   dependencies) behind a WebSocket server. This is also where `RemoteAgent` backends plug in. It's
   self-hosted and optional, never required for the Pages build.

The `Transport` interface (`send(msg)`, `onMessage`) is defined in M4 so the local loop already goes
through it (as a loopback transport). Adding networking later shouldn't need a refactor.

## 6. Scalability plan

**Content scale:** roles, enemies, buildables, items and biomes are **data-driven** (typed JSON/TS
definition tables validated at load). Adding a new enemy = a data entry + an optional behaviour
function, with no engine edits. Modes are plugins (§5.3), and adding one doesn't touch existing ones.

**Simulation scale:** target 8 players + 300 active creatures + 160×160 tile maps at 10 Hz in
under 4 ms per tick on a mid-range laptop.
- Spatial hash grid for proximity queries. Flow fields shared by all creatures heading to the same
  target (e.g. the Hearth), so cost doesn't grow with creature count.
- Light/Gloom computed on a coarse grid and updated incrementally (dirty regions).
- Struct-of-arrays for creatures, with an object pool in the renderer.
- Sim in a Worker (M3). Benchmarks in CI (`vitest bench`) with a regression threshold.

**Rendering scale:** chunked tilemap (16×16 chunks cached as render textures), view-frustum culling,
one light/fog pass as a shader on a low-res light texture, sprite atlases.

**AI scale:** rule bots are cheap (budget ≤0.2 ms per bot per decision). The executor shares the
pathfinding cache. LLM agents are bounded by cadence and token budget. Arena mode runs headless in
Node for batch evaluation (thousands of matches for tuning).

**Team/code scale (two AI devs):** strict module boundaries (`engine` must not import from `render`/`ui`,
enforced with an ESLint `import/no-restricted-paths` rule). Small PRs, each with tests. Every PR
cross-reviewed by the other agent. Architecture decisions recorded as short ADRs in `docs/adr/`.

## 7. Milestones

Each milestone ends with a deployable build, green CI, and a short review by both developers.

### M1: Minimal playable prototype (Hold the Light, 1 human + 1–3 bots)
- Vite + TS + PixiJS scaffold, ESLint/Vitest, GitHub Pages workflow.
- Engine: fixed-tick loop, seeded RNG, fixed-point movement with tile collision, one hand-made
  or simple-generated 48×48 map, lantern fuel, Ember veins, one Hearth Beacon, one creature type
  ("Gloomling") that pathfinds to the Hearth, melee attack, win/lose after 3 Surges.
- AI: `types.ts`, `AgentHost` (sync path only), `Executor` with A*, **`rule:warden-v1` bot**
  (defend Hearth, attack nearest, refuel) and optionally `rule:scout-v1` (gather Ember).
- Render: tiles, sprites as coloured shapes, a simple radial light mask, HUD (HP, fuel, Ember, surge timer).
- Input: WASD/arrow keys + mouse aim + E interact.
- Tests: step determinism (same seed + inputs ⇒ same hash), one golden replay, bot smoke test
  (a 3-bot match with no humans finishes without errors).
- **Done when:** a person can open the Pages URL, play a 5-minute match with a bot ally, and win or lose.

### M2: Roles, building, second mode
- Scout/Warden/Smith/Medic with abilities. Beacons can be built. Procedural cavern mapgen.
- **Ember Rush** (2 teams, human + bots vs bots). Bot per role, utility-AI personalities, difficulty levels.
- Ping wheel (humans command bots). Lobby screen to configure slots (human/bot/difficulty).

### M3: Engine hardening and scale
- Sim moved into a Web Worker. Spatial hash, flow fields, chunked rendering, light shader.
- Perf benchmarks in CI. Replay save/load (export JSON). Arena mode, headless in Node, plus a bot ladder script.
- **Lightkeepers** mode. Playwright smoke test against the built site.

### M4: LLM adapter (bring your own key) and async AI
- `AgentHost` async path, timeout → companion-bot fallback, intents logged into replays.
- `BrowserLLMAgent` with Anthropic and OpenAI-compatible (incl. local Ollama) providers, key dialog
  (sessionStorage by default), token budget UI, zod validation of output.
- `Transport` interface + loopback. Secret-scanning in CI.

### M5: Social mode and online play (P2P)
- **The Dimming** hidden-role mode: secret observation filtering, accusations/voting, chat (free-text for
  LLM agents, canned for rule bots).
- WebRTC lockstep for 2–4 humans + host-run bots. Desync detection and resync from snapshot.
- `RemoteAgent` WebSocket protocol + a reference minimal backend in a separate (non-Pages) folder or repo.

### M6: Content and polish ("large scope" release)
- **Delve** roguelite campaign (multi-floor, shops, 2 bosses). Meta-progression (Cinders, unlocks).
- Art pass (atlas sprites, particle light effects), audio, settings, accessibility (colour-blind light
  palettes, remappable keys, touch controls), localisation scaffolding.
- Host-authoritative relay option for 6–8 players. Public bot ladder docs for community bots.

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Determinism bugs (floats, iteration order) | Fixed-point, lint bans, golden replay hashes in CI from M1 |
| LLM latency makes AI feel dead | Intent + executor model, companion-bot fallback, cadence ≥2 s |
| LLM output invalid or prompt-injected via chat (The Dimming) | Schema validation; chat is treated as data in the prompt and length-capped; intents can only do what a human can |
| Key leakage | Bring your own key in sessionStorage only, no `VITE_` secrets, gitleaks in CI, warning in UI |
| Scope creep | Modes are plugins; M1 is a single mode; each milestone must ship a playable build |
| Two-dev merge conflicts | Module ownership per milestone, ADRs, small PRs, mandatory cross-review |

## 9. Open questions for Codex review

1. Pixi v8 vs Phaser: does Codex see value in Phaser's scene/UI tooling that would outweigh the
   loop/physics conflict?
2. 10 Hz sim: fast enough for melee to feel good with interpolation, or should it be 20 Hz?
3. pnpm vs npm.
4. Proposed split of work for M1: Claude takes `engine/` + `ai/`, Codex takes `render/` + `input/` +
   `ui/` + CI, with the two reviewing each other's PRs.
