# Lanternfall · 灯陨

Lanternfall is a co-op browser game played in simultaneous, turn-based rounds on a tile grid. You and an AI
teammate keep the Hearth burning deep underground: mine Ember, carry it home, and hold off Surges of
Gloomlings coming out of the dark. The current build is the **M1 prototype**: one mode (*Hold the Light*),
one map, one human plus one rule-based bot, and untimed Tactical rounds.

**Play it:** <https://ssttmkkw-hue.github.io/lanternfall/>

## 玩法 / How to play

**玩法（简要）：** 你（蓝色 **Y**）和 AI 队友（绿色 **B1**）要让中央的炉心一直燃烧。到矿脉旁按 **E** 挖余烬，拿回炉心旁再按 **E** 添火（每个 +5）。
炉心每 2 回合烧掉 1 点，降到 0 就输。三波幽影会在第 40、80、120 回合分别从西、东、北边出现，按 **F** 攻击它们。
清掉第 3 波或撑到第 160 回合即获胜。所有人同时行动，游戏不计时，会等你锁定。
方向键/WASD 移动 · E 挖矿/添火/捡起 · F 攻击 · Q 丢下 · 空格 等待 · Enter 锁定 · Z 撤销 · T 快速锁定开关 · Shift+R 重开。

**How to play (short):** You (blue **Y**) and your AI teammate (green **B1**) keep the central Hearth burning.
Stand next to a vein and press **E** to mine Ember, then press **E** next to the Hearth to feed it (+5 each).
The Hearth burns 1 fuel every 2 rounds; at 0 you lose. Three Surges of Gloomlings arrive on rounds 40, 80 and 120
(from the west, east and north); press **F** to strike them. Clear Surge 3 or survive to round 160 to win.
Everyone acts at the same time, and the game waits for you to lock in.
Arrows/WASD move · E mine/feed/pick up · F strike · Q drop · Space wait · Enter lock · Z undo · T quick-lock · Shift+R restart.

Full guide (中文 + English): **[docs/HOW-TO-PLAY.md](docs/HOW-TO-PLAY.md)**

## Run locally

Requires Node.js (CI uses Node 22) and npm.

```sh
npm install
npm run dev        # start the Vite dev server
npm test           # run the unit tests (Vitest)
npm run build      # type-check and build to dist/
npm run headless -- --seed 1 --n 100   # bot-only matches, no browser
```

Add `#seed=<number>` to the URL to start a match with a specific seed.

## For developers

- [docs/DESIGN.md](docs/DESIGN.md): game design, rules tables, protocol and milestones
- [docs/STATUS.md](docs/STATUS.md): current progress and known gaps
