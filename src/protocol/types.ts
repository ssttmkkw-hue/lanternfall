// Lanternfall wire protocol (DESIGN.md §5). JSON-only types shared by every controller kind.
import { PROTOCOL_VERSION } from './version';
export { PROTOCOL_VERSION };

export type ActorId = number; // stable slot index 0..7
export type EntityId = number; // monotonic, never reused within a match
export type TeamId = number;
export type Dir = 'N' | 'E' | 'S' | 'W';
export type Pos = Readonly<{ x: number; y: number }>; // integer tile coords
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
  | { t: 'deliver'; target: EntityId } // Hearth, Beacon, lift
  | { t: 'build'; kind: BuildKind; at: Pos }
  | { t: 'repair'; target: EntityId }
  | { t: 'ability'; at?: Pos };

export type ActionType = Action['t'];

/** Persistent multi-round goals, expanded by the executor until done or impossible.
 *  M1: the executor supports goTo, gather and guard, used only by bots (no human planner UI). */
export type Order =
  | { t: 'goTo'; at: Pos }
  | { t: 'gather'; vein?: EntityId } // mine → carry → deliver loop
  | { t: 'guard'; at: Pos; radius: number } // radius ≤ 4
  | { t: 'follow'; who: ActorId }
  | { t: 'refuel' }
  | { t: 'build'; kind: BuildKind; at: Pos };

/** Free, at most one per actor per round. Same limit for humans and bots. */
export type Ping = { kind: 'help' | 'goHere' | 'hold' | 'gather' | 'danger'; at: Pos };

export type ObservedActor = Readonly<{
  id: ActorId; team: TeamId; role: RoleId; pos: Pos; hp: number;
  carrying: 'ember' | null; label?: string;
}>;

export type ObservedEntity = Readonly<{
  id: EntityId; kind: string; pos: Pos; hp?: number;
  amount?: number; fuel?: number; owner?: TeamId;
}>;

export type LegalSet = Readonly<{
  move: readonly Dir[]; strike: readonly EntityId[]; mine: readonly EntityId[];
  pickup: readonly EntityId[]; deliver: readonly EntityId[];
  repair: readonly EntityId[];
  build: readonly Readonly<{ kind: BuildKind; at: readonly Pos[] }>[];
  ability: boolean; // M1: always false. Replaced by target-aware legality in v2 (M2)
  drop: boolean;
}>;

export type ObservedEvent = Readonly<{ round: number; text: string; kind: string }>;

export type Observation = Readonly<{
  protocolVersion: typeof PROTOCOL_VERSION;
  matchId: string;
  round: number;
  mode: Readonly<{
    id: ModeId; phase: string; roundsLeft: number | null;
    scores: Readonly<Record<TeamId, number>>;
  }>;
  self: Readonly<{
    id: ActorId; team: TeamId; role: RoleId; pos: Pos; hp: number; fuel: number;
    carrying: 'ember' | null; cooldown: number; status: 'ok' | 'dimmed' | 'snuffed';
    respawnIn: number | null; // rounds until respawn while snuffed
    order: Order | null; secret?: Readonly<{ hollow: boolean }>;
  }>;
  /** Compact grid, one char per tile. Legend: '#' wall, '.' floor, 'V' vein, 'H' hearth, '?' never seen. */
  map: Readonly<{
    w: number; h: number; terrain: readonly string[];
    lit: readonly string[]; // '1' illuminated by Hearth/Beacon (never lanterns)
    visible: readonly string[]; // '1' currently seen, '0' remembered/unknown
  }>;
  actors: readonly ObservedActor[]; // allies always; enemies if visible
  entities: readonly ObservedEntity[]; // visible only
  forecast: Readonly<{
    surgeInRounds: number | null; from?: Dir;
    gloomPaths: readonly Readonly<{ id: EntityId; next: readonly Pos[] }>[];
  }>;
  team: Readonly<{ orders: Readonly<Record<ActorId, Order | null>> }>; // no shared Ember wallet
  pings: readonly Readonly<{ from: ActorId; ping: Ping; round: number }>[]; // allied, last 5 rounds
  events: readonly ObservedEvent[]; // since last obs, filtered
  chat: readonly Readonly<{ from: ActorId; text: string; round: number }>[]; // modes with chat only
  legal: LegalSet;
}>;

export type DecisionRequest = Readonly<{
  requestId: string; // `${matchId}:${round}:${actorId}`
  observation: Observation;
  decisionSeed: number; // hash32(matchSeed, round, actorId), PRNG = sfc32 v1
  budget: Readonly<{ nodes: number; deadlineMs: number | null }>;
}>;

export type Decision = Readonly<{
  requestId: string;
  action?: Action; // this round; omitted → use order/fallback
  order?: Order | null; // replace persistent order; null clears it
  ping?: Ping;
  say?: string; // ≤ 140 chars, only in modes with chat; rendered as text
  label?: string; // ≤ 48 chars visible intent
}>;

export interface ControllerContext {
  actorId: ActorId;
  modeId: ModeId;
  rulesText: string; // human-readable rules + legend for LLM prompts
}

export interface Controller {
  readonly id: string; // 'human:local', 'bot:helper@1', 'llm:anthropic', 'remote:ws'
  readonly kind: 'human' | 'bot' | 'llm' | 'remote';
  init?(ctx: ControllerContext): void | Promise<void>;
  /** Built-in bots return synchronously and deterministically. Others may be async. */
  decide(req: DecisionRequest, signal: AbortSignal): Decision | Promise<Decision>;
  /** Live pacing, human seats only. Never called in Tactical. */
  flush?(requestId: string): Decision | null;
  dispose?(): void;
}

/** One accepted action per actor per round. */
export type AcceptedAction = Readonly<{
  actor: ActorId; action: Action; ping?: Ping;
  source: 'controller' | 'order' | 'fallback' | 'idle';
}>;

/** The replay body: one record per round. Versioned with PROTOCOL_VERSION. */
export type RoundInput = Readonly<{
  round: number;
  actions: readonly AcceptedAction[]; // M1: the only field
  orders?: readonly Readonly<{ actor: ActorId; order: Order | null }>[];
  say?: readonly Readonly<{ actor: ActorId; text: string }>[];
  modeCommands?: readonly never[];
}>;
