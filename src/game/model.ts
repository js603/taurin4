export type GamePhase =
  | "exploration"
  | "travel"
  | "encounter"
  | "combat"
  | "reward";

export type AttentionLevel = "log" | "floating" | "focus" | "critical";

export type LocationId =
  | "forest-gate"
  | "old-hunt-trail"
  | "riverbank"
  | "abandoned-camp";

export interface Location {
  id: LocationId;
  name: string;
  subtitle: string;
  description: string;
  danger: number;
  travelMinutes: number;
  tags: readonly string[];
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
}

export interface EnemyState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  distanceMeters: number;
}

export interface EncounterState {
  kind: "monster";
  entityId: string;
  name: string;
  hp: number;
  maxHp: number;
  aggressive: boolean;
}

export interface TravelState {
  destinationId: LocationId;
  elapsedMs: number;
  totalMs: number;
  progress: number;
  encounterTriggered: boolean;
}

export type CombatOutcome = "none" | "hit" | "guard" | "perfect";

export interface CombatState {
  enemy: EnemyState;
  attacks: number;
  telegraphRemainingMs: number | null;
  vulnerable: boolean;
  lastOutcome: CombatOutcome;
}

export interface RewardState {
  title: string;
  items: readonly string[];
}

export interface GameLogEntry {
  id: number;
  worldMinutes: number;
  text: string;
  attention: AttentionLevel;
}

export interface GameState {
  phase: GamePhase;
  source?: "local" | "openmmo";
  worldMinutes: number;
  currentLocationId: LocationId;
  nearbyOpen: boolean;
  player: PlayerState;
  encounter?: EncounterState | null;
  travel: TravelState | null;
  combat: CombatState | null;
  reward: RewardState | null;
  logs: readonly GameLogEntry[];
  nextLogId: number;
}

export type GameCommand =
  | { type: "OPEN_NEARBY" }
  | { type: "CLOSE_NEARBY" }
  | { type: "START_TRAVEL"; destinationId: LocationId }
  | { type: "TICK"; elapsedMs: number }
  | { type: "INVESTIGATE_ENCOUNTER" }
  | { type: "IGNORE_ENCOUNTER" }
  | { type: "ATTACK" }
  | { type: "DODGE" }
  | { type: "GUARD" }
  | { type: "COUNTER" }
  | { type: "RETREAT" }
  | { type: "COLLECT_REWARD" };

export const LOCATIONS: Record<LocationId, Location> = {
  "forest-gate": {
    id: "forest-gate",
    name: "숲 입구",
    subtitle: "GREYWOOD FOREST",
    description:
      "비가 막 그쳤다. 젖은 흙 냄새 사이로 멀리서 강물 소리와 늑대 울음이 들린다.",
    danger: 1,
    travelMinutes: 0,
    tags: ["안전 지대", "출발점"],
  },
  "old-hunt-trail": {
    id: "old-hunt-trail",
    name: "오래된 사냥길",
    subtitle: "OLD HUNT TRAIL",
    description:
      "깊은 숲으로 이어지는 좁은 길. 최근 늑대의 발자국이 자주 발견된다.",
    danger: 3,
    travelMinutes: 7,
    tags: ["늑대 흔적", "지름길"],
  },
  riverbank: {
    id: "riverbank",
    name: "강가",
    subtitle: "RIVERBANK",
    description:
      "얕은 강이 흐르는 조용한 장소. 낚시와 짧은 휴식에 적합하다.",
    danger: 1,
    travelMinutes: 5,
    tags: ["낚시 가능", "휴식"],
  },
  "abandoned-camp": {
    id: "abandoned-camp",
    name: "버려진 야영지",
    subtitle: "ABANDONED CAMP",
    description:
      "꺼진 모닥불과 찢어진 천막이 남아 있다. 누군가 급하게 떠난 흔적이 보인다.",
    danger: 4,
    travelMinutes: 9,
    tags: ["미탐험", "희미한 연기 냄새"],
  },
};

export const DESTINATION_IDS: readonly LocationId[] = [
  "old-hunt-trail",
  "riverbank",
  "abandoned-camp",
];