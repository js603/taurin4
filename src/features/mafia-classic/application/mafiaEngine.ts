export type Alignment = "honest" | "mafia";
export type GamePhase = "role-reveal" | "sunrise" | "day" | "night-notes" | "game-over";
export type Winner = "honest" | "mafia";

export interface MafiaPlayer {
  id: string;
  name: string;
  alignment: Alignment;
  alive: boolean;
}

export interface GameLogEntry {
  id: string;
  day: number;
  text: string;
}

export interface MafiaGameState {
  players: MafiaPlayer[];
  phase: GamePhase;
  day: number;
  winner: Winner | null;
  log: GameLogEntry[];
}

export interface DayVoteResult {
  state: MafiaGameState;
  executed: boolean;
  threshold: number;
}

export interface NightResult {
  state: MafiaGameState;
  shotCount: number;
  murderedPlayerId: string | null;
  unanimous: boolean;
}

export function mafiaCountForPlayerCount(playerCount: number): number {
  if (playerCount >= 6 && playerCount <= 7) return 2;
  if (playerCount >= 8 && playerCount <= 10) return 3;
  if (playerCount >= 11 && playerCount <= 13) return 4;
  if (playerCount >= 14 && playerCount <= 16) return 5;
  throw new Error("Original Mafia supports 6 to 16 players in this build.");
}

export function requiredMajority(voterCount: number): number {
  if (voterCount <= 0) throw new Error("voterCount must be positive.");
  return Math.floor(voterCount / 2) + 1;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function logEntry(day: number, text: string): GameLogEntry {
  return {
    id: crypto.randomUUID(),
    day,
    text,
  };
}

export function createOriginalMafiaGame(
  rawNames: string[],
  rng: () => number = Math.random,
): MafiaGameState {
  const names = rawNames.map((name) => name.trim()).filter(Boolean);
  mafiaCountForPlayerCount(names.length);

  const normalized = names.map((name) => name.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Player names must be unique.");
  }

  const mafiaCount = mafiaCountForPlayerCount(names.length);
  const roleDeck: Alignment[] = [
    ...Array.from({ length: mafiaCount }, () => "mafia" as const),
    ...Array.from({ length: names.length - mafiaCount }, () => "honest" as const),
  ];
  const shuffledRoles = shuffle(roleDeck, rng);

  return {
    players: names.map((name, index) => ({
      id: crypto.randomUUID(),
      name,
      alignment: shuffledRoles[index]!,
      alive: true,
    })),
    phase: "role-reveal",
    day: 1,
    winner: null,
    log: [
      logEntry(
        1,
        "배역이 비밀리에 배정되었습니다. 검은 카드는 서로를 알고, 붉은 카드는 아무도 믿을 수 없습니다.",
      ),
    ],
  };
}

export function alivePlayers(state: MafiaGameState): MafiaPlayer[] {
  return state.players.filter((player) => player.alive);
}

export function aliveMafia(state: MafiaGameState): MafiaPlayer[] {
  return state.players.filter((player) => player.alive && player.alignment === "mafia");
}

export function aliveHonest(state: MafiaGameState): MafiaPlayer[] {
  return state.players.filter((player) => player.alive && player.alignment === "honest");
}

export function beginSunrise(state: MafiaGameState): MafiaGameState {
  return {
    ...state,
    phase: "sunrise",
    log: [...state.log, logEntry(state.day, "Sunrise 의식이 시작되었습니다.")],
  };
}

export function beginDay(state: MafiaGameState): MafiaGameState {
  return {
    ...state,
    phase: "day",
    log: [...state.log, logEntry(state.day, "모두 눈을 떴습니다. 자유 토론과 고발이 시작됩니다.")],
  };
}

export function resolveDayExecution(
  state: MafiaGameState,
  accusedId: string,
  guiltyVotes: number,
): DayVoteResult {
  const accused = state.players.find((player) => player.id === accusedId && player.alive);
  if (!accused) throw new Error("The accused player must be alive.");

  const eligibleVoters = alivePlayers(state).length - 1;
  const threshold = requiredMajority(eligibleVoters);
  if (guiltyVotes < 0 || guiltyVotes > eligibleVoters) {
    throw new Error("Invalid guilty vote count.");
  }

  if (guiltyVotes < threshold) {
    return {
      executed: false,
      threshold,
      state: {
        ...state,
        log: [
          ...state.log,
          logEntry(
            state.day,
            accused.name + " 고발은 " + guiltyVotes + "/" + eligibleVoters + "표로 부결되었습니다.",
          ),
        ],
      },
    };
  }

  const players = state.players.map((player) =>
    player.id === accusedId ? { ...player, alive: false } : player,
  );
  const remainingHonest = players.filter(
    (player) => player.alive && player.alignment === "honest",
  ).length;
  const mafiaWin = remainingHonest === 0;

  return {
    executed: true,
    threshold,
    state: {
      ...state,
      players,
      phase: mafiaWin ? "game-over" : "day",
      winner: mafiaWin ? "mafia" : null,
      log: [
        ...state.log,
        logEntry(
          state.day,
          accused.name +
            "이(가) 과반 판결로 제거되었습니다. 정체는 공개되지 않습니다.",
        ),
        ...(mafiaWin
          ? [logEntry(state.day, "남아 있는 Honest가 없습니다. Mafia가 승리했습니다.")]
          : []),
      ],
    },
  };
}

export function nightProposalPasses(state: MafiaGameState, yesVotes: number): boolean {
  const voters = alivePlayers(state).length;
  if (yesVotes < 0 || yesVotes > voters) throw new Error("Invalid night proposal vote count.");
  return yesVotes >= requiredMajority(voters);
}

export function beginNight(state: MafiaGameState): MafiaGameState {
  return {
    ...state,
    phase: "night-notes",
    log: [...state.log, logEntry(state.day, "Mafia Night가 과반 동의로 시작되었습니다.")],
  };
}

export function resolveMafiaNight(
  state: MafiaGameState,
  mafiaTargets: Record<string, string>,
): NightResult {
  const mafia = aliveMafia(state);
  const shotCount = mafia.length;

  if (shotCount === 0) {
    return {
      shotCount: 0,
      murderedPlayerId: null,
      unanimous: false,
      state: {
        ...state,
        phase: "game-over",
        winner: "honest",
        log: [
          ...state.log,
          logEntry(state.day, "Mafia Night에서 총성이 한 발도 없었습니다. Honest가 승리했습니다."),
        ],
      },
    };
  }

  const targets = mafia.map((player) => mafiaTargets[player.id]);
  if (targets.some((target) => !target)) {
    throw new Error("Every surviving Mafia member must submit one target.");
  }

  for (const targetId of targets) {
    const target = state.players.find((player) => player.id === targetId && player.alive);
    if (!target) throw new Error("Every Mafia target must be alive.");
  }

  const unanimous = targets.every((target) => target === targets[0]);
  if (!unanimous) {
    return {
      shotCount,
      murderedPlayerId: null,
      unanimous: false,
      state: {
        ...state,
        phase: "day",
        day: state.day + 1,
        log: [
          ...state.log,
          logEntry(
            state.day,
            "Mafia Night: " + shotCount + "발의 총성이 확인됐지만 표적이 일치하지 않아 아무도 죽지 않았습니다.",
          ),
        ],
      },
    };
  }

  const murderedPlayerId = targets[0]!;
  const murdered = state.players.find((player) => player.id === murderedPlayerId)!;
  const players = state.players.map((player) =>
    player.id === murderedPlayerId ? { ...player, alive: false } : player,
  );
  const remainingHonest = players.filter(
    (player) => player.alive && player.alignment === "honest",
  ).length;
  const mafiaWin = remainingHonest === 0;

  return {
    shotCount,
    murderedPlayerId,
    unanimous: true,
    state: {
      ...state,
      players,
      phase: mafiaWin ? "game-over" : "day",
      day: mafiaWin ? state.day : state.day + 1,
      winner: mafiaWin ? "mafia" : null,
      log: [
        ...state.log,
        logEntry(
          state.day,
          "Mafia Night: " + shotCount + "발의 총성이 한 사람을 향했습니다. " + murdered.name + "이(가) 제거되었습니다.",
        ),
        ...(mafiaWin
          ? [logEntry(state.day, "남아 있는 Honest가 없습니다. Mafia가 승리했습니다.")]
          : []),
      ],
    },
  };
}
