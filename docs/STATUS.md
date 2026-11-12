# STATUS — Lanternfall (ai-coop-game)

Last updated: 2026-11-12 ~13:35 JST. Local repo only: /workspace/ai-coop-game (branch main). Not pushed, not deployed.

## Done (round 1)
- Design: `proposal-claude.md` (Lanternfall), `proposal-codex.md` (Relay Frontier), cross-reviews
  `review-by-codex.md` / `review-by-claude.md`, synthesized `DESIGN.md`, Codex design review
  `review-design-by-codex.md` (10 issues), all P0s fixed in DESIGN.md.
- M1 (mostly done): Vite + TS, pure deterministic engine (integer, seeded RNG, per-round hash),
  protocol types + validator, Tactical session coordinator, Canvas2D view + HUD, keyboard human seat,
  `bot:helper@1` rule bot with labels, order executor (goTo/gather/guard), Hold the Light mode on a
  16x16 map, replay recorder + verifyReplay + golden replay, headless runner, Pages workflow (never run).
- Codex code review `code-review-m1-codex.md` (8 findings, no P0) -> all fixed by Claude (see Resolution).
- Verified: `npm run build` OK; `npm test` 117/117; `npm run headless -- --seed 1 --n 100` 100 wins.

## M1 remaining gaps
- ESLint boundary/global-ban config not added (a Vitest boundary test stands in). -> Codex (small task)
- Live pacing not built (gated; moves to M2 first item if not done).
- Balance: 1 human (passive) + 1 bot loses ~round 60; tune Surge/Ember so human+bot is winnable.
- Pages subpath acceptance not tested (needs a push + Pages; ask kk first — public deploy).
- Uses `base: './'` instead of DESIGN's BASE_PATH env.

## Next round (each ~5.5h quota window)
1. Claude: M1 close-out — balance tuning, Live pacing behind the gate, playtest polish.
2. Codex: ESLint config (engine boundary + banned globals) + determinism checker script; short review of Claude's close-out.
3. Claude: draft protocol-v2 ADR (docs/adr/) for M2; Codex signs off (required by DESIGN §10).
4. Claude: implement M2 (Beacons, fog/vision, roles + bots, Orders/click-to-path, pings, lobby, hot-seat, maps, tutorial).
5. Codex: code review of M2 (leak tests, determinism), Claude fixes.
Owners: Claude = bulk implementation (engine, UI, modes, bots, content, server). Codex = reviews + small isolated tasks.

## Usage limits
- No usage-limit hits from either CLI in this round.

## How to run
`npm install && npm run dev` (keys: WASD/arrows move, E mine/deliver/pickup, F strike, Q drop, Space wait,
Enter lock, Z undo, T quick-lock toggle, Shift+R restart; `#seed=N` in URL).
Logs of each CLI run: `.logs/` (gitignored).
