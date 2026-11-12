/** Human-readable rules + legend (also the system-prompt core for future LLM seats). */
export const HOLD_RULES_TEXT = `Lanternfall — Hold the Light (M1).
Simultaneous rounds: every Lanterner submits one action per round, then all resolve together.
Goal: keep the Hearth's fuel above 0. Win by dispelling Surge 3 (round 120, from the N) or by surviving to round 160 (Dawn).
Hearth: starts 30, cap 60, burns 1 on even rounds, +5 per Ember delivered, -3 per Gloomling attack.
Ember: mine a vein (adjacent, empty hands) to carry 1 Ember; deliver it next to the Hearth. Veins never refill.
Lantern fuel 20: -1 each round you end outside Hearth light, refilled in light. At 0 you are Dimmed (wait, or move on even rounds).
Gloomlings (2 HP) spawn in Surges (round 40 W, 80 E, 120 N), walk a shown path to the Hearth, attack adjacent actors (1) or the Hearth (3). Strike deals 1.
At 0 HP you are Snuffed: drop your Ember, respawn by the Hearth 3 rounds later.
Map legend: '#' wall, '.' floor, 'V' vein, 'H' hearth. lit '1' = illuminated.
Actions: wait | move{dir N/E/S/W} | strike{target} | mine{target} | pickup{target} | drop | deliver{target}.`;
