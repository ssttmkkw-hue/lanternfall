# Codex review of DESIGN.md

Prioritized issues; P0 blocks a consistent M1, P1 needs resolution before its milestone.

1. **P0 — Light and vision lack executable rules (§2, §5).** Hearth radius, baseline
   lantern radius, distance metric, wall occlusion and whether personal light counts for
   refuelling are unspecified. Personal light could make fuel inexhaustible.
   **Fix:** define separate illumination, vision and refuel coverage, with exact radii,
   occlusion and update timing; distinguish full visibility in M1 from full illumination.

2. **P0 — Hold has no complete spawn or end schedule (§2–3, §8).** Surge spacing,
   creature counts, spawn placement contention and whether victory requires clearing the
   last wave are absent; the 8–15 minute target cannot be checked at 400 ms per round.
   **Fix:** commit an M1 rules table with round schedule, spawn rules, victory/loss
   precedence and a finite round cap; budget map Ember against that duration.

3. **P0 — Snapshot legality conflicts with post-move strikes (§5, §7).** A target
   adjacent at round start can move away, while one moving into range is initially illegal.
   **Fix:** distinguish submission validity from resolution preconditions; specify failed
   action behavior and whether newly adjacent targets can ever be selected that round.

4. **P0 — Gloom combat and actor lifecycle have unresolved ties (§2, §7).** An enemy
   adjacent to both actor and structure has no target priority; multi-target attacks,
   movement collisions, Dimmed parity and occupied respawn tiles are undefined.
   **Fix:** specify deterministic targeting/collision tables, parity origin, exact respawn
   round, restored stats and placement fallback; test these with the M1 combat rules.

5. **P0 — Tactical collection contradicts editable human input (§5.1, §6).** Rejecting
   duplicates and advancing when all seats answer can consume a human's first pending
   input before lock-in. Tactical LLMs also have a 10 s timeout despite “Live only” deadlines.
   **Fix:** keep pending edits local and submit once on explicit lock; define separate
   round and controller timeouts, including deterministic fake-time behavior in tests.

6. **P1 — Ember funding is undefined (§2, §4–5; M2).** Actors carry one Ember, Beacons
   cost three, and shared `team.ember` has no credit/debit rules. Beacon capacity, initial
   fuel, repair cost and extinguishing behavior are missing; Smith's strike trade-off is moot.
   **Fix:** define wallet deposits, construction/upkeep/repair accounting, Beacon lifecycle
   and the Smith trade-off before implementing its bot or legal-action lists.

7. **P1 — Replay records omit state-changing communication (§5, §7; M3/M6).** The
   contract says `say` is kept, but `AcceptedAction` has no such field; order changes and
   Dimming votes also have no replay representation. Checkpoints alone cannot fill gaps.
   **Fix:** define a versioned round-input record for every authoritative mutation,
   including mode commands and accepted order/chat updates; hash only replayable state.

8. **P1 — M2/M6 actions and observations are incomplete (§4–5, §7).** No resolution
   phase applies `ability`; `legal.ability` cannot express legal positions. Beacon status,
   active effects, respawn timing and Dimming vote actions/results lack typed fields.
   **Fix:** add discriminated entity/effect and mode-command types, target legality and
   effect timing before the relevant milestone; keep M1's supported subset explicit.

9. **P1 — Forecasts can bypass fog (§5; M2).** `gloomPaths` has no visibility restriction;
   future paths may reveal unseen creatures, terrain or structures despite filtered entities.
   **Fix:** define which forecasts are public and clip remaining paths to permitted knowledge;
   leak-test forecasts and remembered light alongside events and legal-action lists.

10. **P1 — M1 quietly depends on deferred tooling (§5.2, §7–8, §10).** Its acceptance
    requires 100 headless matches and golden replays, but Arena ships M3; the helper uses
    Orders while Orders ship M2. Both pacings and full phase plumbing further widen the slice.
    **Fix:** explicitly include a tiny headless runner, replay recorder and gather/guard
    executor in M1; defer unused phases and planner UI, and gate Live pacing after Tactical.
