# Review of `proposal-codex.md` (Relay Frontier)

Reviewer: Claude · Inputs: `docs/BRIEF.md`, `docs/proposal-codex.md`, `docs/proposal-claude.md` (my own Lanternfall proposal)

## TL;DR

Relay Frontier is the better *foundation*, and I recommend we adopt its core model: simultaneous,
deterministic, discrete rounds on an integer grid. That model solves the hardest problem in the brief,
which is letting LLM agents play as equals, much more cleanly than my 10 Hz real-time sim with an
intent/executor layer. Its weak spot is **fun**. As written it reads like a well-specified logistics
puzzle, with little tension, threat, or reason to replay. My recommendation: use Codex's engine,
protocol and milestones, and merge in Lanternfall's antagonist pressure, hidden-role mode, tooling and
LLM ergonomics.

## Strengths

1. **Simultaneous rounds suit mixed human/AI play.** A slow LLM, a 1 ms rule bot and a careful human
   all submit one action per round. Nobody gets a speed advantage, and there's no async-intent
   machinery to get wrong. This is strictly better than my proposal for the "equal seat" goal.
2. **Determinism by construction.** Integer coordinates and resources, a fixed resolution order,
   explicit contention rules (same-tile moves, chains, cargo claims, scrap allocation by actor ID),
   and switches that take effect next round. No fixed-point math needed. Replays store accepted
   actions (including fallbacks), so async completion order cannot leak into outcomes.
3. **A strong AI protocol.** `requestId`, `AbortSignal`, stale/duplicate rejection, a
   coordinator-enforced deadline, a per-request `decisionSeed`, and `legalActions` in the
   observation. That last one is very useful for LLMs: they pick from a list instead of inventing
   moves. The note that "TS types are not a trust boundary" is correct.
4. **Better key handling than mine.** Keeping the key in memory only and clearing it on reload is
   safer than my sessionStorage/localStorage option. Restricting endpoints to explicit origins, the
   per-match request cap, and keeping real providers out of CI are all right.
5. **Competitive design without toxicity.** No elimination, no stealing carried items, low-value
   salvage that can't be denied, and fully specified overtime and tie rules. Vault Shift's paired-switch
   vaults are a nice "temporary alliance" mechanic, and both bots and LLMs can reason about them.
6. **A tiny, honest M1.** A 10×10 map, one bot, eight rounds, a subpath build check. Every milestone
   has a testable gate. Accessibility (untimed rounds, undo before lock, reduced motion, not relying
   on colour alone) comes for free with turn-based play and is taken seriously.

## Weaknesses and risks

### Fun factor (the biggest risk)
- **No antagonist.** Storms are forecast one round ahead and only stun for one round, and cargo is
  never destroyed. Convoy defeat comes from slow attrition, not from moments of danger. Players can
  play it safe on every turn. Risk: "Sokoban with batteries".
- **Theme and verbs are thin.** The actions are move, carry, toggle and repair. There's no combat,
  discovery or upgrades, so there's little emergent story. Fog only arrives in M4, so M1–M3 are
  fully visible puzzles where the bots can play near-optimally and the human mostly follows them.
- **Pacing.** 30–36 rounds of plan → lock → animate, with a lock click every round, can drag. There's
  no "auto-continue while my bots are on task" option and no fast-forward.
- **Rush degenerate cases.** On 1-wide corridors, a single actor standing still can body-block forever
  (moving into a stationary actor fails). Allowed swaps also let carriers pass each other through a
  corridor, which feels odd. FFA Vault Shift with 2–6 players invites kingmaking.
- **Replay value.** No meta-progression, no unlocks, and procedural maps are deferred to M4.

### AI participation design
- **Observation size for LLMs.** 576 tile objects plus an enumerated `legalActions` list (which
  includes `build` at every legal `Pos` × structure) will cost thousands of tokens per actor per
  round. A compact text rendering is needed.
- **Fallback is `wait`.** A malformed or late LLM reply wastes the slot's turn. The proposal falls
  back to the local bot only on timeout or an unavailable service. Every failure path should use one
  consistent fallback.
- **One action per LLM call.** A 3-bot LLM crew means 3 calls per round, about 100 calls per match.
  Multi-round plans (keep doing X until done or invalidated) would cut cost and latency a lot.
- **Commanding bots** only works through four priority kinds. There's no spatial command like
  "go here" or "help me", which is the most natural way a human talks to teammates.

### Determinism
- The **50 ms Worker deadline is enforced on wall-clock time**. On a slow machine a deterministic bot
  can time out and turn into `wait`, so the same seed gives different live outcomes on different
  hardware. Replays stay correct, but headless tests and bot batches become flaky. Fix: deadlines
  apply only in live/timed play, and tests run bots without them (or bots use a deterministic
  node-count budget instead of a time budget).
- Specify `decisionSeed = hash(matchSeed, round, actorId)` and the PRNG algorithm/version now.

### Scope
- M1–M4 are reasonable. **M5 bundles too much**: two LLM adapters, a WebSocket server, reconnect, and
  bot takeover. Online play also needs a host, which conflicts with "no paid services" unless it's
  self-hosted. Split M5 into "LLM adapters" and "online".
- Three roles, three modes, fog, replays, IndexedDB saves with migrations, and a scenario browser by
  M4 is a lot. IndexedDB migrations can wait. JSON export/import is enough at first.

### Browser / static-site feasibility
- Fine overall: Phaser plus a DOM overlay, hash routing, a configurable `base`. Since the sim is
  discrete, my objection to Phaser (its loop and physics fighting a real-time deterministic sim)
  mostly doesn't apply here. **I withdraw the Pixi preference.**
- GitHub Pages can't set response headers. Any CSP has to be a `<meta http-equiv>` tag, and some
  directives (e.g. `frame-ancestors`) don't work from a meta tag.

### LLM key security
- "Disable third-party scripts on the key-entry page" doesn't really work in a single-page app,
  because the key-entry page is the whole app. Instead: ship zero third-party scripts at all, add a
  meta CSP with `connect-src` restricted to `'self'` + allow-listed provider origins + `localhost`,
  and pin dependencies.
- Memory-only keys mean re-entering the key after every reload. That's acceptable, but say so in the
  UI. An optional "remember for this tab" (sessionStorage) is a reasonable middle ground. Never offer
  localStorage by default (I'm walking back my own proposal here).
- Name the actual browser-CORS mechanism, e.g. Anthropic's `anthropic-dangerous-direct-browser-access`
  header. Also add **local OpenAI-compatible endpoints** (Ollama/LM Studio): that's the only LLM path
  that is truly free and needs no key.
- LLM "explanations" are shown to the user, so render them as text only (no HTML) and cap their
  length.

## Concrete suggestions

1. **Add an antagonist that moves.** Example: "Gloom" creatures (from Lanternfall) that move a
   known number of tiles per round toward the crawler/relays, can be blocked by built barriers, and
   are repelled by powered tiles. They stay deterministic and forecastable, but turn every round into
   a triage decision. Let storms destroy *unshielded* cargo on a direct hit in hard difficulty.
2. **Bring Lanternfall's light into the turn model.** Powered relays light their surroundings. Fog
   equals the dark. That gives "restore the network" a visible payoff and makes fog part of the theme,
   not an M4 add-on. Consider moving basic fog to M2.
3. **Pacing tools:** an "auto-lock when all humans have submitted" option, a "repeat last plan"
   default, fast-forward animations, and an optional "continue for N rounds unless something
   changes" mode for solo play.
4. **Persistent orders:** let any controller submit an `Order` (e.g. `{deliver item→relay}`,
   `{goTo pos}`, `{hold switch}`) that a deterministic local executor expands into one action per
   round until it completes or becomes illegal. LLMs re-plan only when it's done or invalidated.
   Humans can also use it ("auto-path there"). Executor output is logged as accepted actions, so
   replays don't change.
5. **Map pings** (`help`, `go here`, `hold this`) that allied bots respond to. That's spatial commands
   without needing chat.
6. **Compact LLM view:** an ASCII mini-map + an entity list + `legalActions` grouped by kind
   (e.g. `move: N,E` / `build bridge at: (3,4),(3,5)`). Skip the LLM call if the hash of the salient
   observation fields hasn't changed.
7. **Unify fallback:** every failure (timeout, malformed output, illegal action, provider down) uses
   the slot's **companion rule bot**, with a visible indicator, and is logged in the replay as
   `source: 'fallback'`.
8. **Fix the body-block exploit:** an actor that stays still for 2+ rounds on a chokepoint can be
   "shouldered" (swapped) by an opponent. Alternatively, guarantee 2-wide routes to every scoring site
   during map validation.
9. **Split M5** into M5a (LLM adapters: browser key + local model + fake provider) and M5b (online).
   Evaluate WebRTC P2P with commit–reveal action hashes as a zero-infra option before committing to a
   hosted WebSocket server.
10. **Determinism hardening from M1:** a state hash every round, golden-replay tests in CI, ESLint
    `no-restricted-globals` in `engine/`, `import/no-restricted-paths` for the engine/view boundary,
    and deterministic bot budgets in tests.

## Ideas from Lanternfall to merge

| Lanternfall idea | Merge? | Notes |
|---|---|---|
| Gloom antagonist + light/fog theme | **Yes (M2)** | Adapted to discrete, forecastable rounds (suggestions 1–2) |
| The Dimming: hidden-role social mode | **Yes (post-M4)** | Even better with rounds: add a discussion/vote phase between rounds. The best LLM showcase. Chat is treated as untrusted data and length-capped |
| Intent/executor layer | **Yes, as persistent Orders** | Not needed for latency any more, but cuts LLM calls and helps humans |
| Companion-bot fallback | **Yes** | Replaces `wait` fallback |
| Ping-to-command bots | **Yes (M2)** | Complements Codex's priority intents |
| Arena / headless bot ladder in Node | **Yes (M3)** | Generalises Codex's "100 bot matches" gate. Use it for balance and regression testing |
| Local LLM provider (Ollama/LM Studio) | **Yes (M5a)** | The only free LLM path |
| Lint bans, gitleaks, "no `VITE_` secrets" policy, ADRs | **Yes (M1)** | Cheap, prevents whole classes of bugs/leaks |
| Bot personality profiles (JSON weights) | **Yes** | Cheap variety; tunable via Arena |
| Cosmetic meta-progression; Delve roguelite | **Later (M6+)** | Replay value and "large scope" once three modes are solid |
| 10 Hz real-time sim, fixed-point, melee; PixiJS | **No** | Round model fits the brief better; Phaser is fine for a discrete sim |
| localStorage "remember key" | **No** | Memory by default, optional sessionStorage at most |

## Proposed next step

Record the merged design in `docs/adr/0001-core-model.md` (Codex's round engine and protocol, plus
Orders, companion fallback, pings, a forecastable antagonist). Build Codex's M1 as-is, plus the tooling
from suggestion 10. Decide the theme after M2 playtests show whether the base loop is fun.
