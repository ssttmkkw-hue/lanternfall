# Lanternfall: Final Design

Status: **accepted baseline for implementation** · Supersedes: `proposal-claude.md`, `proposal-codex.md`
Inputs: `BRIEF.md`, both proposals, `review-by-codex.md`, `review-by-claude.md`,
`review-design-by-codex.md` (applied; see §9 "Changes after Codex design review").
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
  hot-seat humans. **Session:** 8–15 min for a full Hold match in Live pacing (Tactical is
  untimed and runs longer); tutorial under 5 min. The M1 slice is deliberately shorter (§2.1.2).
- **Out of scope:** persistent worlds, accounts, paid services, required external AI, public
  community scripts (until a sandbox design exists).

## 2. Core loop

```
Plan/act (one action per actor per round) → Resolve simultaneously → Animate events
   ↑                                                                   ↓
Next round ← Forecast (next Surge, Gloom paths, hazards) ← Fuel/upkeep/light update
```

**Rules (M1 values; all of them are data and tunable).** This list is the summary; the normative
M1 rules are the tables in §2.1, and they win if the two ever disagree.

- **Movement:** 4-directional, one tile per round. Walls, veins and structures block it. An actor
  carries at most one item, which is Ember.
- **Lantern fuel:** each actor has 20 fuel. It drops by 1 for each round the actor ends on a tile
  that is not **illuminated** by the Hearth or a Beacon, and refills completely when the actor ends
  a round on an illuminated tile. Personal lanterns never illuminate and never refuel. At 0 fuel the
  actor is *Dimmed*: it can only `wait`, or `move` on even rounds.
- **Hearth:** starts with 30 fuel (cap 60) and burns 1 on every even round. Each Ember delivered
  adds 5. At 0 the match is lost.
- **Veins:** a `mine` action next to a vein produces 1 Ember into the actor's hands. Each vein holds
  3–6 Ember and then runs out. Veins **do not replenish**. The near ones are small and the rich ones
  are out in the dark. That is the pull outward.
- **Ember accounting:** there is **no shared team wallet**. Ember exists only in veins, in hands, in
  floor piles, or delivered into a structure.
- **Beacons (M2):** `build beacon` places an unlit *frame* on an adjacent floor tile at no cost.
  Allies `deliver` Ember into it; it lights when it holds 3 (Smith frames need 2). A lit Beacon has
  radius 3, fuel 10 (cap 20), burns 1 per round, and each further Ember delivered adds 10 (so upkeep
  is about 1 Ember per 10 rounds). Smith `repair` adds 5 fuel for no Ember. At 0 fuel it goes *out*:
  unlit, ignored by Gloom, stays on the map, and the next delivered Ember relights it at 10 fuel.
  Gloom drains lit Beacons like the Hearth. Building more Beacons makes it easier to reach far Ember
  but leaves more ground to defend. That trade-off between expanding and defending is the core
  dilemma.
- **Gloomlings:** they appear at marked dark-edge spawn points in forecast **Surges** (schedule in
  §2.1.2). A Gloomling follows a **displayed path** toward the nearest lit structure, one tile per
  round, but only on even rounds while it stands on an illuminated tile. Each round it either moves
  or attacks one adjacent target: an actor loses 1 HP, a structure loses 3 fuel. Gloomlings have
  2 HP.
- **Actors:** 3 HP. A `strike` deals 1 to an adjacent Gloomling. An actor at 0 HP is *Snuffed*: it
  drops its Ember and respawns next to the Hearth 3 rounds later (§2.1.3). There is no permanent
  elimination.

**Example co-op sequence (checked in M2 acceptance):** a Surge is forecast from the west. The human
pings "hold" at the west choke. The Warden bot's label changes to *"Holding west choke (your ping)"*
and it strikes Gloomlings there, while the human ferries Ember from the rich east vein. The Hearth
survives because each made the other's job possible. No role is required, so a weak or missing bot
never blocks progress.

### 2.1 M1 rules tables (normative)

**Conventions.** Rounds are numbered from 1. "Even round" means `round % 2 === 0`. This global
parity is the only parity in the game (Hearth burn, Dimmed movement, Gloomling slowdown).
*Adjacent* means 4-neighbour (Manhattan distance 1). A *radius r* covers the tiles with
`dx² + dy² ≤ r²` (integer maths, no square roots). *Opaque* tiles are walls and veins. Structures,
actors, Gloomlings and Ember piles are not opaque.

**Line of sight (LOS).** A source S reaches a tile T when no opaque tile lies *strictly between* them
on the integer Bresenham line drawn from S to T. The line is always drawn source → target, and a
tie steps the major axis first. The opaque tile itself can be reached, so walls at the edge of light
render lit.

#### 2.1.1 Light, vision and refuelling

| Concept | Sources and radius | Occlusion | Used for | Computed |
|---|---|---|---|---|
| **Illumination** (`lit`) | Hearth with fuel > 0: r 4. Lit Beacon with fuel > 0: r 3 (M2). | LOS | Refuelling, Gloomling slowdown, render brightness | Phase 6 of every round, after Hearth burn and Beacon upkeep; round 1 uses the set computed at match init |
| **Personal lantern** | Each non-Snuffed actor: r 2 (Warden r 1, Dimmed r 1) | LOS | **Vision only** (M2). Never part of `lit`, never refuels | Phase 10 (observation build) |
| **Vision** (`visible`) | M1: the whole map (fog off). M2: union of allied lantern discs plus every tile lit by an allied structure | LOS (M2) | What the observation may contain (§5, leak tests) | Phase 10 |
| **Refuel coverage** | The actor's own tile is in `lit` from phase 6 of this round | n/a | Fuel refill / drain, Dimmed status | Phase 6, right after `lit` is recomputed |

- **Phase 6 order:** Hearth burn (even rounds) and Beacon upkeep → recompute `lit` → for each actor
  in ascending id: on a lit tile, refill fuel to max (20; Smith 14) and clear Dimmed; otherwise
  `fuel = max(0, fuel − 1)`, and Dimmed if fuel is 0.
- Gloomling slowdown (phase 5) uses the **round-start** `lit` set, which is the one players saw in
  their observation.
- **M1 is fully visible but not fully lit.** Fog is off, so every tile and entity is in every
  observation and `visible` is all `'1'`. Illumination is still computed and matters for fuel and
  Gloomling speed. The view draws unlit tiles dimmed **and** with a dark-tile symbol.

#### 2.1.2 Hold the Light: M1 schedule and end conditions

| Item | M1 value |
|---|---|
| Map | One hand-built 16×16 map. Hearth on a single centre tile. 4 spawn points on each of the W, E and N edges (ascending ids). An ordered respawn list (§2.1.3). |
| Hearth | Starts at 30, cap 60 (overflow is lost). −1 on even rounds (phase 6). +5 per delivered Ember. −3 per Gloomling attack. |
| Surges | Surge 1: spawn round 40, from W, 2 Gloomlings. Surge 2: round 80, from E, 3. Surge 3: round 120, from N, 4. |
| Forecast | `surgeInRounds` is always shown (rounds until the next spawn round; `null` after Surge 3). Direction `from` is shown once `surgeInRounds ≤ 8`. Each Gloomling's next 5 path tiles are shown. |
| Spawn placement | Phase 8 of the spawn round. Creatures go onto that direction's spawn points in ascending id, skipping any tile holding an actor, a Gloomling or a structure. Creatures that can't be placed wait in a queue and retry in phase 8 of each later round, before any newer wave. A wave is *fully spawned* when its queue is empty. |
| Round cap | 160 |
| End check (phase 9, this precedence) | 1. **Loss** if Hearth fuel is 0. A loss beats a win in the same round. 2. **Win** if Surge 3 is fully spawned and no Gloomlings remain. 3. **Win ("Dawn")** at the end of round 160. Every actor being Snuffed at once is **not** a loss. |
| Ember budget | Hearth burn over 160 rounds is 80. With a start of 30, at least 10 Ember must be delivered even with zero Gloom drain. The map holds 30 Ember in total (3× the need): at most 6 within 5 steps of the Hearth, the rest outside Hearth light. A unit test asserts the total, the near/far split and reachability. |
| Duration | ≤160 rounds: about 64 s of Live play at 400 ms, about 5–10 min in Tactical. The 8–15 min target applies to the full Hold in M2, whose schedule table must satisfy `cap × liveRoundMs ∈ [8, 15] min` and repeat this Ember-budget check. |

#### 2.1.3 Combat, collision and lifecycle (M1)

| Situation | Rule |
|---|---|
| Actor movement (phase 2) | All moves resolve simultaneously. If several actors target one tile, all of them fail. A move into an actor that does not vacate fails, and the failure propagates back along the chain. Swaps and longer rotations succeed only if every participant is an ally. Tiles holding a Gloomling at round start are not legal targets (Gloomlings move later, in phase 5). |
| Strike (phase 3) | Target: a Gloomling adjacent at round start. A striker does not move, and Gloomlings move only in phase 5, so adjacency in phase 3 always equals round-start adjacency. All strikes apply at once and damage sums. Gloomlings at 0 HP are removed at the end of phase 3 and do not act. |
| Gloomling action (phase 5) | In ascending id, each Gloomling does **one** thing: if it is adjacent to a non-Snuffed actor or a lit structure (positions after phase 2), it attacks; otherwise it moves one step along its path. It never moves and attacks in the same round. |
| Gloomling target priority | 1. Adjacent actor with the lowest HP, then lowest id. 2. The Hearth. 3. Lit Beacon with the lowest id (M2). One target per Gloomling per round. All attack damage is computed first, then applied together, clamped at 0. |
| Gloomling movement | It moves only if the next path tile is floor and holds no actor, structure or Gloomling, including Gloomlings that already moved this phase (lower id goes first; a tile vacated earlier in the phase may be entered). If blocked, it stays put. On a tile in the round-start `lit` set it moves only on even rounds. Gloomlings never swap. |
| Gloomling path | BFS over floor tiles (walls, veins and structures block; actors and Gloomlings are ignored for planning) to any tile adjacent to the nearest lit structure. Ties go to the lower structure id, and neighbours expand in the order N, E, S, W. Recomputed in phase 10. |
| Dimmed | Set in phase 6 when fuel reaches 0. Cleared in phase 6 when the actor ends on a lit tile. Legal actions: `wait`, and `move` on even rounds only. Still targetable. |
| Snuff (phase 7, round R) | An actor at 0 HP is Snuffed. Carried Ember drops onto its tile, merging into any pile there. It leaves the map, its Order is cleared and `respawnIn = 3`. |
| Respawn (phase 7, round R+3) | In ascending actor id, the actor is placed on the first free tile in the map's respawn list: the Hearth's N, E, S, W neighbours, then the radius-2 ring in row-major order. *Free* means floor with no actor, Gloomling or structure. If none is free, it retries next round. It comes back with 3 HP, full fuel, status `ok`, empty hands and cooldown 0, and acts again from round R+4. |
| Economy (phase 4, in this sub-order) | **deliver**: carrying Ember and adjacent to the Hearth. **mine**: empty-handed and adjacent to a vein. When several actors mine one vein, they take 1 each in ascending actor id while the amount lasts; the rest fizzle. **pickup**: a pile on the actor's tile or an adjacent tile at round start. Two or more pickups on one pile all fail. **drop**: onto the actor's own tile. Dropped Ember can't be picked up until next round. |

## 3. Modes and order

Every mode is a `ModeRules` plugin over the shared engine. Every slot can be a local human, a bot, an
LLM agent (M4+) or a remote human (M7+). Modes ship in this order:

1. **Hold the Light** (co-op, 1–4). Keep the Hearth alive through N Surges (M1: 3, full: 8).
   *M1 vertical slice (schedule in §2.1.2), M2 complete.*
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
| Smith  | Beacon frames need 2 Ember. `repair` adds 5 Beacon fuel, no Ember | Max lantern fuel 14 (not 20) | M2 |
| Medic  | `ability`: Kindle, +1 HP and full lantern to allies within 2 (cd 6) | Strikes deal 0 on odd rounds | M5 |

M1 uses only a baseline Lanterner. Roles change capabilities but never the action protocol.
Ability targeting, effect timing and the resolution phase for `ability` are specified by the
protocol-v2 ADR that must be accepted **before M2 implementation starts** (see §8 M2).

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

/** Exactly one per actor per round.
 *  M1 subset (enforced by the mode's action allow-list in validate.ts):
 *  wait, move, strike, mine, pickup, drop, deliver. build/repair/ability arrive in M2. */
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

/** Persistent multi-round goals, expanded by the executor until done or impossible.
 *  M1: the executor supports goTo, gather and guard, used only by bots (no human planner UI). */
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
                   respawnIn: number | null;        // rounds until respawn while snuffed
                   order: Order | null; secret?: Readonly<{ hollow: boolean }> }>;
  /** Compact grid, one char per tile: '#' wall, '.' floor, '?' never seen, etc. (legend in rules). */
  map: Readonly<{ w: number; h: number; terrain: readonly string[];
                  lit: readonly string[];           // '1' illuminated by Hearth/Beacon (never lanterns);
                                                    // for non-visible tiles: value when last seen (M2)
                  visible: readonly string[] }>;    // visible: '1' currently seen, '0' remembered/unknown
  actors: readonly Readonly<{ id: ActorId; team: TeamId; role: RoleId; pos: Pos; hp: number;
                              carrying: 'ember' | null; label?: string }>[];  // allies always; enemies if visible
  entities: readonly Readonly<{ id: EntityId; kind: string; pos: Pos; hp?: number;
                                amount?: number; fuel?: number; owner?: TeamId }>[];  // visible only
  /** surgeInRounds and from are public. gloomPaths (from M2, with fog): only Gloomlings present in
   *  `entities`, and each `next` is cut at the first tile that is neither visible nor remembered. */
  forecast: Readonly<{ surgeInRounds: number | null; from?: Dir;
                       gloomPaths: readonly Readonly<{ id: EntityId; next: readonly Pos[] }>[] }>;
  team: Readonly<{ orders: Readonly<Record<ActorId, Order | null>> }>;   // no shared Ember wallet
  pings: readonly Readonly<{ from: ActorId; ping: Ping; round: number }>[];   // allied, last 5 rounds
  events: readonly Readonly<{ round: number; text: string; kind: string }>[]; // since last obs, filtered
  chat: readonly Readonly<{ from: ActorId; text: string; round: number }>[];  // modes with chat only
  legal: Readonly<{ move: readonly Dir[]; strike: readonly EntityId[]; mine: readonly EntityId[];
                    pickup: readonly EntityId[]; deliver: readonly EntityId[];
                    repair: readonly EntityId[]; build: readonly Readonly<{ kind: BuildKind;
                    at: readonly Pos[] }>[];
                    ability: boolean;   // M1: always false. Replaced by target-aware legality in v2 (M2)
                    drop: boolean }>;
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
  /** Live pacing, human seats only: called once at the round deadline; returns the latest pending
   *  input synchronously (a held direction repeats), or null. Never called in Tactical. */
  flush?(requestId: string): Decision | null;
  dispose?(): void;
}

/** One accepted action per actor per round. */
export type AcceptedAction = Readonly<{
  actor: ActorId; action: Action; ping?: Ping;
  source: 'controller' | 'order' | 'fallback' | 'idle';
}>;

/** The replay body: one record per round. Versioned with PROTOCOL_VERSION.
 *  `actions` and `modeCommands` are authoritative engine input. `orders` and `say` are session data:
 *  recorded for the viewer, never hashed, not needed to reproduce state. */
export type RoundInput = Readonly<{
  round: number;
  actions: readonly AcceptedAction[];                                        // M1: the only field
  orders?: readonly Readonly<{ actor: ActorId; order: Order | null }>[];     // accepted changes (M3)
  say?: readonly Readonly<{ actor: ActorId; text: string }>[];               // accepted, capped (M6)
  modeCommands?: readonly never[];  // reserved; typed (e.g. Dimming votes) by an ADR before M6
}>;
```

### 5.1 Round protocol (`src/session/coordinator.ts`)

1. Freeze the round-start state. For each actor, build an `Observation` and issue a `DecisionRequest`
   with a unique `requestId`. Abort any outstanding request from earlier rounds.
2. Collect decisions. Each `requestId` accepts **at most one** `Decision`. The first one that
   passes validation counts; anything later for the same id is a duplicate.
   - **Human seat, Tactical:** pending input (action choice, undo, order edits) stays **local** in
     the human controller and UI and is never sent. `decide()` resolves exactly once, on an
     explicit **Lock** (Enter or the Lock button). Lock is final for that round.
   - **Human seat, Live:** there is no Lock. At the round deadline the coordinator calls
     `flush(requestId)`, which synchronously returns the latest pending input, or null.
   - **Round deadline** (Live only, default 400 ms): when it passes, collection stops and seats
     without a decision take the fallback in step 4. Tactical has no round deadline. The round
     resolves when every seat has either a decision or an expired controller timeout.
   - **Controller timeout** (per controller kind, both pacings, async controllers only): LLM 10 s
     in Tactical. In Live the effective limit is `min(controller timeout, round deadline)`. On
     expiry the signal is aborted and the fallback applies. Human seats have no controller
     timeout (Tactical waits for Lock; a pause menu exists). Built-in bots are synchronous and
     never time out.
   - **Time source:** the coordinator reads time only through an injected `Clock`. Interactive
     play uses the real clock. Tests use a `FakeClock` advanced explicitly, so timeout, late and
     stale cases are deterministic. The headless runner (§8 M1) has **no clock**: it uses
     `deadlineMs: null`, bots are bounded by `nodes`, and only built-in bots or the fake LLM provider
     may sit in a seat. Results never depend on machine speed.
3. Reject a reply if its `requestId` is stale, it is a duplicate, it arrives late, it is malformed,
   or it fails submission validity (§7). Rejected replies are counted and shown in a debug overlay.
4. Each actor's action is, in priority order: the controller's valid `action`; else the executor's
   next step for the current `order` (also checked against `legal`); else, for AI seats, the
   **companion rule bot** (`source: 'fallback'`, small UI icon), or `wait` for human seats
   (`source: 'idle'`). This is the one fallback path for every failure type. Once accepted, an
   action is never substituted. If it fails at resolution it *fizzles* (§7).
5. `step(state, accepted)` resolves the round. The round's `RoundInput` and `hashState()` are
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

M1 ships `bot:helper@1` (gather/deliver/guard), driven by the M1 executor subset (`goTo`, `gather`,
`guard`). M2 adds one bot per role. M3 adds Rush bots. Built-in
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
  the last input before the deadline counts (via `flush`) and a held direction repeats. Tactical mode
  allows undo until Lock. Edits stay local and only the locked decision is sent (§5.1).
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
tools/           run-headless.ts (M1, tiny seeded bot-only runner), arena.ts (M3, builds on it),
                 check-determinism.ts
docs/            DESIGN.md, adr/
```

Boundaries are enforced with ESLint `import/no-restricted-paths`: `engine` imports only `protocol`
types; `view`, `ui` and `controllers` never import `engine/resolve`.

## 7. Determinism and testing

**Engine contract:** integer-only state (clamp anything that could overflow; no bitwise ops on
values that can exceed 2^31). No `Math.random`, `Date.now`, `performance.now` or `Map`/`Set`
iteration in `engine/` (lint-banned). Iterate in ascending id order; new entities take the next id.

**Fixed resolution order per round** (detailed M1 rules in §2.1)
1. Intake: submission validity (below).
2. Actor movement (§2.1.3 collision table).
3. Strikes, applied simultaneously; dead Gloomlings removed.
   3b. *Abilities: reserved slot, defined by the protocol-v2 ADR (M2). Absent in M1.*
4. Economy, in sub-order deliver → mine → pickup → drop. *build / repair: M2.* Deliveries into the
   same Beacon frame apply in ascending actor id; Ember beyond what the frame needs fizzles and stays
   carried. Builds become active next round.
5. Gloom: each Gloomling in ascending id attacks **or** moves (§2.1.3).
6. Hearth burn and Beacon upkeep → recompute `lit` → actor fuel and Dimmed (§2.1.1).
7. Snuff actors at 0 HP, then respawn the actors that are due.
8. Spawns and spawn queue (§2.1.2). 9. Mode hooks `onRoundEnd`, `checkEnd` (precedence in §2.1.2).
10. Recompute Gloom paths and the forecast.

M1 implements exactly the M1 subset. Phase 3b and build/repair are empty reserved slots, and
`validate.ts` rejects `build`, `repair` and `ability` through the mode's action allow-list.

**Legality vs resolution.** There are two separate checks:
- **Submission validity** (intake, `validate.ts` + `legal.ts`): the shape and bounds are right, the
  action type is in the mode allow-list, and the action is in the actor's **round-start** `legal`
  set. Every target must come from that set. A target that only becomes adjacent during the round
  can **never** be chosen that round. An invalid submission is rejected and the §5.1 fallback chain
  applies.
- **Resolution preconditions** (each phase): rechecked against the current state when the phase
  runs (contested tile, vein emptied by a lower-id miner, contested pickup, frame already full). If
  one fails, the action **fizzles**: it has no effect, consumes nothing (no Ember, no cooldown),
  emits a `fizzle {actor, action, reason}` event to the actor and allies, and gets **no**
  substitute action. The replay stores the accepted action; the fizzle is re-derived on replay.
- In M1 a strike can never fizzle (see §2.1.3). Legal `move` targets include tiles held by other
  actors at round start, because contention is settled at resolution.

Every rule is a table-driven unit test. Each row of the §2.1 tables has at least one test.

**Anti-body-block:** `mapcheck` rejects any map without a 2-wide route to every scoring or delivery
site. Generated maps also have to pass reachability, spawn-safety and Ember-viability checks, with a
known-good fallback map.

**Replay contract**
- Header: `engineVersion`, `protocolVersion`, `contentHash`, `seed`, `mode`, roster. Body: one
  `RoundInput` (§5) and state hash per round, plus a checkpoint snapshot every 50 rounds.
  Checkpoints speed up seeking. They never stand in for missing `RoundInput`s.
- **Every authoritative mutation comes from a `RoundInput` field.** That means `actions` from M1 and
  `modeCommands` (e.g. Dimming votes) once an ADR types them before M6. Any new state-changing input
  needs a new versioned field first.
- `hashState()` covers only the engine `GameState`, which is exactly the replayable state.
  Orders, labels, pings and chat are session data. They are recorded (`orders` from M3, `say` from
  M6) but never hashed.
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
   status or ownership. Events, chat, `legal`, **forecast `gloomPaths`** and **remembered `lit`** are
   covered too (from M2, when fog is on; M1 is fully visible).
5. Headless runs. M1: `tools/run-headless.ts` (`npm run headless -- --seed 1 --n 100`) plays seeded
   bot-only matches with no clock and prints the result, the round count and the final hash. It
   exits non-zero on invalid state or on overrunning the round cap. M3: the Arena
   (`npm run arena -- --mode hold --n 200`) builds on it, with every mode and win/timing stats in
   JSON for balance work.
6. E2E (Playwright, M2+): build served under the subpath, start a match, play scripted inputs, reach
   an end screen.
7. Performance budgets on a documented reference laptop: `step` < 4 ms and a bot decision < 20 ms
   at 8 actors on 48×48. 16 actors on 64×64 is a stretch target only.

## 8. Milestones

Each milestone ends with a playable Pages build, green CI, and a cross-review.

**M1: Vertical slice (Hold the Light, 1 human + 1 bot)**: kept deliberately small.
- *Scope, in build order:*
  1. Scaffold: Vite/TS/npm, ESLint boundary and global bans, Vitest, Pages workflow, gitleaks.
  2. Engine implementing **only the §2.1 tables**: actions `wait`, `move`, `strike`, `mine`,
     `pickup`, `drop`, `deliver`; phases 1–10 with 3b and build/repair as empty reserved slots;
     illumination computed, fog off; the §2.1.2 schedule on one hand-built 16×16 map.
  3. Protocol types, validator with the M1 action allow-list, `rng.ts`, `hash.ts`.
  4. **Tiny headless runner** (`tools/run-headless.ts`, about 100 lines): `--seed --n`, bot-only
     roster, no clock. It prints the result, rounds and final hash per match and exits non-zero on
     invalid state or a cap overrun. It is not the Arena (no stats or personalities; those are M3).
  5. **Replay recorder** (`session/replay.ts`): header + `RoundInput[]` + per-round hash. JSON
     output (a file in Node, a "download replay" button in the browser) and a `verifyReplay()` used
     by golden tests. Replay import UI and the viewer stay in M3.
  6. `bot:helper@1` with labels, on a minimal executor for `goTo` / `gather` / `guard` that only
     bots use.
  7. Coordinator with **Tactical** pacing (local edits, Lock, `FakeClock` tests); Canvas2D view;
     HUD (HP, fuel, carried, Hearth, surge countdown and direction, respawn timer); restart and end
     screen.
  8. **Live pacing, gated:** work starts only after the Tactical acceptance below passes. If Live
     is not solid by the end of M1, it becomes the first M2 item and M1 still closes.
- *Explicitly not in M1:* fog/vision, Beacons, roles, abilities, build/repair, ping wheel, human
  Orders / click-to-path / planner UI, Arena stats, replay import/viewer, Worker bots, Playwright.
- *Accept:* a person on the Pages subpath URL finishes a **Tactical** match with the bot (win or
  lose), and a Live one if the gate was passed. The bot gathers, delivers and guards during Surges
  on its own. Every §2.1 table row has a unit test. A golden replay written by the recorder
  reproduces every per-round hash, and the determinism checker passes. Lint shows `engine/` has no
  DOM/view imports. `run-headless --n 100` finishes with every match ending by the 160-round cap
  and no invalid state. No key or service needed.

**M2: Complete co-op**
- *Scope:* Hold the Light with 8 Surges; Beacons with upkeep; fog/light vision with team memory;
  Warden, Scout, Smith and one bot per role; Orders plus click-to-path; ping wheel with bots
  acknowledging via labels; lobby/roster editor (human/bot/difficulty/role); 2-human hot-seat; two
  hand-built maps plus tutorial; accessibility (symbols plus colour, reduced motion, scalable text,
  pause); Live pacing if it slipped from M1.
- *Gate before implementation:* a **protocol-v2 ADR** (Codex sign-off) covering: phase 3b ability
  resolution and effect timing; target-aware `legal.ability` (positions and/or entities); active
  effects (shield, flare) on actors and entities; discriminated entity kinds with Beacon status
  (`frame` / `lit` / `out`, Ember still needed, fuel); `build` / `repair` legality; the executor for
  `refuel` / `follow` / `build`. It also adds a full 8-Surge schedule table that meets the §2.1.2
  duration and Ember-budget rules, and decides whether Tactical gets an "auto-advance while every
  seat has an active Order" option.
- *Accept:* 1 human + 3 bots can win both maps. The §2 ping sequence passes as an e2e test. Leak
  tests pass with fog on, including clipped `gloomPaths` and remembered `lit`. Playwright subpath smoke test passes. A fresh tester finishes the
  tutorial unaided.

**M3: Competition and tooling**
- *Scope:* Ember Rush (teams, private team orders, bot opponents, overtime/tie rules); bots in a
  Worker; loopback `Transport`; replay viewer with JSON export/import (recording `RoundInput.orders`);
  Arena CLI with stats, built on the M1 headless runner.
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
- *Gate before implementation:* an ADR typing `ModeCommand` (votes) as `RoundInput.modeCommands`,
  plus vote phase/results fields in `Observation`, and `say` recording in replays.
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
| 10 vs 20 Hz question | Moot under rounds. Live round length is tuned when Live pacing lands (M1 if it passes the gate, else M2), range 250–1000 ms |
| Optional sessionStorage "remember for this tab" (Claude review) | Deferred. Memory-only until users report friction. It would need an ADR |
| WebRTC commit–reveal before a server (Claude review) | Deferred to an M7 experiment. It doesn't solve hidden information |
| Storms destroy unshielded cargo on hard difficulty (Claude review) | Modified: being Snuffed drops Ember on the floor, which can be recovered. Nothing is ever destroyed |
| `wait` as the universal fallback (Codex proposal) | Rejected for AI seats in favour of the companion bot. Kept for human seats |
| Six modes, meta-progression, Delve, public bot ladder as commitments (Claude proposal) | Rejected as commitments. Kept in the backlog |
| Renderer abstraction for swaps (Claude proposal) | Rejected (Codex review). Only the read-only view rule applies |
| One action per tick, with move/attack/ping competing (Claude proposal) | Modified: one action per round, plus one free `Ping` per round for everyone |

### Changes after Codex design review
Source: `review-design-by-codex.md`. Every P0 is fixed in this document. P1s are fixed here or
assigned to a named milestone gate.

| # | Issue | Change |
|---|---|---|
| P0-1 | Light/vision not executable | §2.1.1: illumination, lantern, vision and refuel are separate concepts with exact radii, a squared-Euclidean metric, Bresenham LOS and phase-6 timing. **Personal lanterns never refuel.** M1 is fully visible but not fully lit |
| P0-2 | No Hold spawn/end schedule | §2.1.2: Surges at rounds 40/80/120 (2/3/4 Gloomlings, W/E/N), direction shown 8 rounds ahead (was 5), spawn queue for occupied points, 160-round cap, loss-before-win precedence, Ember budget (need ≥10, map has 30). The 8–15 min target is now scoped to the full Hold in Live, with a duration formula for M2 |
| P0-3 | Snapshot legality vs post-move strikes | §7 "Legality vs resolution": submission validity uses the round-start `legal` set; resolution preconditions fizzle with no substitute; newly adjacent targets are never selectable. Strikes cannot fizzle in M1 |
| P0-4 | Combat/lifecycle ties | §2.1.3: Gloom attacks *or* moves; target priority actor (lowest HP, then id) > Hearth > Beacon; sequential Gloom movement by id; global even-round parity; Snuff/respawn timing (R → R+3, acts R+4), restored stats, ordered respawn list with retry; phase 4 sub-order |
| P0-5 | Tactical input vs duplicate rejection | §5.1: Tactical edits stay local and `decide()` resolves once on Lock; Live uses the new `Controller.flush()`; separate round deadline vs per-controller timeout; injected `Clock`/`FakeClock`; headless runs have no clock |
| P1-6 | Ember funding undefined (M2) | Fixed now: the shared `team.ember` wallet is removed; Beacons are frames filled by `deliver`, with fuel/upkeep/repair/out lifecycle (§2); the Smith trade-off becomes max fuel 14. Values are tuned in M2 |
| P1-7 | Replay omits communication/commands | `RoundInput` type (§5) and replay contract (§7): only `actions` and `modeCommands` are authoritative; orders/say are recorded but not hashed. `modeCommands` are typed by the M6 gate ADR |
| P1-8 | M2/M6 actions and observations incomplete | M1 subset made explicit (action allow-list, `respawnIn` added). Ability phase 3b, target-aware `legal.ability`, effects and Beacon status are **deferred to the M2 protocol-v2 ADR gate**. Vote commands and results are **deferred to the M6 gate** |
| P1-9 | Forecasts bypass fog (M2) | Rule fixed now in `Observation.forecast`: Surge timing/direction are public; `gloomPaths` only for visible Gloomlings, clipped to known tiles. Enforced by leak tests **in M2** (M1 has no fog) |
| P1-10 | M1 depends on deferred tooling | M1 now explicitly includes a tiny headless runner, a replay recorder and a bot-only gather/guard executor. Human Orders UI, unused phases and the Arena stay out. Live pacing is gated behind Tactical acceptance and may slip to M2 |

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
| `tools/run-headless.ts` and the replay recorder | Claude | M1 |
| `tools/arena.ts`, balance passes, performance work, online server (M7) | Claude | |
| Protocol-v2 ADR (M2 gate) and mode-command ADR (M6 gate) | Claude drafts, Codex signs off | Before M2 / M6 |
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
