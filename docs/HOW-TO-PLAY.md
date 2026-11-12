# Lanternfall · 灯陨 — How to Play / 玩法说明

> 本说明只描述**当前版本（M1 原型）真实可玩的内容**。标注为「尚未实现」的内容只是计划，现在的游戏里还没有。
> This guide describes **only what the current build (the M1 prototype) actually does**. Anything marked
> "planned / not implemented yet" is not in the game today.

- [简体中文](#简体中文)
- [English](#english)

---

## 简体中文

### 1. 游戏简介

**灯陨（Lanternfall）· 守住光（Hold the Light）**

地面世界已经陷入黑暗。你是一名 **提灯人（Lanterner）**，和一个 AI 队友一起守在地底洞穴的中央 **炉心（Hearth）** 旁。
你们要去矿脉挖 **余烬（Ember）**、把它送回炉心添火，同时抵挡三波从黑暗中涌来的 **幽影（Gloomling）**。

- 这是一个**合作**游戏：你和 AI 队友赢就一起赢，输就一起输。
- 地图是固定的一张 16×16 洞穴「The First Hollow」，一局最多 160 回合。
- 游戏界面目前**只有英文**，下文会把界面上的英文词写在括号里，方便对照。

### 2. 胜利与失败条件

每回合结束时按以下顺序判定：

1. **失败**：炉心燃料（Hearth fuel）降到 **0**。界面显示 “The Hearth went out”。
   同一回合里如果同时满足失败和胜利，**以失败为准**。
2. **胜利**：第 3 波暗潮（Surge 3，第 120 回合从北边出现）的幽影**全部已经出场**，并且地图上**一只幽影都不剩**
   （包括前两波没清掉的）。界面显示 “Victory: the last Surge is broken”。
3. **黎明胜利**：撑到第 **160** 回合结束时炉心还亮着。界面显示 “Dawn: the Hearth held”。

注意：你和队友同时被击倒（熄灭）**不算**失败，只有炉心熄灭才算输。

结束画面可以点 **Play again**（新的一局）或 **Download replay**（下载回放文件）。

### 3. 操作方式

游戏**只能用键盘**操作行动。棋盘（画布）上**没有鼠标点击操作**，鼠标只能点页面上的按钮。目前没有触屏操作。

| 按键 | 作用 |
|---|---|
| 方向键 / **W A S D** | 向上 / 左 / 下 / 右移动一格 |
| **E** | 交互：按优先级自动选择 **送余烬进炉心 → 挖矿 → 捡起地上的余烬**（选第一个可执行的） |
| **F** | 攻击相邻的幽影；相邻有多只时，每按一次切换到下一个目标 |
| **Q** | 把手里的余烬丢在脚下 |
| **空格** 或 **.**（句号） | 原地等待 |
| **Enter** | 锁定本回合行动（什么都没选就锁定 = 等待） |
| **Z** 或 **Backspace** | 撤销尚未锁定的选择 |
| **T** | 开/关「快速锁定（Quick lock）」 |
| **Shift + R** | 用新的随机种子重开一局 |

开始画面：按 **Enter** 或 **空格**，或点 **Start match** 开始。

页面顶部按钮：

- **Lock (Enter)**：锁定行动，和按 Enter 一样。
- **Restart**：用新的随机种子重开。
- **Download replay**：下载本局回放（JSON 文件）。

**快速锁定（默认开启）**：按下任一行动键（移动、E、F、Q、空格）就立即锁定，一键一回合。
关闭后（按 **T**），行动键只是「预选」：棋盘上会用蓝框标出目标格，你可以按 Z 撤销、换选择，确认后按 **Enter** 锁定。
需要在多只相邻幽影之间挑目标时，建议先关掉快速锁定，用 F 切换目标再锁定。

如果某个行动当前不可执行（比如没站在矿脉旁边就按 E），右侧会提示 “Can't … right now.”，不会消耗回合。

小技巧：在网址后面加上 `#seed=数字`（例如 `#seed=42`）再点 Start match，就能用指定的种子开局。
（Restart / Play again 总是用新的随机种子。）

### 4. 回合结构（战术节奏）

- 游戏按**回合**进行，所有角色**同时行动**：每个人每回合选一个行动，全部锁定后一起结算。
- 当前只有 **战术节奏（Tactical）**：**没有计时器**，游戏会一直等你锁定。AI 队友会立刻做出决定。
- 结算顺序（同一回合内）：
  1. 移动（所有人同时）；
  2. 攻击（所有攻击同时生效，伤害叠加，被打死的幽影本回合**不会再行动**）；
  3. 资源：送余烬 → 挖矿 → 捡起 → 丢下；
  4. 幽影行动（攻击或移动）；
  5. 炉心燃烧、灯油更新；
  6. 倒下 / 复活；
  7. 新一波幽影出场；
  8. 判定胜负。
- **移动冲突**：两个角色想进同一格，**都会失败**；往有人的格子走，只有对方同时让开才行；和队友**互换位置**可以成功。
  有幽影的格子不能走进去。

### 5. 角色与单位

**目前只有一种角色：提灯人（Lanterner）**，你和队友能力完全相同。（专门职业尚未实现，见第 10 节。）

| 单位 | 外观 | 说明 |
|---|---|---|
| 你 | 蓝色圆，写着 **Y** | 生命 3，灯油 20，一次只能拿 1 个余烬 |
| AI 队友 | 绿色圆，写着 **B1** | 同上 |
| 幽影（Gloomling） | 紫色尖刺状，上方有生命点 | 生命 2，你的每次攻击造成 1 点伤害 |
| 炉心（Hearth） | 地图中央的火焰，外圈的弧表示燃料多少 | 不能走上去 |
| 矿脉 | 红色方块，数字 = 剩余余烬 | 挖空后变暗，显示 0；会挡路也会挡光 |
| 地上的余烬 | 橙色小菱形（多于 1 个时显示数字） | 可以捡起 |

角色下方的红色小点是生命值；角色右上角的橙色菱形表示正拿着余烬。

**生命与倒下（Snuffed）**：生命降到 0 会「熄灭」，手里的余烬掉在原地，3 回合后在炉心旁复活，生命和灯油回满。
熄灭期间你什么都不能做（游戏会自动帮你锁定等待）。当前版本**没有治疗**，只有复活会回满生命。

### 6. 资源

**炉心燃料（Hearth fuel）**
- 开局 30，上限 60（超过 60 的部分浪费）。
- 每个**偶数回合**燃烧 1（也就是每 2 回合 −1）。
- 每送进 1 个余烬 **+5**。
- 每次被幽影攻击 **−3**。
- 降到 0 就输了。如果什么都不送，大约第 60 回合就会熄灭。
- 炉心照亮周围半径 4 的范围（墙和矿脉会挡光）。亮的地面是暖棕色，暗处是深色并带两道小斜线标记。

**余烬（Ember）**
- 空手站在矿脉**正上下左右相邻**的格子上按 **E** 挖矿，得到 1 个余烬。
- 拿着余烬站到炉心**正相邻**的格子按 **E** 送进炉心。
- 按 **Q** 可以丢在脚下；脚下或相邻格的余烬，空手按 **E** 可以捡起（两个人同一回合捡同一堆，都会失败）。
- 矿脉**不会再生**。整张地图一共 30 个余烬：炉心光圈内只有两条小矿（各 3 个），大矿（4–6 个）都在黑暗里。
- 没有共享的「金库」：余烬只存在于矿脉、手上、地上，或已经送进炉心。

**灯油（Lantern fuel）**
- 每人 20。回合结束时站在**亮处**：灯油回满；站在**暗处**：−1。
- 灯油降到 0 会进入 **黯淡（Dimmed）** 状态：只能等待，或在**偶数回合**移动，不能挖矿、攻击、送余烬。
  你的角色外圈会出现白色虚线圈，右侧状态栏显示 “Dimmed (move on even rounds)”。
- 走回亮处并在那里结束回合，就会恢复正常、灯油回满。
- 注意：自己的灯**不会照亮地面**，只有炉心的光算「亮处」。

**信标（Beacon）**：**尚未实现**（计划在 M2 加入）。

### 7. 幽影与暗潮预警

**三波暗潮（Surge）：**

| 波次 | 出现回合 | 方向 | 数量 |
|---|---|---|---|
| 1 | 第 40 回合 | 西（W，左边缘） | 2 |
| 2 | 第 80 回合 | 东（E，右边缘） | 3 |
| 3 | 第 120 回合 | 北（N，上边缘） | 4 |

幽影在该回合结算的最后阶段出现在对应边缘的出生点上（出生点被占时会排队，之后再出）。

**你能看到的预警：**
- 右侧面板一直显示 “Next Surge in **N**”（距下一波还有几回合）。
- 距离 **8 回合以内**时，会显示方向（例如 “from **W** ⚠”），并且棋盘对应的边缘会出现**闪烁的紫色光带**。
- 到达当回合时显示 “Surge **this round** from …!”。第 3 波之后显示 “All Surges have risen”。
- 每只幽影前方会画出**紫色虚线**，表示它接下来最多 5 步的路线。
- 面板上还显示当前场上幽影数量（Gloomlings: N）。

**幽影的行为：**
- 一直朝炉心走（路线会绕开墙和矿脉，但不会绕开人——被人挡住就停在原地）。
- 每回合只做一件事：如果旁边（上下左右）有人，就攻击**生命最低**的那个人（−1 生命）；否则如果挨着炉心，就攻击炉心（−3 燃料）；否则沿路线走一步。
- 站在**亮处**的幽影只在偶数回合移动——光能拖慢它们。
- 幽影生命 2。攻击在幽影行动**之前**结算：两个人同一回合一起打，它会直接消失，来不及反击。

### 8. AI 队友是怎么工作的

当前版本固定是 **1 名玩家 + 1 个 AI 队友（B1）**。B1 是一个内置的规则型机器人（不是大语言模型，不联网），
它和你一样每回合只能选一个合法行动，看到的信息也和你一样。

B1 每回合大致按这个优先级决定做什么：

1. 旁边有幽影 → 攻击（优先打血少的）。
2. 拿着余烬站在炉心旁、并且炉心还没快满 → 送进炉心。
3. 炉心附近（12 格以内）有幽影 → 回去守炉心。
4. 下一波暗潮 3 回合内就到、手上没东西 → 回炉心旁准备迎敌。
5. 在暗处且灯油不够走回亮处 → 先回到光里。
6. 拿着余烬 → 送回炉心（炉心燃料超过 55 时会先拿着等一等，避免浪费）。
7. 去挖最近、并且灯油够来回的矿脉（会尽量避开你正在挖、快挖空的那条）。
8. 捡起地上掉落的余烬。
9. 都没有 → 在炉心旁警戒。

右侧 **Team** 面板会显示 B1 的生命、是否拿着余烬，以及它当前的意图（例如 “Gathering Ember (vein #3)”、
“Guarding the Hearth”）。如果出现 **⟲** 标记，表示这一回合用的是备用机器人决策。

B1 不会说话，也不会响应你的指令——当前版本**没有**给队友下命令或发信号的方式。

### 9. 新手建议

- **一开始就去挖矿。** 不送余烬，炉心大约第 60 回合就灭了；只靠 AI 队友一个人很难撑住。
- **先挖光圈内的两条小矿**（炉心北边和东南边，各 3 个），在光里挖不耗灯油。
- **去暗处之前算好灯油。** 20 点灯油足够直接跑去远处矿脉再跑回来，但别在黑暗里绕路。灯油见底就会黯淡、几乎动不了。
- **别让炉心满了还送。** 上限 60，溢出部分浪费。可以先拿着余烬，等燃料降一点再送。
- **盯着倒计时。** 方向一出现（8 回合内），就该往炉心靠拢了，最好带着余烬回去。
- **和队友一起打。** 两人同回合攻击同一只幽影可以一回合秒掉，它来不及还手。
- **在幽影走到炉心之前拦住它。** 它旁边有人时会先打人而不是炉心——人掉 1 血，炉心掉 3 燃料。
- **血少就别硬扛。** 没有治疗；熄灭会掉落余烬并离场 3 回合。
- **想慢慢想就关掉快速锁定（T）。** 游戏不计时，可以预选、看蓝框、撤销，再按 Enter。
- 别忘了：清掉第 3 波（且场上没有其他幽影）就能**提前获胜**，不必撑到 160 回合。

### 10. 尚未实现的功能（计划中）

以下内容出现在设计文档里，但**当前版本还没有**：

- **实时节奏（Live）**：每约 400 毫秒自动推进一回合。目前只有不计时的战术节奏。
- **信标（Beacon）**、建造与修理。
- **战争迷雾 / 视野**：目前整张地图始终完全可见（但光照仍然影响灯油和幽影速度）。
- **职业与技能**：守卫（Warden）、斥候（Scout）、工匠（Smith）、医师（Medic）。
- **信号（Ping）**：给队友发「帮忙 / 去这里 / 守住 / 采集 / 危险」信号。
- **给队友下命令、鼠标点击寻路、行动规划界面**。
- **新手教程**、大厅 / 队伍编辑、多名玩家同屏轮流（hot-seat）、更多 AI 队友。
- 更多地图、完整版「守住光」（8 波暗潮）。
- 其他模式：Ember Rush（团队对抗）、Lightkeepers（领地）、The Dimming（隐藏身份）。
- 可选的大语言模型（LLM）队友、在线联机。
- 游戏内回放查看器 / 导入回放（目前只能下载回放文件）。
- 无障碍选项（减少动画、暂停、文字缩放）、音效、触屏操作、中文界面。

---

## English

### 1. About the game

**Lanternfall · Hold the Light**

The world above has gone dark. You are a **Lanterner**, and together with one AI teammate you guard the
**Hearth** at the centre of an underground cavern. Mine **Ember** from veins, carry it back to feed the
Hearth, and hold off three Surges of **Gloomlings** that come out of the dark.

- It is **co-operative**: you and your AI teammate win or lose together.
- There is one fixed 16×16 map ("The First Hollow"), and a match lasts at most 160 rounds.

### 2. How you win and lose

Checked at the end of every round, in this order:

1. **Loss**: the Hearth's fuel reaches **0**. Screen: "The Hearth went out". If a loss and a win happen in
   the same round, **the loss wins**.
2. **Victory**: Surge 3 (round 120, from the north) has **fully spawned** and there are **no Gloomlings
   left** on the map, including any left over from earlier Surges. Screen: "Victory: the last Surge is broken".
3. **Dawn**: the Hearth is still burning at the end of round **160**. Screen: "Dawn: the Hearth held".

Note: both of you being knocked out (Snuffed) at the same time is **not** a loss. Only the Hearth going out is.

The end screen offers **Play again** (new match) and **Download replay** (a JSON replay file).

### 3. Controls

You act with the **keyboard only**. There is **no mouse input on the board** — the mouse is only for the
page buttons. There are no touch controls yet.

| Key | Action |
|---|---|
| Arrow keys / **W A S D** | Move one tile up / left / down / right |
| **E** | Interact. Picks the first thing that's possible, in this order: **feed the Hearth → mine → pick up Ember** |
| **F** | Strike an adjacent Gloomling. With several adjacent, each press moves to the next target |
| **Q** | Drop the Ember you're carrying onto your tile |
| **Space** or **.** (period) | Wait |
| **Enter** | Lock your action for this round (locking with nothing chosen = wait) |
| **Z** or **Backspace** | Undo your choice (before locking) |
| **T** | Toggle **Quick lock** on/off |
| **Shift + R** | Restart with a new random seed |

On the start card, press **Enter** or **Space**, or click **Start match**.

Buttons at the top of the page:

- **Lock (Enter)**: same as pressing Enter.
- **Restart**: new match with a new random seed.
- **Download replay**: saves this match's replay as JSON.

**Quick lock (on by default):** any action key (move, E, F, Q, Space) locks your action immediately — one
key, one round. Turn it off with **T** and action keys only *select* an action: a blue outline marks the
target tile, you can press Z to undo or pick something else, then press **Enter** to lock.
If you want to choose between several adjacent Gloomlings, turn Quick lock off, cycle with F, then lock.

If an action isn't possible (for example pressing E away from any vein), the panel shows "Can't … right
now." and no round is spent.

Tip: add `#seed=<number>` to the URL (e.g. `#seed=42`) before clicking Start match to play a specific seed.
(Restart and Play again always pick a new random seed.)

### 4. Turn structure (Tactical pacing)

- The game is played in **rounds**, and everyone acts **at the same time**: each player picks one action,
  and once everyone is locked in, all actions resolve together.
- Only **Tactical** pacing exists right now: **there is no timer**, and the game waits for you to lock.
  The AI teammate decides instantly.
- Resolution order within a round:
  1. Movement (everyone at once).
  2. Strikes (all at once, damage adds up; a Gloomling killed here **does not act** this round).
  3. Economy: feed the Hearth → mine → pick up → drop.
  4. Gloomlings act (attack or move).
  5. The Hearth burns; lantern fuel updates.
  6. Knock-outs and respawns.
  7. New Gloomlings spawn.
  8. Win/loss check.
- **Movement conflicts:** if two characters try to enter the same tile, **both fail**. Moving into an
  occupied tile only works if its occupant moves away the same round. **Swapping places** with your
  teammate works. You can't move into a tile holding a Gloomling.

### 5. Units and roles

**There is only one role right now: the Lanterner.** You and your teammate have identical abilities.
(Specialist roles are planned; see section 10.)

| Unit | Looks like | Notes |
|---|---|---|
| You | Blue circle marked **Y** | 3 HP, 20 lantern fuel, carries at most 1 Ember |
| AI teammate | Green circle marked **B1** | Same as you |
| Gloomling | Purple spiky shape with HP pips above it | 2 HP; each of your strikes deals 1 |
| Hearth | Flame in the centre; the ring around it shows its fuel | Blocks movement |
| Vein | Red block, number = Ember left | Turns dark and shows 0 when empty; blocks movement and light |
| Loose Ember | Small orange diamond (with a number if more than 1) | Can be picked up |

Red pips under a character show HP. An orange diamond at a character's top-right means they're carrying Ember.

**HP and being Snuffed:** at 0 HP you are **Snuffed**: any Ember you carry drops on your tile, and you come
back next to the Hearth 3 rounds later with full HP and fuel. While Snuffed you can't act (the game locks
"wait" for you automatically). There is **no healing** in this build; only respawning restores HP.

### 6. Resources

**Hearth fuel**
- Starts at 30, maximum 60 (anything above 60 is wasted).
- Burns 1 on every **even round** (so −1 every 2 rounds).
- **+5** for each Ember delivered.
- **−3** each time a Gloomling attacks it.
- At 0 you lose. If nobody feeds it, it goes out around round 60.
- It lights the tiles within radius 4 (walls and veins block the light). Lit floor is warm brown; dark floor
  is dark grey with two small diagonal tick marks.

**Ember**
- Stand **orthogonally next to** a vein with empty hands and press **E** to mine 1 Ember.
- Carry it to a tile **orthogonally next to** the Hearth and press **E** to feed it.
- Press **Q** to drop it. With empty hands, **E** picks up Ember from your own tile or an adjacent one (if two
  characters try to pick up the same pile in the same round, both fail).
- Veins **never refill**. The whole map holds 30 Ember: only two small veins (3 each) sit inside the Hearth's
  light; the richer veins (4–6) are out in the dark.
- There is no shared team bank: Ember only exists in veins, in hands, on the floor, or burned in the Hearth.

**Lantern fuel**
- 20 each. If you **end a round on a lit tile**, it refills to full; if you end it in the dark, it drops by 1.
- At 0 you are **Dimmed**: you can only wait, or move on **even rounds**; no mining, striking or delivering.
  A dashed white ring appears around you and the panel says "Dimmed (move on even rounds)".
- End a round back in the light to recover and refill.
- Your own lantern does **not** light tiles. Only the Hearth's light counts.

**Beacons:** **not implemented yet** (planned for M2).

### 7. Gloomlings, Surges and warnings

**The three Surges:**

| Surge | Round | From | Count |
|---|---|---|---|
| 1 | 40 | West (left edge) | 2 |
| 2 | 80 | East (right edge) | 3 |
| 3 | 120 | North (top edge) | 4 |

Gloomlings appear at the end of that round on spawn points along that edge (if a spawn point is occupied,
they queue and appear in a later round).

**What you see:**
- The panel always shows "Next Surge in **N**" (rounds until the next Surge).
- Within **8 rounds**, it also shows the direction (e.g. "from **W** ⚠") and a **pulsing purple band** appears
  on that edge of the board.
- On the round itself: "Surge **this round** from …!". After Surge 3: "All Surges have risen".
- Each Gloomling shows a **dotted purple line** for its next (up to) 5 steps.
- The panel also shows how many Gloomlings are on the map.

**How Gloomlings behave:**
- They head for the Hearth. Their path avoids walls and veins but not characters — if you stand in the way,
  they stop.
- Each round a Gloomling does exactly one thing: if a character is next to it (up/down/left/right), it attacks
  the one with the **lowest HP** (−1 HP); otherwise, if it is next to the Hearth, it attacks the Hearth
  (−3 fuel); otherwise it takes one step along its path.
- A Gloomling standing **in the light** moves only on even rounds — light slows them down.
- Gloomlings have 2 HP. Strikes resolve **before** Gloomlings act: if you and your teammate both strike the
  same one in the same round, it's gone before it can hit back.

### 8. How the AI teammate works

The current build is always **1 human + 1 AI teammate (B1)**. B1 is a built-in rule-based bot (not a
language model, no network). Like you, it picks one legal action per round, and it sees the same
information you do.

Each round B1 roughly follows this priority list:

1. A Gloomling is adjacent → strike it (weakest first).
2. Carrying Ember next to the Hearth and the Hearth isn't nearly full → feed it.
3. A Gloomling is within 12 tiles of the Hearth → go guard the Hearth.
4. Next Surge in 3 rounds or less and hands empty → move to the Hearth to brace.
5. In the dark with just enough fuel to get back → return to the light.
6. Carrying Ember → bring it to the Hearth (if the Hearth is above 55 fuel, it holds the Ember to avoid waste).
7. Mine the nearest vein it can reach and return from on its current lantern (it tries not to crowd a
   nearly-empty vein you're working).
8. Pick up dropped Ember.
9. Otherwise → keep watch by the Hearth.

The **Team** panel on the right shows B1's HP, whether it carries Ember, and what it's doing (e.g.
"Gathering Ember (vein #3)", "Guarding the Hearth"). A **⟲** mark means a backup bot decision was used that round.

B1 doesn't talk and doesn't take orders — there is currently **no way** to command or signal your teammate.

### 9. Beginner tips

- **Start mining right away.** Without deliveries the Hearth dies around round 60, and the bot alone
  struggles to keep it alive.
- **Empty the two small veins inside the light first** (north and south-east of the Hearth, 3 Ember each).
  Mining in the light costs no lantern fuel.
- **Plan your fuel before going into the dark.** 20 fuel is enough to go straight to a far vein and back,
  but don't wander. At 0 you're Dimmed and barely able to move.
- **Don't overfill the Hearth.** The cap is 60 and overflow is wasted. Hold your Ember until there's room.
- **Watch the countdown.** When the direction appears (8 rounds out), head back toward the Hearth —
  ideally carrying Ember.
- **Gang up.** Two strikes on the same Gloomling in one round kill it before it can act.
- **Intercept before they reach the Hearth.** A Gloomling next to a character hits the character (−1 HP)
  instead of the Hearth (−3 fuel).
- **Don't trade when you're low.** There's no healing, and being Snuffed drops your Ember and takes you out
  for 3 rounds.
- **Turn Quick lock off (T) if you want to think.** There's no timer: select, check the blue outline, undo,
  then press Enter.
- Remember: clearing Surge 3 (with no other Gloomlings left) is an **early win** — you don't have to reach round 160.

### 10. Not implemented yet (planned)

These appear in the design document but are **not in the current build**:

- **Live pacing**: rounds auto-advancing every ~400 ms. Only untimed Tactical pacing exists today.
- **Beacons**, building and repairing.
- **Fog of war / vision**: the whole map is always visible (light still matters for lantern fuel and
  Gloomling speed).
- **Roles and abilities**: Warden, Scout, Smith, Medic.
- **Pings**: help / go here / hold / gather / danger signals to teammates.
- **Giving orders to teammates, click-to-path, planner UI.**
- **Tutorial**, lobby / roster editor, hot-seat multiplayer, more AI teammates.
- More maps and the full Hold the Light (8 Surges).
- Other modes: Ember Rush (teams), Lightkeepers (territory), The Dimming (hidden role).
- Optional LLM (AI language model) teammates, online play.
- In-game replay viewer / replay import (you can only download replay files today).
- Accessibility options (reduced motion, pause, text scaling), sound, touch controls, a Chinese UI.
