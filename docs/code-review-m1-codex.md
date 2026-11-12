# Lanternfall M1 — focused Codex review

Reviewed DESIGN §2.1, §5–§8 against src/, tests/ and tools/.
Validation: `npm test` passes (11 files, 98 tests). No P0 found.
Priorities: P1 = correctness/trust boundary; P2 = scoped bug or coverage gap.

1. **P1 — Pull replies are not bound to their originating seat.**
   `src/session/coordinator.ts:125`: a reply's supplied ID overrides `expectedId`.
   A synchronous bot returning an old ID leaves its own entry unsettled forever
   (bots have no timeout); returning another open seat's ID can decide that seat.
   Confirmed the stale-ID stall with a targeted probe. Fix: locate pull entries by
   `expectedId`, validate the supplied ID against it, and settle that entry to
   fallback on rejection. Test stale IDs and cross-seat replies, sync and async.

2. **P1 — Controller observations can mutate session data and validation inputs.**
   `src/engine/observe.ts:52`, `:76`, `:100` return session Order/Ping references;
   `src/session/coordinator.ts:179` passes the same mutable request later used at
   `:130` for validation and at `:248` for execution. Readonly types do not protect
   runtime objects: mutating `obs.self.order.at.x` changes the persistent order
   (confirmed), and rewriting `obs.legal` can steer intake/fallback decisions.
   Fix: detach and recursively freeze controller snapshots; keep authoritative
   legality separate. Test malicious mutations and isolation between seats.

3. **P2 — Replay import does not meet the schema-validation contract.**
   `src/session/replay.ts:108` checks only header presence, format and rounds array.
   Missing roster, null round records or null actions survive parsing and throw
   inside `verifyReplay` instead of producing a clear rejection. `:101` also
   reports success when the declared `replay.result` disagrees with derived state.
   Fix: validate nested header/roster/actions/checkpoints and bounded integer
   fields before simulation; reject terminal-state inconsistencies and catch
   invalid step inputs. Add malformed-import and tampered-result tests.

4. **P2 — The helper never picks up loose Ember once veins are exhausted.**
   `src/controllers/bots/helper.ts:148`: recovery issues only `goTo(pile.pos)`.
   On arrival, goTo returns wait; every later decision selects the same order.
   Confirmed an empty-handed helper standing on a pile returns wait. This strands
   Ember dropped on snuff precisely when remaining supplies matter most.
   Fix: choose a legal pickup before choosing recovery travel; select a reachable
   pile. Test recovery through pickup and delivery with no remaining veins.

5. **P2 — Timeout does not abort the expired controller's signal.**
   `src/session/coordinator.ts:189` settles the entry, but the shared signal is
   aborted only at `:210`, after every seat settles. While a Tactical human waits,
   timed-out work can continue indefinitely, contrary to DESIGN §5.1.
   Fix: use per-request AbortControllers, abort each on timeout, and abort all on
   round completion/disposal. Test that the expired signal is already aborted
   while another seat remains pending.

6. **P2 — Companion decisions bypass runtime validation.**
   `src/session/coordinator.ts:258` checks action membership only, accepting extra
   action fields and unbounded labels from companions; their request IDs are also
   ignored. This contradicts §5's validation requirement for every controller and
   can place arbitrary extra action data in exported replays.
   Fix: run synchronous companion output through `validateDecision`, use its clean
   copy, and cap the final fallback label. Test malformed companion responses.

7. **P2 — Snuffed actors can reinstall orders before respawning.**
   `src/session/coordinator.ts:232` writes a decision's order before the snuffed
   check at `:235`. Although the snuff round clears orders, a later snuffed round
   can set a persistent order which survives respawn and then executes.
   Fix: ignore/clear orders while snuffed before applying decision metadata.
   Test that orders remain null throughout the respawn delay (§2.1.3).

8. **P2 — Forecast/queue tests miss their advertised guarantees.**
   `tests/unit/hold.test.ts:102` supplies an empty path and only asserts length ≤5,
   so always returning empty forecasts passes. The queue test at `:117` stops
   before retrying or introducing its newer wave, so it never checks FIFO retry.
   Fix: build a known nonempty path and assert the exact first five positions;
   advance the queue scenario into the next wave and assert placement/queue order.
