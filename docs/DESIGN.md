# Lanternfall: Final Design

Status: **accepted baseline for implementation** · Supersedes: `proposal-claude.md`, `proposal-codex.md`
Inputs: `BRIEF.md`, both proposals, `review-by-codex.md`, `review-by-claude.md`.
Changes to this document after M1 go through short ADRs in `docs/adr/`.

---

## 1. Name and concept

**Lanternfall.** The world above has gone dark. Crews of **Lanterners**, human and AI, go down into
**the Deep**, a tile-grid cavern. They mine **Ember**, carry it home to keep the central **Hearth**
burning, light **Beacons** to push back the dark, and hold out against **Gloom** creatures that come
in forecast **Surges**.

The theme and identity come from Lanternfall (Claude). Light is a resource, territory, vision and
safety all at once. The rules model comes from Relay Frontier (Codex): **simultaneous, deterministic
rounds on an integer grid**. Everyone submits one action per round, then the engine resolves them all
together. That keeps human, rule-bot and LLM seats equal by construction.

Pacing is chosen per match. Tactical rounds have no timer and resolve on lock-in. Live rounds
auto-advance every ~400 ms, which feels close to real time for keyboard players. The engine is the
same in both cases. Only the session coordinator's deadline policy changes.

- **View:** top-down 2D, 32 px tiles, flat shapes with readable silhouettes; light/dark shown with
  symbols and brightness, never colour alone. **Audience:** one human with bot teammates, plus
  hot-seat humans. **Session:** 8–15 min; tutorial under 5 min.
- **Out of scope:** persistent worlds, accounts, paid services, required external AI, public
  community scripts (until a sandbox design exists).

## 2. Core loop

```
Plan/act (one action per actor per round) → Resolve simultaneously → Animate events
   ↑                                                                   ↓
Next round ← Forecast (next Surge, Gloom paths, hazards) ← Fuel/upkeep/light update
```

**Rules (M1 values; all of them are data and tunable):**

- **Movement:** 4-directional, one tile per round. Walls block it. An actor carries at most one
  item, which is Ember.
- **Lantern fuel:** each actor has 20 fuel. It drops by 1 for each round the actor ends outside light,
  and refills completely when the actor ends a round in Hearth or Beacon light. At 0 fuel the actor
  is *Dimmed*: it can only move, and only every other round.
- **Hearth:** starts with 30 fuel and burns 1 every 2 rounds. Each Ember delivered adds 5. At 0 the
  match is lost.
- **Veins:** a `mine` action next to a vein produces 1 Ember into the actor's hands. Each vein holds
  3–6 Ember and then runs out. Veins **do not replenish**. The near ones are small and the rich ones
  are out in the dark. That is the pull outward.
- **Beacons (M2):** cost 3 Ember, light a radius of 3, and need upkeep (1 Ember per 10 rounds). They
  extend the safe zone, but Gloom attacks them. Building more Beacons makes it easier to reach far
  Ember but leaves more ground to defend. That trade-off between expanding and defending is the
  core dilemma.
- **Gloomlings:** they appear at marked dark-edge spawn points. Each Surge is announced 5 rounds
  ahead with its direction. A Gloomling moves 1 tile per round along a **displayed path** toward the
  nearest lit structure, and only every other round on lit tiles. Next to a structure it drains 3
  fuel per round. Next to an actor it deals 1 HP. Gloomlings have 2 HP.
- **Actors:** 3 HP. A `strike` deals 1 to an adjacent Gloomling. An actor at 0 HP is *Snuffed*: it drops
  its Ember and respawns at the Hearth after 3 rounds. There is no permanent elimination.

**Example co-op sequence (checked in M2 acceptance):** a Surge is forecast from the west. The human
pings "hold" at the west choke. The Warden bot's label changes to *"Holding west choke (your ping)"*
and it strikes Gloomlings there, while the human ferries Ember from the rich east vein. The Hearth
survives because each made the other's job possible. No role is required, so a weak or missing bot
never blocks progress.

## 3. Modes and order

Every mode is a `ModeRules` plugin over the shared engine. Every slot can be a local human, a bot, an
LLM agent (M4+) or a remote human (M7+). Modes ship in this order:

1. **Hold the Light** (co-op, 1–4). Keep the Hearth alive through N Surges (M1: 3, full: 8).
   *M1 vertical slice, M2 complete.*
2. **Ember Rush** (2 teams of 1–4). Mirrored map. The team with the most Ember delivered to its own
   lift wins, at 12 points or by most after 40 rounds. Both teams face Gloom. Carried Ember cannot be
   stolen. Ties go to up to 3 overtime rounds, then a draw. *M3.*
3. **Lightkeepers** (team territory). 5 Beacon sites. A lit, owned site gives 1 point every 3 rounds.
   An adjacent enemy can snuff a site for 1 round. Opposing claims in the same round fail. *M5.*
4. **The Dimming** (hidden role, 4–6). Co-op on the surface, but one seat is a secret Hollow who wins
   if the Hearth goes out. A discussion/vote phase runs between Surges. Every controller type has the
   **same communication channel**: canned pings plus capped free text, and humans can type too.
   Local play only (one human plus bots/LLMs), because hidden information isn't safe on peer clients.
   *M6.*
5. **Backlog (not promised):** Deepvault (Relay Frontier's Vault Shift, re-themed as a shifting-maze
   free-for-all with paired switches), Delve (multi-floor roguelite), cosmetic meta-progression.

## 4. Roles

| Role   | Ability                                                    | Trade-off                  | Ships |
|--------|------------------------------------------------------------|----------------------------|-------|
| Warden | `ability`: shield, adjacent allies take no damage for 2 rounds (cd 4) | Lantern radius 1  | M2 |
| Scout  | `ability`: Flare, reveals radius 6 for 3 rounds (cd 8)     | 2 HP                       | M2 |
| Smith  | Beacons cost 2 Ember. `repair` restores 5 Beacon fuel      | No `strike` bonus          | M2 |
| Medic  | `ability`: Kindle, +1 HP and full lantern to allies within 2 (cd 6) | Strikes deal 0 on odd rounds | M5 |

M1 uses only a baseline Lanterner. Roles change capabilities but never the action protocol.

## 5. AI-player interface (`src/protocol/types.ts`)

Principles:
- **Same seat, same rules.** Every controller produces the same `Decision`, and the engine only sees
  validated `Action`s.
- **Fog-respecting observations.** These are built per actor, immutable, and JSON-only. Unseen tiles,
  enemy orders, secrets, RNG state and controller data are left out. Events and chat are filtered too.
- **Orders are persistent.** A controller can set a multi-round `Order`. A deterministic executor
  turns it into one action per round, **using only that actor's `Observation`**, so remembered terrain
  is allowed but the true map is not. That reduces LLM calls and also gives humans click-to-path.
- **Types are not a trust boundary.** `src/protocol/validate.ts` checks shape, bounds, legality and
  string lengths at runtime for every decision from every controller.

```ts
export const PROTOCOL_VERSION = 1 as const;
export type ActorId = number;            // stable slot index 0..7
export type EntityId = number;           // monotonic, never reused within a match
export type TeamId = number;
export type Dir = 'N' | 'E' | 'S' | 'W';
export type Pos = Readonly<{ x: number; y: number }>;   // integer tile coords
export type ModeId = 'hold' | 'rush' | 'keepers' | 'dimming';
export type RoleId = 'lanterner' | 'warden' | 'scout' | 'smith' | 'medic';
export type BuildKind = 'beacon' | 'barricade';

/** Exactly one per actor per round. */
export type Action =
  | { t: 'wait' }
  | { t: 'move'; dir: Dir }
  | { t: 'strike'; target: EntityId }
  | { t: 'mine'; target: EntityId }
  | { t: 'pickup'; target: EntityId }
  | { t: 'drop' }
  | { t: 'deliver'; target: EntityId }          // Hearth, Beacon, lift
  | { t: 'build'; kind: BuildKind; at: Pos }
  | { t: 'repair'; target: EntityId }
  | { t: 'ability'; at?: Pos };

/** Persistent multi-round goals, expanded by the executor until done or impossible. */
export type Order =
  | { t: 'goTo'; at: Pos }
  | { t: 'gather'; vein?: EntityId }            // mine → carry → deliver loop
  | { t: 'guard'; at: Pos; radius: number }     // radius ≤ 4
  | { t: 'follow'; who: ActorId }
  | { t: 'refuel' }
  | { t: 'build'; kind: BuildKind; at: Pos };

/** Free, at most one per actor per round. Same limit for humans and bots. */
export type Ping = { kind: 'help' | 'goHere' | 'hold' | 'gather' | 'danger'; at: Pos };

export type Observation = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  matchId: string;
  round: number;
  mode: Readonly<{ id: ModeId; phase: string; roundsLeft: number | null;
                   scores: Readonly<Record<TeamId, number>> }>;
  self: Readonly<{ id: ActorId; team: TeamId; role: RoleId; pos: Pos; hp: number; fuel: number;
                   carrying: 'ember' | null; cooldown: number; status: 'ok' | 'dimmed' | 'snuffed';
                   order: Order | null; secret?: Readonly<{ hollow: boolean }> }>;
  /** Compact grid, one char per tile: '#' wall, '.' floor, '?' never seen, etc. (legend in rules). */
  map: Readonly<{ w: number; h: number; terrain: readonly string[]; lit: readonly string[];
                  visible: readonly string[] }>;    // visible: '1' currently seen, '0' remembered/unknown
  actors: readonly Readonly<{ id: ActorId; team: TeamId; role: RoleId; pos: Pos; hp: number;
                              carrying: 'ember' | null; label?: string }>[];  // allies always; enemies if visible
  entities: readonly Readonly<{ id: EntityId; kind: string; pos: Pos; hp?: number;
                                amount?: number; fuel?: number; owner?: TeamId }>[];  // visible only
  forecast: Readonly<{ surgeInRounds: number | null; from?: Dir;
                       gloomPaths: readonly Readonly<{ id: EntityId; next: readonly Pos[] }>[] }>;
  team: Readonly<{ ember: number; orders: Readonly<Record<ActorId, Order | null>> }>;
  pings: readonly Readonly<{ from: ActorId; ping: Ping; round: number }>[];   // allied, last 5 rounds
  events: readonly Readonly<{ round: number; text: string; kind: string }>[]; // since last obs, filtered
  chat: readonly Readonly<{ from: ActorId; text: string; round: number }>[];  // modes with chat only
  legal: Readonly<{ move: readonly Dir[]; strike: readonly EntityId[]; mine: readonly EntityId[];
                    pickup: readonly EntityId[]; deliver: readonly EntityId[];
                    repair: readonly EntityId[]; build: readonly Readonly<{ kind: BuildKind;
                    at: readonly Pos[] }>[]; ability: boolean; drop: boolean }>;
}>;

export type DecisionRequest = Readonly<{
  requestId: string;                 // `${matchId}:${round}:${actorId}`
  observation: Observation;
  decisionSeed: number;              // hash32(matchSeed, round, actorId), PRNG = sfc32 v1
  budget: Readonly<{ nodes: number; deadlineMs: number | null }>; // deadlineMs null in tests/Tactical-bots
}>;

export type Decision = Readonly<{
  requestId: string;
  action?: Action;                   // this round; omitted → use order/fallback
  order?: Order | null;              // replace persistent order; null clears it
  ping?: Ping;
  say?: string;                      // ≤ 140 chars, only in modes with chat; rendered as text
  label?: string;                    // ≤ 48 chars visible intent, e.g. "Gathering east vein"
}>;

export interface ControllerContext {
  actorId: ActorId; modeId: ModeId;
  rulesText: string;                 // human-readable rules + legend for LLM prompts
}

export interface Controller {
  readonly id: string;               // 'human:local', 'bot:warden@1', 'llm:anthropic', 'remote:ws'
  readonly kind: 'human' | 'bot' | 'llm' | 'remote';
  init?(ctx: ControllerContext): void | Promise<void>;
  /** Built-in bots return synchronously and deterministically. Others may be async. */
  decide(req: DecisionRequest, signal: AbortSignal): Decision | Promise<Decision>;
  dispose?(): void;
}

/** What the replay stores per actor per round. */
export type AcceptedAction = Readonly<{
  actor: ActorId; action: Action; ping?: Ping;
  source: 'controller' | 'order' | 'fallback' | 'idle';
}>;
```

### 5.1 Round protocol (`src/session/coordinator.ts`)

1. Freeze the round-start state. For each actor, build an `Observation` and issue a `DecisionRequest`
   with a unique `requestId`. Abort any outstanding request from earlier rounds.
2. Collect decisions until **all seats have answered** (Tactical) or the **round deadline** passes
   (Live, default 400 ms). In Tactical, LLM seats get up to 10 s. Wall-clock deadlines only apply
   to live play. Headless and test runs use `deadlineMs: null` and bots are limited by `nodes`, so
   results never depend on machine speed.
3. Reject a reply if its `requestId` is stale, it is a duplicate, it arrives late, it is malformed,
   or its action is illegal. Rejected replies are counted and shown in a debug overlay.
4. Each actor's action is, in priority order: the controller's valid `action`; else the executor's
   next step for the current `order`; else, for AI seats, the **companion rule bot**
   (`source: 'fallback'`, small UI icon), or `wait` for human seats (`source: 'idle'`). This is the
   one fallback path for every failure type.
5. `step(state, accepted)` resolves the round. The `AcceptedAction[]` and `hashState()` are
   appended to the replay.

When a controller changes (takeover, disconnect, LLM enabled mid-match), the change happens at a
round boundary.

### 5.2 Local bots (now)

These are utility bots. Each one scores candidate Orders (gather, guard Hearth, refuel, strike threat,
answer ping, build) using JSON personality weights (`cautious`, `greedy`, `support`). The executor
turns the chosen Order into a step using BFS on the observed and remembered grid. Ties are broken by
`decisionSeed`. Bots never call `Math.random`. Difficulty comes from node budget, weight quality and
how strongly bots respond to pings. Every difficulty gets the same rules and vision. Bots publish a
`label` so their intent is always visible.

M1 ships `bot:helper@1` (gather/deliver/guard). M2 adds one bot per role. M3 adds Rush bots. Built-in
bots run on the main thread in M1, then in a Worker from M3. Community bot scripts are **out of
scope** until we have a Worker-sandbox ADR. Same-origin JS could read engine state, so filtered
observations are an API discipline, not a security boundary.

### 5.3 LLM agents later, with no secrets in the frontend

LLM support is opt-in and lazy-loaded (`src/controllers/llm/`). The default build makes zero
external calls.

- **Provider-neutral:** `LLMProvider { complete(req, signal): Promise<LLMResult> }`. Implementations:
  `anthropic` (direct browser access via the `anthropic-dangerous-direct-browser-access` header);
  `openai-compatible` (covers **local Ollama / LM Studio on localhost**, the free keyless path; CORS
  depends on user configuration); `fake` (scripted, for tests).
- **Keys:** the user enters their own key. It is **held in memory only**, cleared on reload and by
  a "forget" button, and the UI says it must be re-entered after a reload. It is never written to
  storage, URLs, logs, replays, error messages or exports. There are **no `VITE_*` secrets, ever.**
- **Page hardening:** zero third-party scripts and pinned dependencies. A `<meta http-equiv>` CSP
  restricts `connect-src` to `'self'`, allow-listed provider origins and `http://localhost:*`.
  Pages can't set headers, so `frame-ancestors` isn't available.
- **Prompt:** the system prompt is `rulesText` plus the role card plus the `Decision` schema. The user
  message is the compact `map` rows, the entity list and the grouped `legal`. Replies use structured
  output and go through `validate.ts`. Chat and other players' text are quoted as untrusted data.
- **Cost and latency:** the LLM normally sets **Orders** and is called again only when its order
  completes or becomes invalid, a Surge starts, a ping arrives, or the salient-observation hash
  changes, with a floor of one call every 3 rounds. Each match has a request cap (default 150) and a
  visible counter. The UI says provider use may cost money.
- **Separate backend (`remote` controller, later):** WebSocket `{type:'request', DecisionRequest}` →
  `{type:'decision', Decision}`. The backend is self-hosted, keeps its own keys, and must authenticate
  and rate-limit requests so it doesn't become an open proxy. The client stores only its URL.
  Third-party bots in any language can join this way.
- CI never calls a real provider. Fake-provider tests cover timeouts, malformed JSON, illegal
  targets, stale replies, the request cap, and logs/replays with no secrets in them.

## 6. Tech architecture

- **Vite + strict TypeScript, npm**, one committed lockfile, `npm ci` in CI.
- **Rendering: Canvas2D for M1–M3, no engine dependency.** Maps are small, moves are discrete, and
  tweening between round snapshots is trivial. Light is radial gradients composited on an offscreen
  canvas. This keeps M1 tiny and avoids fighting a framework's loop. No renderer-abstraction layer:
  the only rule is that `view/` reads snapshots/events and never mutates state. Re-evaluate PixiJS
  or Phaser via ADR **only if** profiling or animation needs justify it (expected M5+).
- **UI:** plain TS + DOM outside the canvas (menus, lobby, HUD, planner, key dialog). Everything is
  keyboard-accessible and scales with text size.
- **Input:** keys or clicks become a pending `Action`, or an `Order` via click-to-path. In Live mode
  the last input before the deadline counts and a held direction repeats. Tactical mode allows undo
  until lock.
- **Deploy:** `vite build` with `base` from `BASE_PATH` env (default `/ai-coop-game/`), hash routing,
  and a GitHub Actions workflow running lint → typecheck → test → build → `actions/deploy-pages`.
  `gitleaks` runs on every PR **from M1**. Offline revisits need a service worker, which is deferred
  to M7. "Works offline" means only that no runtime APIs are required.
- **Online (M7, optional):** a `Transport` interface with an in-memory loopback from M3. The first online
  target is a **self-hosted authoritative Node WebSocket server** running the same `src/engine`. It
  validates slot ownership and sends per-actor filtered observations. It is never part of the Pages
  build and there are no promises of free hosting. WebRTC P2P lockstep may be offered as
  **trusted-friends only**, never for hidden-information modes.

### 6.1 Repo layout

```
src/
  engine/        PURE: no DOM/canvas/fetch/async/clock. Runs in Node, Workers and the browser.
    state.ts       GameState: plain JSON (number[] grids, integer fields)
    step.ts        step(state, accepted, rules) -> { state, events }
    rng.ts         sfc32 with versioned seeding; state lives in GameState
    hash.ts        canonical serialization + FNV-1a 32
    resolve/       movement, combat, economy, light, gloom, build (fixed phase order)
    modes/         hold.ts, rush.ts, keepers.ts, dimming.ts  (ModeRules plugins)
    observe.ts     buildObservation(state, actorId): fog, memory, secret & event filtering
    legal.ts       legal action sets
  protocol/      types.ts (§5), validate.ts, version.ts
  session/       coordinator.ts, pacing.ts, replay.ts (record/export/import), transport.ts
  controllers/
    human/         keyboard/pointer → Decision
    executor.ts    Order → Action (observation-only BFS)
    bots/          utility bots + personalities/*.json
    llm/           providers, prompt builder, LLMController (lazy chunk, M4)
    remote/        RemoteController (lazy chunk, M7)
  content/       maps/*.json, roles.ts, creatures.ts, mapcheck.ts (reachability/2-wide validator)
  view/          Canvas2D renderer, tweens, light layer, forecast overlays
  ui/            DOM screens: menu, lobby/roster, HUD, planner, settings, key dialog
  app/           main.ts bootstrap, wiring
tests/           unit/, golden/ (replay fixtures + expected hashes), e2e/ (Playwright)
tools/           arena.ts (headless bot matches), check-determinism.ts
docs/            DESIGN.md, adr/
```

Boundaries are enforced with ESLint `import/no-restricted-paths`: `engine` imports only `protocol`
types; `view`, `ui` and `controllers` never import `engine/resolve`.

## 7. Determinism and testing

**Engine contract:** integer-only state (clamp anything that could overflow; no bitwise ops on
values that can exceed 2^31). No `Math.random`, `Date.now`, `performance.now` or `Map`/`Set`
iteration in `engine/` (lint-banned). Iterate in ascending id order; new entities take the next id.

**Fixed resolution order per round**
1. Validate every action against the round-start snapshot.
2. Movement. Several actors targeting one tile all fail. Allies may swap; opposing swaps fail. A
   move into an actor that stays put fails, and the failure propagates back through the chain.
3. Strikes: applied simultaneously, with adjacency checked after movement.
4. Mine, pickup, deliver, build, repair. Contested pickups all fail. Shared Ember is spent in
   ascending actor id order. Builds become active next round.
5. Gloom phase (move along forecast path, then attack). 6. Light, fuel, upkeep, Hearth burn.
7. Snuff/respawn. 8. Spawns per forecast. 9. Mode hooks `onRoundEnd`, `checkEnd`. 10. Next forecast.

Every rule is a table-driven unit test.

**Anti-body-block:** `mapcheck` rejects any map without a 2-wide route to every scoring or delivery
site. Generated maps also have to pass reachability, spawn-safety and Ember-viability checks, with a
known-good fallback map.

**Replay contract**
- Header: `engineVersion`, `protocolVersion`, `contentHash`, `seed`, `mode`, roster. Body: one
  `AcceptedAction[]` and state hash per round, plus a checkpoint snapshot every 50 rounds.
- Replaying an accepted-action log is deterministic. A **live** match is not reproducible from the
  seed alone, because async and human timing changes which actions get accepted. This is expected.
- Imports are size-capped and schema-validated. A version mismatch gives a clear error instead of
  diverging silently. Replays never contain keys or free-text LLM prompts (`say` text is kept, capped).

**Test layers**
1. Unit tests (Vitest): rules tables, contention, observation filtering, legality, validators,
   executor.
2. Golden replays: fixtures with expected per-round hashes. CI fails on any unreviewed hash change.
3. `tools/check-determinism.ts`: runs each golden scenario twice, shuffles controller-response
   arrival order, round-trips state through serialization mid-match, and walks the state to assert
   integers only (no `NaN`, `undefined` or floats).
4. Observation leak tests: everything in an observation must be justified by vision, memory, ally
   status or ownership. Events, chat and `legal` are covered too.
5. Arena: headless N seeded bot-only matches per mode (`npm run arena -- --mode hold --n 200`). All
   must terminate without invalid state. Win and timing stats are written to JSON for balance work.
6. E2E (Playwright, M2+): build served under the subpath, start a match, play scripted inputs, reach
   an end screen.
7. Performance budgets on a documented reference laptop: `step` < 4 ms and a bot decision < 20 ms
   at 8 actors on 48×48. 16 actors on 64×64 is a stretch target only.

## 8. Milestones

Each milestone ends with a playable Pages build, green CI, and a cross-review.

**M1: Vertical slice (Hold the Light, 1 human + 1 bot)**
- *Scope:* scaffold (Vite/TS/npm, ESLint boundary and global bans, Vitest, Pages workflow,
  gitleaks); engine with the full resolution order but only move, mine, carry/deliver, strike,
  lantern fuel, Hearth burn, Gloomlings with forecast paths and 3 Surges; one hand-built, fully
  visible 16×16 map; protocol types and validator; coordinator with Tactical and Live pacing;
  `bot:helper@1` with labels; Canvas2D view; HUD (HP, fuel, carried, Hearth, surge countdown);
  restart and end screen.
- *Accept:* a person on the Pages subpath URL finishes a match with the bot (win or lose) in both
  pacings. The bot gathers, delivers and guards during Surges on its own. A golden replay reproduces
  its final hash and the determinism checker passes. Lint shows `engine/` has no DOM/view imports.
  100 headless bot-only matches terminate. No key or service needed.

**M2: Complete co-op**
- *Scope:* Hold the Light with 8 Surges; Beacons with upkeep; fog/light vision with team memory;
  Warden, Scout, Smith and one bot per role; Orders plus click-to-path; ping wheel with bots
  acknowledging via labels; lobby/roster editor (human/bot/difficulty/role); 2-human hot-seat; two
  hand-built maps plus tutorial; accessibility (symbols plus colour, reduced motion, scalable text,
  pause).
- *Accept:* 1 human + 3 bots can win both maps. The §2 ping sequence passes as an e2e test. Leak
  tests pass with fog on. Playwright subpath smoke test passes. A fresh tester finishes the
  tutorial unaided.

**M3: Competition and tooling**
- *Scope:* Ember Rush (teams, private team orders, bot opponents, overtime/tie rules); bots in a
  Worker; loopback `Transport`; replay viewer with JSON export/import; Arena CLI with stats.
- *Accept:* a human+bot vs bot match completes. Simultaneous-scoring and overtime tests pass.
  Observations never contain enemy orders or pings. 200 arena matches per mode terminate. Live
  match replays match their logged hashes.

**M4: LLM agents (opt-in)**
- *Scope:* `llm` controller with anthropic, openai-compatible (local) and fake providers;
  memory-only key dialog; meta CSP; request cap UI; Order-based call throttling; fallback icon.
- *Accept:* fake-provider tests pass for timeout, malformed, illegal, stale and cap cases.
  Automated scans of bundle, logs and replays find no keys. Fully playable with LLMs disabled. A
  manual check with a local Ollama model completes a Hold match.

**M5: Breadth**
- *Scope:* Lightkeepers and the Medic; seeded procedural caverns gated by `mapcheck`; bot
  personalities tuned via the Arena; performance pass against the §7 budgets.
- *Accept:* every generated test seed passes `mapcheck` or falls back to the known-good map. All 3
  modes playable with mixed rosters. Budgets met on the reference device.

**M6: The Dimming (local)**
- *Scope:* hidden-role setup and secret-filtered observations; discussion/vote phase with an equal
  chat channel for all seat types; Hollow and crew rule bots; LLM Hollow support.
- *Accept:* leak tests prove crew observations, events and chat never reveal the Hollow. A 1 human
  + 4 bots/LLMs match completes. Chat is text-only and length-capped.

**M7: Online (optional, self-hosted) and release hardening**
- *Scope:* authoritative Node WS server running `engine/`; room codes and short-lived seat tokens;
  reconnect; bot takeover of a disconnected slot after 1 round; `remote` controller; service worker
  for offline revisits; balance and accessibility review; contributor protocol docs.
- *Accept:* two browsers finish a Hold room and a Rush room on the self-hosted server. Unauthorized
  seat submissions are rejected. The Pages build still works fully standalone.

## 9. Decisions log

### Adopted from Lanternfall (Claude proposal)
Name, theme and the light/Ember/Hearth/Gloom economy (both reviews preferred this identity); the
Hold the Light, Ember Rush, Lightkeepers and Dimming modes (reordered and deferred) and the four
roles; intents, reworked as persistent **Orders** with an executor; companion-bot fallback;
ping-to-command bots; JSON bot personalities; headless Arena; lint bans, `import/no-restricted-paths`,
gitleaks, "no `VITE_` secrets", ADRs; `Transport` loopback; local OpenAI-compatible provider and the
named Anthropic CORS header.

### Adopted from Relay Frontier (Codex proposal)
**Simultaneous discrete rounds on an integer grid** (replacing the 10 Hz fixed-point sim); explicit
contention/tie rules and a fixed phase order; `requestId`, `AbortSignal`, stale/duplicate rejection
and coordinator-enforced deadlines; `decisionSeed`, legal actions, versioned JSON wire types and
runtime validation; replays of accepted actions with versioned headers and checksums; a small M1
with acceptance gates; hand-built maps first, then a validated generator with a fallback map;
visible teammate intentions, forecast hazards and the untimed (Tactical) option; accessibility from
the start; competition with no stealing of carried items and no permanent elimination; an
authoritative server boundary for online play; Vault Shift kept as backlog mode "Deepvault".

### Review points: accepted
| Point (source) | Resolution |
|---|---|
| Use the round model for equal AI seats (Claude review) | Adopted. Live pacing keeps the action feel Codex's review wanted to preserve |
| Keep the intent executor for slow LLMs (Codex review) | Adopted as Orders. The executor reads only the actor's Observation (Codex: executor must not cheat) |
| Replay logs actions, not intents (Codex review) | Adopted (`AcceptedAction`, with `source`) |
| Live outcomes aren't seed-reproducible (Codex review) | Stated explicitly in §7 |
| Specify the refuel/vein economy and expand-vs-defend tension (Codex review) | §2: veins don't replenish, Beacons need upkeep, refuelling only in light |
| Show a concrete human↔bot cooperation sequence (Codex review) | §2 example, checked by an M2 e2e test |
| No mandatory role dependencies (Codex review) | Roles are optional boosts |
| Add an antagonist and real threat (Claude review) | Gloomlings with forecast paths and Surges |
| Fog/light early (Claude review) vs fog only with UI coverage (Codex) | Fog in M2, with leak tests. M1 is fully visible |
| Pacing tools (Claude review) | Live pacing, Orders, auto-resolve when all seats have submitted |
| Compact LLM observation (Claude review) | String-row map, grouped `legal` |
| One fallback path (Claude review) | Companion bot for AI seats, `wait` for humans |
| Wall-clock deadlines cause flaky tests (Claude review) | `deadlineMs: null` + node budget in tests and headless runs |
| `decisionSeed` formula and PRNG version (Claude review) | `hash32(seed, round, actor)`, sfc32 v1 |
| Body-block exploit (Claude review) | `mapcheck` guarantees 2-wide routes. Opposing swaps fail |
| Memory-only keys, no "remember" option (Codex review) | Adopted |
| Meta CSP, zero third-party scripts, text-only model output (both) | Adopted |
| Filtered observations aren't a sandbox (Codex review) | Community scripts out of scope pending an ADR |
| Equal communication channels for The Dimming (Codex review) | Humans get free-text chat too. Mode deferred to M6 |
| P2P can't protect hidden information (Codex review) | P2P only for trusted friends. Authoritative server for online |
| Split LLM work from online work (Claude review) | M4 LLM, M7 online |
| Modest performance targets and profile-first (Codex review) | §7 budgets. The 160×160/300-creature target is dropped |
| Pick one competitive follow-up, Ember Rush (Codex review) | M3 |
| IndexedDB migrations can wait (Claude review) | JSON export/import only |
| "Offline" needs a caching strategy (Codex review) | Service worker deferred to M7. Wording qualified |
| Gitleaks from M1, not M4 (Codex review) | Adopted |
| npm (Codex review) | Adopted |

### Review points: rejected or modified
| Point | Decision and reason |
|---|---|
| Keep a continuous real-time sim (Codex review rec. 1) | Rejected. Rounds give equal seats, simpler determinism and no fixed-point maths. Live pacing gets most of the feel back. We revisit only if M1 playtests show Live rounds feel bad |
| PixiJS (Claude proposal) / Phaser (Codex proposal, Claude review) | Both deferred. Canvas2D is enough for M1–M3 and keeps the dependency surface at zero. Revisit via ADR when profiles demand it |
| 10 vs 20 Hz question | Moot under rounds. Live round length is tuned in M1 (250–1000 ms) |
| Optional sessionStorage "remember for this tab" (Claude review) | Deferred. Memory-only until users report friction. It would need an ADR |
| WebRTC commit–reveal before a server (Claude review) | Deferred to an M7 experiment. It doesn't solve hidden information |
| Storms destroy unshielded cargo on hard difficulty (Claude review) | Modified: being Snuffed drops Ember on the floor, which can be recovered. Nothing is ever destroyed |
| `wait` as the universal fallback (Codex proposal) | Rejected for AI seats in favour of the companion bot. Kept for human seats |
| Six modes, meta-progression, Delve, public bot ladder as commitments (Claude proposal) | Rejected as commitments. Kept in the backlog |
| Renderer abstraction for swaps (Claude proposal) | Rejected (Codex review). Only the read-only view rule applies |
| One action per tick, with move/attack/ping competing (Claude proposal) | Modified: one action per round, plus one free `Ping` per round for everyone |

## 10. Ownership

Claude has much more quota, so **Claude owns the bulk of implementation**. Codex owns review and small,
well-bounded tasks that are easy to verify on their own. Every PR is reviewed by the other agent.
Any change to `src/protocol/` or to the §7 resolution order needs Codex sign-off.

| Area | Owner | Notes |
|---|---|---|
| Scaffold, Vite config, Pages workflow | Claude | M1 |
| `engine/` (state, step, resolve/*, modes/*, observe, legal, rng) | Claude | All modes |
| `protocol/types.ts`, `session/` (coordinator, pacing, replay, transport) | Claude | Codex reviews protocol |
| `controllers/` (human input, executor, all bots, LLM controller and providers, remote) | Claude | |
| `view/` (Canvas2D, light layer, overlays) and `ui/` (all DOM screens, HUD, lobby, key dialog) | Claude | |
| `content/` maps, roles, creatures, tutorial; procedural mapgen | Claude | |
| `tools/arena.ts`, balance passes, performance work, online server (M7) | Claude | |
| **Design reviews** of every ADR and each milestone plan | Codex | Before implementation starts |
| **Code reviews** of every Claude PR | Codex | Focus on determinism, protocol and security |
| `tools/check-determinism.ts` (double-run, shuffled arrival, serialize round-trip, integer walk) | Codex | M1 |
| ESLint config: boundary rules, determinism bans in `engine/` | Codex | M1 |
| `engine/hash.ts` canonical serialization + FNV-1a, with tests | Codex | M1 |
| `protocol/validate.ts` test suite (fuzzed malformed/oversized/illegal decisions) | Codex | M1. Claude writes the validator |
| Movement/contention rules test tables (§7 resolution order) | Codex | M1–M2 |
| `content/mapcheck.ts` (reachability, 2-wide routes, spawn safety) | Codex | M2. Small isolated utility |
| Observation leak test suite (fog M2, team privacy M3, Hollow M6) | Codex | Grows per milestone |
| Replay import validation and fuzz tests | Codex | M3 |
| Fake LLM provider + adapter failure suite; secret-scan check over bundle/replays/logs | Codex | M4 |
| Gitleaks/CSP CI checks | Codex | M1 / M4 |

Workflow: small PRs, each with tests. Before parallel work starts, both agents agree on
`protocol/types.ts` and one tiny golden replay fixture; Codex's suites then target that contract
while Claude implements against it. If a Codex-owned test fails against Claude's code, Claude fixes
the code (or both agree an ADR to change the rule). Neither side weakens a test unilaterally.
