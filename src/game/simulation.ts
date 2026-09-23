import {
  LOCATIONS,
  type AttentionLevel,
  type GameCommand,
  type GameLogEntry,
  type GameState,
} from "./model";

const TRAVEL_REALTIME_MS = 2_800;
const ENCOUNTER_PROGRESS = 0.58;
const TELEGRAPH_MS = 1_800;

function withLog(
  state: GameState,
  text: string,
  attention: AttentionLevel = "log",
): GameState {
  const entry: GameLogEntry = {
    id: state.nextLogId,
    worldMinutes: state.worldMinutes,
    text,
    attention,
  };

  return {
    ...state,
    nextLogId: state.nextLogId + 1,
    logs: [...state.logs.slice(-7), entry],
  };
}

function startReward(state: GameState): GameState {
  const rewarded: GameState = {
    ...state,
    phase: "reward",
    combat: null,
    reward: {
      title: "전투 전리품",
      items: ["회색 늑대 가죽", "낡은 송곳니", "Copper × 4"],
    },
  };
  return withLog(rewarded, "굶주린 회색늑대를 쓰러뜨렸다.", "focus");
}

export function createInitialGameState(): GameState {
  return {
    phase: "exploration",
    source: "local",
    worldMinutes: 18 * 60 + 42,
    currentLocationId: "forest-gate",
    nearbyOpen: false,
    player: {
      hp: 28,
      maxHp: 32,
      mp: 7,
      maxMp: 10,
    },
    encounter: null,
    travel: null,
    combat: null,
    reward: null,
    nextLogId: 3,
    logs: [
      {
        id: 1,
        worldMinutes: 18 * 60 + 42,
        text: "비가 그쳤다.",
        attention: "log",
      },
      {
        id: 2,
        worldMinutes: 18 * 60 + 42,
        text: "세계는 계속 움직이고 있다.",
        attention: "log",
      },
    ],
  };
}

function tickTravel(state: GameState, elapsedMs: number): GameState {
  if (state.phase !== "travel" || !state.travel) return state;

  const elapsed = Math.min(
    state.travel.totalMs,
    state.travel.elapsedMs + elapsedMs,
  );
  const progress = elapsed / state.travel.totalMs;
  const travel = { ...state.travel, elapsedMs: elapsed, progress };

  if (!travel.encounterTriggered && progress >= ENCOUNTER_PROGRESS) {
    const interrupted: GameState = {
      ...state,
      phase: "encounter",
      encounter: {
        kind: "monster",
        entityId: "grey-wolf-01",
        name: "굶주린 회색늑대",
        hp: 18,
        maxHp: 18,
        aggressive: true,
      },
      travel: { ...travel, encounterTriggered: true },
    };
    return withLog(
      interrupted,
      "이동 중 숲이 갑자기 조용해졌다.",
      "focus",
    );
  }

  if (progress >= 1) {
    const destination = LOCATIONS[travel.destinationId];
    const arrived: GameState = {
      ...state,
      phase: "exploration",
      currentLocationId: travel.destinationId,
      worldMinutes: state.worldMinutes + destination.travelMinutes,
      nearbyOpen: false,
      travel: null,
    };
    return withLog(arrived, destination.name + "에 도착했다.", "floating");
  }

  return { ...state, travel };
}

function tickCombat(state: GameState, elapsedMs: number): GameState {
  if (
    state.phase !== "combat" ||
    !state.combat ||
    state.combat.telegraphRemainingMs === null
  ) {
    return state;
  }

  const remaining = state.combat.telegraphRemainingMs - elapsedMs;
  if (remaining > 0) {
    return {
      ...state,
      combat: { ...state.combat, telegraphRemainingMs: remaining },
    };
  }

  const damaged: GameState = {
    ...state,
    player: {
      ...state.player,
      hp: Math.max(1, state.player.hp - 8),
    },
    combat: {
      ...state.combat,
      telegraphRemainingMs: null,
      vulnerable: false,
      lastOutcome: "hit",
    },
  };

  return withLog(damaged, "대응이 늦었다. 늑대의 돌진! -8 HP", "critical");
}

function attack(state: GameState): GameState {
  if (state.phase !== "combat" || !state.combat) return state;

  const attacks = state.combat.attacks + 1;
  const greedy = state.combat.telegraphRemainingMs !== null;
  const damage = greedy ? 2 : 4 + (attacks % 2);
  const enemyHp = Math.max(0, state.combat.enemy.hp - damage);

  let next: GameState = {
    ...state,
    combat: {
      ...state.combat,
      attacks,
      enemy: { ...state.combat.enemy, hp: enemyHp },
      lastOutcome: "none",
    },
  };
  next = withLog(
    next,
    (greedy ? "공격 징후를 무시하고 연타했다. " : "빠른 공격 → ") +
      damage +
      " 피해",
    greedy ? "critical" : "log",
  );

  if (enemyHp <= 0) return startReward(next);

  if (!greedy && attacks % 3 === 0) {
    return {
      ...next,
      combat: {
        ...next.combat!,
        telegraphRemainingMs: TELEGRAPH_MS,
        vulnerable: false,
      },
    };
  }

  return next;
}

export function reduceGame(state: GameState, command: GameCommand): GameState {
  switch (command.type) {
    case "OPEN_NEARBY":
      if (state.phase !== "exploration") return state;
      return { ...state, nearbyOpen: true };

    case "CLOSE_NEARBY":
      return { ...state, nearbyOpen: false };

    case "START_TRAVEL": {
      if (state.phase !== "exploration") return state;
      const destination = LOCATIONS[command.destinationId];
      const started: GameState = {
        ...state,
        phase: "travel",
        nearbyOpen: false,
        reward: null,
        travel: {
          destinationId: command.destinationId,
          elapsedMs: 0,
          totalMs: TRAVEL_REALTIME_MS,
          progress: 0,
          encounterTriggered: false,
        },
      };
      return withLog(started, destination.name + "로 이동을 시작했다.");
    }

    case "TICK":
      return tickCombat(tickTravel(state, command.elapsedMs), command.elapsedMs);

    case "INVESTIGATE_ENCOUNTER": {
      if (state.phase !== "encounter") return state;
      const encounter = state.encounter;
      const entered: GameState = {
        ...state,
        phase: "combat",
        encounter: null,
        combat: {
          enemy: {
            id: encounter?.entityId ?? "grey-wolf-01",
            name: encounter?.name ?? "굶주린 회색늑대",
            hp: encounter?.hp ?? 18,
            maxHp: encounter?.maxHp ?? 18,
            distanceMeters: 5,
          },
          attacks: 0,
          telegraphRemainingMs: null,
          vulnerable: false,
          lastOutcome: "none",
        },
      };
      return withLog(
        entered,
        (encounter?.name ?? "굶주린 회색늑대") + "이(가) 모습을 드러냈다.",
        "focus",
      );
    }

    case "IGNORE_ENCOUNTER": {
      if (state.phase !== "encounter" || !state.travel) return state;
      const resumed: GameState = {
        ...state,
        phase: "travel",
        encounter: null,
      };
      return withLog(resumed, "기척을 무시하고 이동을 계속했다.");
    }

    case "ATTACK":
      return attack(state);

    case "DODGE": {
      if (
        state.phase !== "combat" ||
        !state.combat ||
        state.combat.telegraphRemainingMs === null
      ) {
        return state;
      }
      const dodged: GameState = {
        ...state,
        combat: {
          ...state.combat,
          telegraphRemainingMs: null,
          vulnerable: true,
          lastOutcome: "perfect",
        },
      };
      return withLog(
        dodged,
        "PERFECT EVADE! 늑대가 균형을 잃었다.",
        "critical",
      );
    }

    case "GUARD": {
      if (
        state.phase !== "combat" ||
        !state.combat ||
        state.combat.telegraphRemainingMs === null
      ) {
        return state;
      }
      const guarded: GameState = {
        ...state,
        player: {
          ...state.player,
          hp: Math.max(1, state.player.hp - 2),
        },
        combat: {
          ...state.combat,
          telegraphRemainingMs: null,
          vulnerable: false,
          lastOutcome: "guard",
        },
      };
      return withLog(guarded, "가드 성공. 충격을 버텼다. -2 HP", "focus");
    }

    case "COUNTER": {
      if (
        state.phase !== "combat" ||
        !state.combat ||
        !state.combat.vulnerable
      ) {
        return state;
      }
      const countered: GameState = {
        ...state,
        combat: {
          ...state.combat,
          enemy: { ...state.combat.enemy, hp: 0 },
          vulnerable: false,
        },
      };
      return startReward(
        withLog(countered, "빈틈에 강력한 반격을 꽂아 넣었다.", "critical"),
      );
    }

    case "RETREAT": {
      if (state.phase !== "combat") return state;
      const retreated: GameState = {
        ...state,
        phase: state.travel ? "travel" : "exploration",
        combat: null,
      };
      return withLog(retreated, "거리를 벌리고 전투에서 빠져나왔다.", "focus");
    }

    case "MOVE_TO":
      return state;

    case "COLLECT_REWARD": {
      if (state.phase !== "reward") return state;
      const resumed: GameState = {
        ...state,
        phase: state.travel ? "travel" : "exploration",
        reward: null,
      };
      return withLog(resumed, "전리품을 가방에 넣었다.", "floating");
    }
  }
}