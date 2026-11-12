# Relay Frontier — Game Design Proposal

## 1. Concept and scope

**Relay Frontier** is a tactical browser game about mixed human-and-AI crews restoring a broken energy network on floating industrial islands. Crews move cargo, redirect power, build temporary infrastructure, and survive advancing storms. The same spatial rules support cooperative expeditions, rival delivery teams, and a competitive shifting maze.

The defining interaction is coordination: one player carries a battery while another opens its route and a third holds a switch. AI players occupy real crew slots, receive the same permitted information as humans, and obey the same action costs. Players can win through planning and cooperation rather than reflex speed.

- Presentation: readable 2D top-down grid; flat geometric art, directional arrows, distinct silhouettes, and optional animation.
- Initial audience: solo players with bot teammates and groups sharing one browser; online rooms come later.
- Session target: 10–20 minutes, with a 5-minute tutorial scenario.
- Initial full-game target: 2–8 crew slots, 24×24 maps, three modes, three roles, seeded scenarios, and replays.
- Scope boundary: no persistent MMO world, freeform building, account system, paid services, or required external AI provider.

## 2. Shared rules and core loop

### Board and crew

A tile is floor, wall, conduit, switch, gate, depot, relay, or hazard. Each crew member occupies one tile and carries at most one cargo item. Tiles show their power state and forecast hazards. A crew has a shared stock of scrap; cargo includes batteries and salvage crates.

Roles change capabilities without changing the action protocol:

| Role | Strength | Tradeoff |
| --- | --- | --- |
| Runner | Carry a battery without the normal movement cooldown | Cannot repair a relay alone |
| Engineer | Repair/build for one scrap instead of two | Ordinary carrying movement |
| Warden | Deploy a shield that protects adjacent allies for two rounds | Shield requires three rounds to recharge |

All roles can move, pick up/drop cargo, interact with switches, repair using scrap, and deliver batteries. M1 uses only the baseline crew abilities; roles arrive after the loop works.

### Simultaneous planning rounds

1. Inspect visible tiles, crew intentions, objectives, and the next storm warning.
2. Select one action per controlled crew member; optionally mark a suggested destination for an ally.
3. Lock in actions. Bots submit through the same interface. In local co-op, humans plan sequentially on one device; submissions remain editable until the final lock.
4. Resolve a single deterministic round, then animate its event log.
5. Collect rewards, update power and hazards, and repeat until the mode's victory or defeat condition.

Default planning is untimed for accessibility and debugging. Optional timed rooms use a 15-second planning window; missing actions become `wait`. Teammates see submitted intentions; opponents do not. No actor gets additional information by submitting later.

Resolution order is fixed: validate against the round-start snapshot; movement; cargo transfers; interactions/build/repair; scoring; hazards; cooldowns and next-round forecast. Each actor performs exactly one action. A carrying cooldown makes a baseline carrier wait between moves, while still allowing non-movement actions.

- Movement is orthogonal by one tile. Walls and closed gates block it.
- Multiple actors targeting one tile all remain in place. Swaps are allowed; longer movement cycles are allowed. Moving into a stationary actor fails, with that failure propagated backward through a movement chain.
- Competing cargo claims all fail. Competing exclusive interactions all fail. Cooperative repair contributions sum; excess contributions do not consume scrap.
- Build costs are allocated in stable actor-ID order when shared scrap is insufficient; the preview exposes that order.
- A switch toggled this round changes gates next round, preventing resolution-order surprises.
- Hazards are forecast one round ahead. A hit disables an actor for one round and drops cargo onto its tile. Cargo is never destroyed by an ordinary hit.
- All ties, resource contention, and simultaneous objective completions have explicit rules; wall-clock timing never determines outcomes.

**Example:** a human Runner moves a battery toward a gate, an Engineer bot repairs the connected relay, and a Warden bot holds a switch. The gate opens next round, allowing delivery before the storm reaches the corridor.

## 3. Modes

Every mode supports human-only, bot-only simulation, and mixed human/bot rosters. Local play starts with one human and configurable bots; same-device additional humans use a pass-and-plan screen. Online human slots use the same controller abstraction later.

### A. Storm Convoy — cooperative escort and logistics

- Roster: 2–4 crew, one team; recommended first experience is one human plus two bots.
- Objective: power three relay checkpoints so an autonomous cargo crawler reaches the extraction pad before round 36.
- The crawler advances one tile per round along a fixed marked route when its next checkpoint is powered and the route is clear. It does not occupy a player slot.
- Each checkpoint requires one battery delivery and two repair contributions. Side salvage offers scrap for bridges and shielding.
- Storm damage reduces crawler integrity from six; zero integrity or the round limit ends the mission in defeat. Extraction with positive integrity wins.
- Decisions: split for resources or stay together, protect the crawler or risk a shortcut, repair now or save scrap.
- Variation: seeded routes, optional rescues, storm directions, and battery locations; difficulty changes objective pressure and bot planning depth rather than hidden bonuses.

### B. Relay Rush — competitive team logistics

- Roster: two teams of 2–4; each team may mix humans and bots, including a human team against an all-bot team.
- Objective: earn 12 points first, or lead after 30 rounds. A battery delivered to a neutral relay scores two points; holding a relay scores one point every third round.
- Neutral relays require an interaction to claim; simultaneous opposing claims leave ownership unchanged. Supply depots spawn one battery every four rounds if their tile is empty.
- Teams share scrap internally. Bridges and gates create route choices; players can disable an enemy-owned relay for one round with an adjacent interaction, but cannot steal a carried item.
- No direct damage or elimination. Blocking routes and timing claims supply the confrontation.
- Both teams reaching 12 in the same resolution compare total points; equal points enter a maximum three-round overtime, then a draw. Other end-of-match ties use the same overtime rule.
- Decisions: divide haulers and controllers, contest central relays, defend a lead, or use a longer safe delivery route.

### C. Vault Shift — competitive scavenging with temporary cooperation

- Roster: 2–6 individual competitors, any mix of humans and bots.
- Objective: extract the most salvage value within 24 rounds. Carried salvage scores only when deposited at an exit.
- The maze shifts every four rounds according to a visible next-shift overlay. Shifts change gates, never place walls on actors, and always leave a route to an exit.
- High-value vaults need two distinct actors on paired switches during the same round. Opening a vault yields two equal-value crates, making cooperation useful without enforcing alliances.
- Low-value salvage remains reachable without cooperation, so an uncooperative opponent cannot prevent participation.
- A hazard hit drops the carried crate; anyone may pick it up next round. Extracted score cannot be stolen.
- Equal scores are shared victories. There is no elimination or surprise scoring multiplier.
- Decisions: cooperate to open a vault, race for loose cargo, or bank a smaller haul before the next shift.

## 4. Human and AI participation

### Equal contracts, separate controllers

A slot has a stable actor ID and a controller: local human, local bot, remote human, or future LLM adapter. The engine knows actions, not controller implementations. AI replacement occurs at round boundaries. In co-op, a human can change a bot's priority among escort, deliver, repair, and gather; competitive opponent bots cannot be commanded.

The engine constructs a fresh, immutable observation per actor. It excludes enemy plans, undiscovered tiles, hidden objectives, RNG state, and private controller data. A team shares explored terrain and current allied vision. M1 uses a fully visible map; fog is introduced only with filtered observations and UI coverage together.

```ts
type ActorId = string;
type TeamId = string;
type Direction = 'north' | 'east' | 'south' | 'west';
type Pos = Readonly<{ x: number; y: number }>;
type ModeId = 'convoy' | 'rush' | 'vault';

type Action =
  | { type: 'wait' }
  | { type: 'move'; direction: Direction }
  | { type: 'pickup'; itemId: string }
  | { type: 'drop' }
  | { type: 'interact'; targetId: string }
  | { type: 'repair'; targetId: string }
  | { type: 'build'; at: Pos; structure: 'bridge' | 'shield' };

type Intent = Readonly<{
  kind: 'escort' | 'deliver' | 'repair' | 'gather'; targetId?: string;
}>;
type Observation = Readonly<{
  protocolVersion: 1;
  matchId: string;
  round: number;
  mode: ModeId;
  self: Readonly<{
    id: ActorId; teamId: TeamId; pos: Pos;
    role: 'baseline' | 'runner' | 'engineer' | 'warden';
    carrying: string | null; moveCooldown: number;
  }>;
  tiles: readonly Readonly<{
    pos: Pos; terrain: string; powered: boolean; hazardNext: boolean;
  }>[];
  actors: readonly Readonly<{
    id: ActorId; teamId: TeamId; pos: Pos; carrying: string | null;
  }>[];
  objects: readonly Readonly<{
    id: string; kind: string; pos: Pos; value: number;
  }>[];
  objectives: readonly Readonly<{
    id: string; description: string; progress: number; required: number;
  }>[];
  scores: Readonly<Record<TeamId, number>>;
  teamScrap: number;
  alliedIntents: Readonly<Record<ActorId, Intent>>;
  legalActions: readonly Action[];
}>;
type DecisionRequest = Readonly<{
  requestId: string;
  observation: Observation;
  budgetMs: number;
  decisionSeed: number;
}>;
type Decision = Readonly<{ requestId: string; action: Action }>;
interface AIPlayer {
  readonly adapterId: string;
  decide(request: DecisionRequest, signal: AbortSignal): Promise<Decision>;
  dispose(): void;
}
```

These are JSON-serializable wire types. Production schemas replace terrain/object strings with versioned enums and validate runtime payloads; TypeScript types alone are not a trust boundary. `legalActions` lists individually legal choices, not a guarantee against simultaneous contention.

### Round protocol and fallback

- The coordinator freezes one round snapshot, issues one uniquely identified request per bot, and collects human and bot actions without advancing the engine.
- Local bots run in a Web Worker with a default 50 ms budget. The coordinator enforces deadlines independently of adapter cooperation.
- Responses must match the outstanding request and its round; late, duplicate, malformed, or illegal responses become `wait`. Cancellation aborts old requests after restart, takeover, or scene exit.
- A decision never mutates state. Only the engine validates and resolves the complete action batch. In timed games the planning deadline caps every adapter's budget.
- Replays record accepted actions, including fallbacks, rather than invoking the AI again. Async completion order cannot change resolution.

### Local bots now

Ship deterministic utility bots: enumerate legal actions, score goal progress and forecast danger, select a goal, then use grid BFS to follow it. Use a per-request seeded tie-breaker; never `Math.random()`.

Convoy bots assign escort/repair/delivery tasks using actor-ID order and shared public objectives. Rush bots balance hauling and relay control. Vault bots compare bankable cargo value against travel risk and offer paired-switch intentions. Start with one greedy delivery bot in M1; add role policies and a short bounded lookahead later. Difficulty limits search depth and teamwork, while preserving identical rules and vision.

### LLM adapter later, optional and disabled by default

Use a provider-neutral adapter that serializes the filtered observation, requests a single schema-constrained action, and validates the result against `legalActions`. Treat model output and any displayed explanation as untrusted text. No model output executes code, modifies rules, or calls arbitrary tools.

Two supported deployment choices:

1. **User-supplied browser-only key:** the user explicitly enters their own key for a provider supporting browser requests and CORS. Keep it in memory only, clear it on reload/disconnect, and send it only to the selected provider over HTTPS. Never put it in URLs, logs, replays, analytics, build variables, source, or persistent browser storage. Explain that browser scripts and extensions can access it; this is an opt-in personal experiment, not a way to hide a secret in frontend code. Restrict endpoints to explicit provider origins and disable third-party scripts on the key-entry page.
2. **Separate backend:** a separately hosted, user-operated service owns provider credentials, authenticates requests, enforces quotas, and proxies model calls. The static client contains only the public service URL. Never bundle a server credential or shared provider token.

The default game requires neither option and costs nothing to run locally or on static hosting. External model usage may incur provider charges; require explicit user enablement and a per-match request cap. Untimed local games may allow up to ten seconds per LLM decision; timed games use the room deadline. Timeout or unavailable service falls back to the local bot. No external AI calls are part of CI or acceptance tests.

## 5. Technical architecture

**Stack:** Vite + strict TypeScript; Phaser 3 for tile rendering, camera, animation, audio, and input; HTML/CSS overlays for menus, roster controls, accessibility settings, and the round planner. Phaser provides the scene tools this scope needs; do not use its physics or clock to determine outcomes.

Proposed implementation boundaries (future files, not deliverables of this proposal):

- `src/engine/`: serializable state, seeded integer PRNG, action validation, movement resolution, visibility, and `step(state, actions) -> { state, events }`. No DOM, Phaser, fetch, or wall clock.
- `src/modes/`: typed definitions for setup, scoring, objectives, hazards, and end conditions; compose shared engine systems rather than copy them.
- `src/controllers/`: human input, rule bots, worker host, optional LLM adapters, and controller lifecycle.
- `src/session/`: planning deadlines, action collection, saves, replay recording, and transport interface.
- `src/view/`: Phaser scenes consuming state/events; animations interpolate without mutating engine state. Reduced-motion mode skips interpolation.
- `src/ui/`: accessible DOM controls and action/status descriptions; keyboard and pointer access to the same commands.
- `src/content/`: versioned map/scenario definitions, validated at load time.

Use integer coordinates, integer resource values, stable entity ordering, and a versioned seeded PRNG. Replay headers contain engine version, content version/hash, initial seed, and roster; each round stores accepted actions and a state checksum. Checkpoints speed seeking. Incompatible engine versions report a clear replay error instead of silently diverging.

The engine owns authoritative truth; view state includes only animation progress, hover, selection, and camera. Restarting a scene must not restart or advance the simulation. Save snapshots in IndexedDB with versioned migrations; allow JSON export/import and reject oversized or invalid imports.

### Static deployment

`npm run build` produces only static assets in `dist/`. Configure Vite's base path for the repository's GitHub Pages URL, use hash navigation, and resolve assets relative to the configured base. A GitHub Actions workflow runs checks and publishes the build through Pages. Local bots and all three local modes function without API keys or a backend. No server-side routes, runtime environment secrets, or paid dependencies are required. Publishing is a later implementation step.

### Future multiplayer path

Keep a `MatchTransport` boundary from the start: submit an action tagged with match/round/actor ID, receive authorized observations and resolution events, and reconnect using the last acknowledged round.

First implement an in-memory transport for local play. Later run the same engine in a separate authoritative TypeScript WebSocket server. Clients submit intentions; the server checks slot ownership, validates actions, applies deadlines, runs bots, and emits per-player filtered snapshots/events. A reconnecting player receives a fresh authorized snapshot; a disconnected slot waits one round, then gets a local-policy server bot. The slot can be reclaimed at a round boundary.

GitHub Pages continues serving the client; online rooms require that separate host. Do not promise free public hosting or use peer authority for ranked fairness. Defer matchmaking and accounts: room codes and short-lived seat tokens suffice for an initial private-room release. In online fog modes, local client bots are advisory/untrusted and their actions are server-validated; server bots and backend LLM adapters receive only their actor's observation.

## 6. Scaling content, performance, and development

- **Content growth:** define maps, objectives, roles, and mode parameters as validated data. First hand-build one balanced map per mode; add seeded generation only after solvability checks exist. Reject generations without reachable objectives/exits and use a known valid fallback map.
- **Feature growth:** modes expose setup, round hooks, scoring, and victory checks through a typed rules interface. Add systems only when two modes need them; avoid a general scripting language or entity-component framework initially.
- **Performance budgets:** target eight actors on 24×24 tiles first; stress-test 16 actors on 64×64 as a later ceiling, not a launch promise. Measure engine resolution under 16 ms and local bot requests under 50 ms on a documented reference laptop. Move bot work to workers, cache pathfinding per round, and cull offscreen visuals before expanding limits.
- **Online scale:** one independent engine instance per room; partition rooms across server processes when measured capacity requires it. Send filtered deltas plus periodic snapshots. Bound room sizes, message rates, replay sizes, and idle lifetimes. No shared-world simulation is required.
- **Design quality:** record local counters for rounds, invalid actions, bot fallback rate, delivery rate, and completion time; export only on user action. Use fixed scenario seeds to compare balance changes without third-party analytics.
- **Reliability:** unit-test collision chains, contention, scoring ties, and visibility; run seeded headless bot matches; verify action-log replay checksums; test a complete browser match and a build served under a repository subpath.
- **Accessibility:** keyboard planning, scalable text, symbols plus color, visible future hazards, undo before lock-in, reduced motion, and untimed local rounds. Do not rely on audio or color alone.
- **Co-development:** Claude and Codex implement bounded modules under the shared protocol and cross-review each other's changes. Agree on schemas before parallel engine/view work; review rule changes with concrete replay examples. This proposal does not require parallel work before implementation begins.

## 7. Milestones and acceptance gates

| Milestone | Concrete deliverable | Acceptance gate |
| --- | --- | --- |
| **M1 — Minimal playable prototype** | Vite/TS + Phaser; fixed 10×10 fully visible map; one human and one local delivery bot; move, wait, pickup, switch, and deliver; one gate and relay; eight-round battery-delivery goal; restart and victory/defeat screen. | A player can complete a match with the bot through the UI. Bot carries/delivers independently. Engine has no renderer imports. A seeded action sequence reproduces the final state, and the static build runs under a subpath. No key or service needed. |
| **M2 — Complete cooperative loop** | Storm Convoy with crawler, forecast storms, repair/build, shared scrap, three roles, bot priorities, two hand-built scenarios, tutorial, keyboard controls, and same-device pass-and-plan. | One human plus bots can win both scenarios; failed missions restart cleanly. Rules tests cover movement conflicts, hazards, and crawler defeat. Untimed and reduced-motion play work. |
| **M3 — Team competition** | Relay Rush, teams and private intentions, relay scoring, bot opponents, local roster editor, fairness-safe observations, and timed planning option. | Human/bot teams can play a full match; simultaneous scoring and overtime are tested. Observation tests exclude opponent plans and hidden state. A fixed batch of 100 bot matches terminates without invalid state. |
| **M4 — Third mode and replayable content** | Vault Shift, paired switches, forecast maze changes, per-actor fog, seeded map validation, replay viewer, save/import/export, and scenario browser. | Full mixed-roster matches work in all three modes. Every generated test seed has reachable required objectives. Replay checksums match live runs; imports reject invalid data. Fog works for humans and bots. |
| **M5 — AI adapter and online vertical slice** | Optional browser-key and separate-backend LLM adapter implementations; structured validation, caps and fallback; transport interface backed by a private-room WebSocket server; reconnect and bot takeover. | Fake-provider tests cover timeout, malformed output, stale replies, and secret-free logs/replays. Two browsers finish one Convoy room and one Rush room; unauthorized actor submissions are rejected. Static local play still works independently. Real provider use is optional and user-funded. |
| **M6 — Release hardening and expansion foundation** | Performance measurements, balance pass, accessibility review, three polished maps per mode, deployment automation, contributor protocol documentation, and versioned release artifacts. | All mode/browser smoke tests and deterministic replay checks pass; measured eight-player budget is met. Pages build loads via its repository URL. No bundled secrets or required paid services. Known limits and server setup are documented. |

Build M1 before expanding content. Each milestone ends in a playable build and a cross-review; later networking and LLM work must not become prerequisites for enjoying the local game.
