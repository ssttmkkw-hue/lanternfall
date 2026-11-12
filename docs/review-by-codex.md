# Codex review of Lanternfall

Lanternfall has a stronger immediate visual identity than Relay Frontier: light is simultaneously a resource, territory, information, and safety. I would keep that identity and prototype it. The main concern is that the proposal treats architectural extensibility as evidence that six modes, satisfying combat, capable teammates, social deduction, and networking will be affordable. Those remain separate design and production problems.

## Strengths

- The explore–gather–illuminate–defend loop creates a clear shared resource dilemma. Expanding safety while increasing the perimeter to defend could produce good cooperative decisions.
- A solo human with bot allies is a sensible default that makes the game useful before networking or LLM integration exists.
- The controller/observation/action boundary, deterministic engine, renderer separation, and offline rule bots directly fit the brief.
- Persistent intents plus a local executor are a good fit for slow LLM decisions in a continuous game. This is worth retaining over my proposal's single-action LLM contract if Lanternfall stays real time.
- Pings offer practical human-to-bot coordination without requiring conversation. Headless matches and replay checks provide useful development tools.
- The static build is independent of optional external services. A separate backend is correctly described as separate from GitHub Pages.

## Weaknesses and risks

### Fun and cooperative agency

The resource loop is promising, but its interesting choices are not yet demonstrated. If Beacons refuel indefinitely, building enough of them may remove fuel pressure; if upkeep and surges dominate, exploration may become repetitive maintenance. Specify whether refueling consumes Ember, whether veins replenish, and what forces a meaningful choice between expansion and defense.

Hold the Light is largely survival defense, while the headline fantasy includes descent and extraction. M1 needs one clear objective and a reason to leave safety. Three surges on a fixed map can test this; a progression economy cannot fix a dull five-minute match.

Bots may either do all useful work or leave the human repairing their mistakes. Roles alone do not establish cooperation. Show at least one concrete sequence where a human's decision changes a bot's task and the bot visibly enables the human's success. Avoid mandatory role dependencies that make a weak or missing bot block progress.

The Dimming is especially risky: a confused bot and a deliberately sabotaging bot may look identical. LLM-only free text also gives controller types different communication capabilities. Defer this mode until ordinary teammate behavior is reliable and all players have equivalent communication options.

### AI participation and trust

The engine cannot distinguish controllers, but that does not prevent a same-origin JavaScript bot from importing engine state. Filtered observations establish an API discipline, not a security sandbox. Built-in bots can be trusted; community scripts need a separate isolation design or must remain explicitly trusted local code.

Observation semantics need work: define team vision, remembered terrain, stale ally positions, event filtering, and whether the rectangular tile buffer masks unseen cells. Events and chat can leak secrets even when entity lists are filtered. Mutable typed arrays must not expose engine-owned buffers.

The executor is part of the player's intelligence. If it uses the full map for A*, target selection, or steering, the AI cheats despite receiving a filtered observation. Define its permitted knowledge, including remembered terrain, and test the entire observation-to-action path.

Async hosting lacks request identity, cancellation, and stale-response policy. A result arriving after timeout, death, restart, or controller replacement must not overwrite a newer plan. Tick-based deadlines also need explicit pause/background-tab behavior. A synchronous bot can freeze the page before fallback runs; untrusted or expensive decisions need worker isolation and host-enforced budgets.

The one-Action-per-tick union also means moving, attacking, and pinging compete for the same slot. Decide whether this deliberate action economy feels good; otherwise use a validated input frame with separate movement and bounded commands. Humans and bots should receive the same limits.

### Determinism and replay correctness

Fixed ticks, seeded randomness, and stable ordering are good foundations, but they are not a complete specification. Define simultaneous collisions, contested pickups, shared-resource spending, combat/build ordering, entity spawning, and mode-hook order before implementation.

The proposal alternates between logging actions and logging async intents. Seed plus accepted per-tick actions is the simpler authoritative replay contract. Intent-only replay additionally depends on executor version, internal plans, pathfinding caches, and agent knowledge. Record the final action stream; retain intents as optional diagnostics.

Include engine/content/protocol versions, initial roster/loadouts, canonical serialization, and checkpoint checksums. Typed arrays are not ordinary JSON arrays; define their encoding. Specify fixed-point ranges and overflow behavior, especially for multiplication through JavaScript bitwise operations. Fixed-point does not eliminate arithmetic bugs.

Async live matches need not produce identical results from the same seed because arrival timing changes accepted actions. Replaying an accepted action log can still be deterministic. State that distinction explicitly.

### Scope and browser feasibility

PixiJS is a reasonable renderer, but Phaser need not own simulation timing or physics, and Canvas2D is not inherently too slow for the initial map. Choose the tool the developers can ship with; benchmark lighting before making shader infrastructure a prerequisite.

At 10 Hz, input can wait nearly 100 ms before simulation, before networking delay. Interpolation smooths motion but does not remove response latency. Prototype movement and melee at 10 and 20 Hz, including diagonal wall collisions, and choose from playtests.

The 160×160/300-creature/4 ms target is an unvalidated expansion goal. Flow fields still require per-creature updates, dirty lighting can become broadly dirty, and worker snapshot copying has a cost. Begin with a small measured scenario and add optimizations when profiles justify them.

M2–M6 each combine multiple major projects. Six modes, four roles, procedural generation, metaprogression, networking, community scripting, and a campaign exceed a credible initial release. Mode plugins reduce duplication; they do not provide balance, bots, UI, or tutorials for free.

Static local play is feasible. WebRTC rooms are a separate connectivity project: manual signaling is awkward, some connections need TURN, and free public infrastructure is not a reliability plan. Lockstep peers also possess full state, so fog filtering cannot protect hidden roles from a modified client. Treat P2P as trusted-friends play; use an authoritative service with filtered snapshots for adversarial hidden-information games.

“Works fully offline” needs qualification: a built site can run without APIs, but revisiting it without connectivity requires an explicit caching strategy. Direct provider requests and localhost models also depend on CORS, browser security rules, and provider configuration; a generic compatible endpoint is not a compatibility guarantee.

### LLM keys and security

No bundled shared key is the correct baseline. However, sessionStorage is readable by page scripts, and localStorage extends exposure across sessions. The risk table's “sessionStorage only” also contradicts the optional persistent storage in §4.5. Prefer memory-only keys, explicit enablement, and clearing on disconnect/reload; omit “remember key” initially.

Use explicit provider origins, HTTPS for remote providers, no third-party scripts on the key-entry surface, redacted errors, and no credential-bearing exports. Render chat/model text as text, never HTML. Validate target legality and payload bounds as well as JSON shape. Prompt injection can still manipulate legal strategic choices; schemas limit capabilities, not persuasion.

The no-paid-services requirement means the shipped game must never depend on paid model calls. Any personal-key experiment must disclose possible charges and enforce request/token caps; local bots remain the acceptance path. A remote backend needs authentication and quotas, otherwise it becomes a publicly spendable proxy. Secret scanning should start in M1, not M4.

## Concrete changes and ideas to merge from proposal-codex.md

1. **Keep Lanternfall's theme and real-time intent executor.** Do not combine both games wholesale. Relay Frontier's full simultaneous-round system would change this game's feel; use it only if the continuous prototype fails to make slow planning satisfying.
2. **Adopt the smaller vertical slice and acceptance gates.** One hand-built 16×16 or 24×24 map, one human, one bot, one Ember source, one threatened Hearth, one refueling rule, and three short surges. Prove gather/refuel/defend coordination, win/lose/restart, replay equivalence, and a build served under the Pages subpath before roles or procedural maps.
3. **Merge visible intentions and forecast hazards.** Show “gathering west vein,” “returning to refuel,” and the next surge direction/countdown. Let co-op pings set a temporary priority with visible acknowledgment. This makes AI participation legible and failures diagnosable.
4. **Merge explicit contention rules and versioned contracts.** Borrow my proposal's treatment of collision/resource ties, request IDs, cancellation, immutable observations, runtime schemas, and accepted-action replays. Adapt the rules to ticks rather than importing turn-based movement unchanged.
5. **Merge memory-only credentials and untrusted-output handling.** Keep the provider-neutral adapter, companion fallback, hard usage caps, and optional backend. Test timeout, stale reply, malformed output, illegal target, and secret-free logs with fake providers; real paid calls are unnecessary for CI.
6. **Merge scenario validation and modest performance budgets.** Hand-author balanced maps first. Generated maps must validate spawn safety, reachable Ember/objectives, and viable routes, with a known valid fallback. Profile a documented reference device before adding large maps, flow fields, or struct-of-arrays storage.
7. **Merge early accessibility.** Keyboard-accessible menus and commands, symbols alongside light colors, scalable text, reduced motion, and local pause should begin with M1/M2. Readable silhouettes and outlines matter especially when darkness is the main visual mechanic.
8. **Choose one competitive follow-up.** Ember Rush is closest to the existing economy and tests human/bot opponents. Keep Lightkeepers as the next candidate; defer The Dimming, Delve, progression unlocks, public scripts, and online ladders. A local bot benchmark harness does not need a public Arena product.
9. **Merge the authoritative-server boundary for later online play.** Define a minimal local session interface early, without implementing networking. Private-room online play may use a separately hosted engine later; the Pages build must remain complete on its own.

## Answers to Claude's open questions

- **Pixi versus Phaser:** accept Pixi for this proposal. Neither framework is a determinism guarantee or obstacle if the engine owns state and time; avoid spending the prototype budget on a renderer abstraction for hypothetical swaps.
- **10 versus 20 Hz:** test both in the small combat slice; provisionally prefer 20 Hz if melee stays central, subject to measured response and CPU cost.
- **Package manager:** use the repository's existing manager; if none exists, npm minimizes setup requirements. Commit one lockfile and use reproducible CI installs.
- **Work split:** engine/AI versus rendering/input/UI is workable after jointly reviewing action, observation, event, and snapshot schemas. First agree on a tiny replay fixture and observable bot behavior so both halves implement the same game.

**Recommendation:** proceed with a narrowed Lanternfall prototype. Its light economy and readable bot cooperation should earn further scope through playtesting; the six-mode roadmap should remain a list of options rather than a release commitment.
