# Project Brief: AI + Human Co-op Game

Goal: design and build a fairly large browser game where AI players and human players play together (co-op and competitive), with varied gameplay/multiple modes, scalable to large scope.

Constraints:
- Runs in the browser (HTML5, JS/TS; e.g. Vite + TypeScript + Phaser or Canvas). Must be deployable later as a static site on GitHub Pages.
- AI players must join WITHOUT any server secret in the frontend. Design a pluggable AI-player interface: local rule-based bots now; an adapter for LLM agents later (user-supplied API key stored only in browser, or a separate backend).
- Human + AI co-op and competitive play, multiple modes / varied mechanics.
- Never commit secrets. No paid services.
- Two AI developers (Claude and Codex) will co-develop: design, implement, cross-review.
