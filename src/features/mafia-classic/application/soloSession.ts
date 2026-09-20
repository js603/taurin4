import {
  alivePlayers,
  beginDay,
  beginNight,
  beginSunrise,
  createOriginalMafiaGame,
  mafiaCountForPlayerCount,
  requiredMajority,
  resolveDayExecution,
  resolveMafiaNight,
  type MafiaGameState,
  type MafiaPlayer,
} from "./mafiaEngine";

export type SoloPhase =
  | "role-card"
  | "sunrise"
  | "discussion"
  | "defense"
  | "vote"
  | "verdict"
  | "night-vote"
  | "night-note"
  | "night-result"
  | "ended";

export type TalkTone = "system" | "neutral" | "pressure" | "defense" | "result";
export type HumanStatement = "suspect" | "question" | "defend";

export interface SoloPersona {
  readonly label: string;
  readonly style: "analyst" | "aggressive" | "quiet" | "skeptic" | "social";
}

export interface SoloTalkLine {
  readonly id: string;
  readonly day: number;
  readonly speakerId: string | null;
  readonly speakerName: string;
  readonly text: string;
  readonly tone: TalkTone;
}

export interface SoloVoteResult {
  readonly accusedId: string;
  readonly accusedName: string;
  readonly guiltyVotes: number;
  readonly eligibleVotes: number;
  readonly threshold: number;
  readonly executed: boolean;
}

export interface SoloNightResult {
  readonly shotCount: number;
  readonly murderedPlayerId: string | null;
  readonly murderedPlayerName: string | null;
  readonly unanimous: boolean;
}

export interface SoloNightProposalResult {
  readonly yesVotes: number;
  readonly voterCount: number;
  readonly threshold: number;
  readonly passed: boolean;
}

export interface SoloMafiaSession {
  readonly seed: number;
  readonly actionCounter: number;
  readonly phase: SoloPhase;
  readonly core: MafiaGameState;
  readonly humanId: string;
  readonly personas: Readonly<Record<string, SoloPersona>>;
  readonly publicSuspicion: Readonly<Record<string, number>>;
  readonly talk: readonly SoloTalkLine[];
  readonly pendingAccuserId: string | null;
  readonly pendingAccusedId: string | null;
  readonly pendingBotVerdictVotes: Readonly<Record<string, boolean>>;
  readonly pendingBotNightVotes: Readonly<Record<string, boolean>>;
  readonly lastVote: SoloVoteResult | null;
  readonly lastNight: SoloNightResult | null;
  readonly lastNightProposal: SoloNightProposalResult | null;
  readonly notice: string | null;
}

const BOT_NAMES = [
  "유나",
  "민석",
  "지우",
  "태호",
  "서연",
  "도윤",
  "하린",
  "준호",
  "수아",
  "현우",
  "나연",
  "건우",
  "예린",
  "시우",
  "채원",
] as const;

const PERSONAS: readonly SoloPersona[] = [
  { label: "차분한 관찰자", style: "analyst" },
  { label: "직선적인 압박가", style: "aggressive" },
  { label: "말수가 적은 회의론자", style: "quiet" },
  { label: "반박을 즐기는 검증가", style: "skeptic" },
  { label: "분위기를 읽는 중재자", style: "social" },
] as const;

function random01(seed: number, index: number): number {
  let t = (seed + Math.imul(index + 1, 0x6d2b79f5)) >>> 0;
  t += 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function createRng(seed: number): () => number {
  let index = 0;
  return () => random01(seed, index++);
}

function nextId(prefix: string, state: SoloMafiaSession): string {
  return prefix + "-" + state.seed + "-" + state.actionCounter + "-" + state.talk.length;
}

function human(state: SoloMafiaSession): MafiaPlayer {
  return state.core.players.find((player) => player.id === state.humanId)!;
}

export function humanIsAlive(state: SoloMafiaSession): boolean {
  return human(state).alive;
}

export function humanRole(state: SoloMafiaSession): MafiaPlayer["alignment"] {
  return human(state).alignment;
}

export function livingPlayers(state: SoloMafiaSession): MafiaPlayer[] {
  return alivePlayers(state.core);
}

export function publicKnownMafiaCount(state: SoloMafiaSession): number {
  return state.lastNight?.shotCount ?? mafiaCountForPlayerCount(state.core.players.length);
}

function pushTalk(
  state: SoloMafiaSession,
  speakerId: string | null,
  speakerName: string,
  text: string,
  tone: TalkTone,
): SoloMafiaSession {
  return {
    ...state,
    talk: [
      ...state.talk,
      {
        id: nextId("talk", state),
        day: state.core.day,
        speakerId,
        speakerName,
        text,
        tone,
      },
    ],
  };
}

function withCounter(state: SoloMafiaSession, delta = 1): SoloMafiaSession {
  return { ...state, actionCounter: state.actionCounter + delta };
}

function aliveBots(state: SoloMafiaSession): MafiaPlayer[] {
  return livingPlayers(state).filter((player) => player.id !== state.humanId);
}

function publicScore(state: SoloMafiaSession, playerId: string): number {
  return state.publicSuspicion[playerId] ?? 0;
}

function setPublicScore(
  state: SoloMafiaSession,
  playerId: string,
  delta: number,
): SoloMafiaSession {
  return {
    ...state,
    publicSuspicion: {
      ...state.publicSuspicion,
      [playerId]: Math.max(-2, Math.min(4, publicScore(state, playerId) + delta)),
    },
  };
}

function chooseBotTarget(
  state: SoloMafiaSession,
  bot: MafiaPlayer,
  salt: number,
): MafiaPlayer {
  const candidates = livingPlayers(state).filter((candidate) => candidate.id !== bot.id);
  const scored = candidates.map((candidate, index) => {
    let score = publicScore(state, candidate.id);
    const noise = random01(state.seed, state.actionCounter * 31 + salt + index) * 0.55;
    if (bot.alignment === "mafia") {
      if (candidate.alignment === "mafia") score -= 30;
      else score += 0.45;
    }
    return { candidate, score: score + noise };
  });
  scored.sort(
    (left, right) =>
      right.score - left.score ||
      state.core.players.indexOf(left.candidate) - state.core.players.indexOf(right.candidate),
  );
  return scored[0]!.candidate;
}

function discussionText(
  state: SoloMafiaSession,
  speaker: MafiaPlayer,
  target: MafiaPlayer,
): string {
  const persona = state.personas[speaker.id]?.style ?? "analyst";
  const options: Record<SoloPersona["style"], readonly string[]> = {
    analyst: [
      target.name + "의 앞선 반응을 다시 봐야 해요. 말보다 타이밍이 걸립니다.",
      "공개된 행동만 놓고 보면 지금은 " + target.name + " 쪽이 가장 불편합니다.",
    ],
    aggressive: [
      "돌려 말하지 않을게요. 나는 " + target.name + "을(를) 의심합니다.",
      target.name + ", 지금 설명이 너무 안전해요. 하나를 분명히 말해보세요.",
    ],
    quiet: [
      "아직 확신은 없지만 " + target.name + "의 흐름은 기억해둘게요.",
      "지금은 " + target.name + " 쪽을 더 보고 싶습니다.",
    ],
    skeptic: [
      target.name + "의 말은 결론은 있는데 근거가 약합니다. 왜 그렇게 판단했죠?",
      "나는 " + target.name + "에게 한 번 더 설명을 요구하고 싶어요.",
    ],
    social: [
      "분위기에 휩쓸리지 말고 " + target.name + "의 행동부터 다시 맞춰봅시다.",
      "다들 너무 빨리 넘어가고 있어요. " + target.name + "의 입장부터 듣죠.",
    ],
  };
  const list = options[persona];
  const index = Math.floor(
    random01(state.seed, state.actionCounter * 17 + speaker.id.length + target.id.length) *
      list.length,
  );
  return list[index]!;
}

function addBotDiscussion(state: SoloMafiaSession, count: number): SoloMafiaSession {
  let next = state;
  const bots = aliveBots(next);
  if (bots.length === 0) return next;

  for (let index = 0; index < Math.min(count, bots.length); index += 1) {
    const speaker = bots[(next.actionCounter + index) % bots.length]!;
    const target = chooseBotTarget(next, speaker, 100 + index);
    next = pushTalk(
      next,
      speaker.id,
      speaker.name,
      discussionText(next, speaker, target),
      publicScore(next, target.id) > 0.8 ? "pressure" : "neutral",
    );
    next = setPublicScore(next, target.id, speaker.alignment === "mafia" ? 0.18 : 0.12);
    next = withCounter(next);
  }
  return next;
}

function botDefenseText(state: SoloMafiaSession, accused: MafiaPlayer): string {
  const score = publicScore(state, accused.id);
  if (score > 1.25) {
    return "의심이 쌓인 건 알아요. 하지만 지금 나온 건 전부 해석일 뿐입니다. 내 행동 중 정확히 무엇이 모순인지 짚어주세요.";
  }
  return "나는 이 고발에 동의하지 않습니다. 느낌이 아니라 공개된 행동으로 판단해 주세요.";
}

function prepareBotVerdictVotes(
  state: SoloMafiaSession,
  accused: MafiaPlayer,
): Record<string, boolean> {
  const votes: Record<string, boolean> = {};
  const voters = livingPlayers(state).filter(
    (player) => player.id !== accused.id && player.id !== state.humanId,
  );

  voters.forEach((voter, index) => {
    if (voter.alignment === "mafia" && accused.alignment === "mafia") {
      votes[voter.id] = false;
      return;
    }

    let score = publicScore(state, accused.id);
    if (voter.alignment === "mafia" && accused.alignment === "honest") score += 0.75;
    const noise = random01(state.seed, state.actionCounter * 41 + index) * 1.2 - 0.45;
    votes[voter.id] = score + noise >= 0.72;
  });

  return votes;
}

function prepareBotNightVotes(state: SoloMafiaSession): Record<string, boolean> {
  const votes: Record<string, boolean> = {};
  aliveBots(state).forEach((bot, index) => {
    const base = bot.alignment === "mafia" ? 0.78 : 0.62;
    votes[bot.id] = random01(state.seed, state.actionCounter * 53 + index) < base;
  });
  return votes;
}

function chooseBotNightTarget(
  state: SoloMafiaSession,
  mafia: MafiaPlayer,
  index: number,
  humanTargetId: string | null,
): string {
  const candidates = livingPlayers(state).filter(
    (candidate) => candidate.alignment === "honest" && candidate.id !== mafia.id,
  );
  if (candidates.length === 0) {
    return livingPlayers(state).find((candidate) => candidate.id !== mafia.id)!.id;
  }

  if (
    humanTargetId &&
    mafia.id !== state.humanId &&
    random01(state.seed, state.actionCounter * 67 + index) < 0.58
  ) {
    const selected = candidates.find((candidate) => candidate.id === humanTargetId);
    if (selected) return selected.id;
  }

  const scored = candidates.map((candidate, candidateIndex) => {
    const tableTrust = -publicScore(state, candidate.id);
    const humanPressure = candidate.id === state.humanId ? 0.22 : 0;
    const noise =
      random01(state.seed, state.actionCounter * 71 + index * 11 + candidateIndex) * 0.5;
    return { candidate, score: tableTrust + humanPressure + noise };
  });
  scored.sort((left, right) => right.score - left.score);
  return scored[0]!.candidate.id;
}

export function createSoloMafiaSession(
  nickname = "당신",
  playerCount = 6,
  seed = Date.now() >>> 0,
): SoloMafiaSession {
  if (playerCount < 6 || playerCount > 10) {
    throw new Error("Solo playtest supports 6 to 10 players.");
  }

  const humanName = nickname.trim().slice(0, 16) || "당신";
  const botNames = BOT_NAMES.slice(0, playerCount - 1);
  const core = createOriginalMafiaGame([humanName, ...botNames], createRng(seed));
  const humanId = core.players[0]!.id;
  const personas: Record<string, SoloPersona> = {};
  const publicSuspicion: Record<string, number> = {};

  core.players.forEach((player, index) => {
    if (player.id !== humanId) {
      personas[player.id] = PERSONAS[index % PERSONAS.length]!;
    }
    publicSuspicion[player.id] = 0;
  });

  return {
    seed,
    actionCounter: 1,
    phase: "role-card",
    core,
    humanId,
    personas,
    publicSuspicion,
    talk: [
      {
        id: "system-" + seed,
        day: 1,
        speakerId: null,
        speakerName: "진행",
        text:
          "검은 카드는 " +
          mafiaCountForPlayerCount(playerCount) +
          "장입니다. 살아남은 모두가 이 숫자를 알고 시작합니다.",
        tone: "system",
      },
    ],
    pendingAccuserId: null,
    pendingAccusedId: null,
    pendingBotVerdictVotes: {},
    pendingBotNightVotes: {},
    lastVote: null,
    lastNight: null,
    lastNightProposal: null,
    notice: null,
  };
}

export function acknowledgeRole(state: SoloMafiaSession): SoloMafiaSession {
  if (state.phase !== "role-card") return state;
  return {
    ...withCounter(state),
    core: beginSunrise(state.core),
    phase: "sunrise",
    notice: null,
  };
}

export function completeSunrise(state: SoloMafiaSession): SoloMafiaSession {
  if (state.phase !== "sunrise") return state;
  let next: SoloMafiaSession = {
    ...withCounter(state),
    core: beginDay(state.core),
    phase: "discussion",
    notice: "첫 토론이 시작되었습니다. 말, 침묵, 고발과 표결만이 공개 정보입니다.",
  };
  next = pushTalk(
    next,
    null,
    "진행",
    "모두 눈을 떴습니다. 이제 누구든 질문하고, 의심하고, 고발할 수 있습니다.",
    "system",
  );
  return addBotDiscussion(next, 3);
}

export function humanStatement(
  state: SoloMafiaSession,
  targetId: string,
  kind: HumanStatement,
): SoloMafiaSession {
  if (state.phase !== "discussion" || !humanIsAlive(state)) return state;
  const target = livingPlayers(state).find((player) => player.id === targetId);
  if (!target || target.id === state.humanId) return state;

  const copy: Record<HumanStatement, string> = {
    suspect: target.name + "의 행동이 가장 수상합니다. 이유를 더 분명하게 말해보세요.",
    question: target.name + ", 지금까지 누구를 가장 의심했고 왜 그렇게 생각했나요?",
    defend: "나는 지금 " + target.name + "을(를) 제거할 근거가 충분하지 않다고 봅니다.",
  };

  let next = pushTalk(state, state.humanId, human(state).name, copy[kind], kind === "suspect" ? "pressure" : "neutral");
  next = setPublicScore(
    next,
    target.id,
    kind === "suspect" ? 0.7 : kind === "defend" ? -0.45 : 0.18,
  );
  next = withCounter(next);
  next = addBotDiscussion(next, 2);
  return { ...next, notice: null };
}

export function continueDiscussion(state: SoloMafiaSession): SoloMafiaSession {
  if (state.phase !== "discussion") return state;
  return {
    ...addBotDiscussion(withCounter(state), 3),
    notice: null,
  };
}

function beginAccusation(
  state: SoloMafiaSession,
  accuser: MafiaPlayer,
  accused: MafiaPlayer,
): SoloMafiaSession {
  let next = pushTalk(
    withCounter(state),
    accuser.id,
    accuser.name,
    accused.name + "을(를) Mafia로 고발합니다. 표결 전에 변론을 듣겠습니다.",
    "pressure",
  );
  next = setPublicScore(next, accused.id, 0.42);
  if (accused.id !== state.humanId) {
    next = pushTalk(next, accused.id, accused.name, botDefenseText(next, accused), "defense");
  }
  return {
    ...next,
    phase: "defense",
    pendingAccuserId: accuser.id,
    pendingAccusedId: accused.id,
    pendingBotVerdictVotes: {},
    lastVote: null,
    notice:
      accused.id === state.humanId
        ? "당신이 고발당했습니다. 변론을 선택하세요."
        : "피고의 변론을 확인한 뒤 표결로 넘어가세요.",
  };
}

export function accusePlayer(
  state: SoloMafiaSession,
  targetId: string,
): SoloMafiaSession {
  if (state.phase !== "discussion" || !humanIsAlive(state)) return state;
  const accused = livingPlayers(state).find((player) => player.id === targetId);
  if (!accused || accused.id === state.humanId) return state;
  return beginAccusation(state, human(state), accused);
}

export function letBotAccuse(state: SoloMafiaSession): SoloMafiaSession {
  if (state.phase !== "discussion") return state;
  const bots = aliveBots(state);
  if (bots.length === 0) return state;
  const accuser = bots[Math.floor(random01(state.seed, state.actionCounter * 79) * bots.length)]!;
  const accused = chooseBotTarget(state, accuser, 901);
  return beginAccusation(state, accuser, accused);
}

export function submitHumanDefense(
  state: SoloMafiaSession,
  style: "deny" | "counter",
): SoloMafiaSession {
  if (
    state.phase !== "defense" ||
    state.pendingAccusedId !== state.humanId ||
    !humanIsAlive(state)
  ) {
    return state;
  }

  const copy =
    style === "deny"
      ? "나는 Mafia가 아닙니다. 지금까지 나온 공개 행동만으로 다시 판단해 주세요."
      : "나를 고발한 흐름부터 보세요. 누가 이 표결을 가장 서두르고 있는지 확인해야 합니다.";

  return {
    ...pushTalk(state, state.humanId, human(state).name, copy, "defense"),
    notice: "변론이 끝났습니다. 이제 피고를 제외한 생존자가 비밀 표결합니다.",
  };
}

export function beginVerdictVote(state: SoloMafiaSession): SoloMafiaSession {
  if (state.phase !== "defense" || !state.pendingAccusedId) return state;
  const accused = livingPlayers(state).find((player) => player.id === state.pendingAccusedId);
  if (!accused) return state;
  return {
    ...withCounter(state),
    phase: "vote",
    pendingBotVerdictVotes: prepareBotVerdictVotes(state, accused),
    notice:
      accused.id === state.humanId
        ? "피고인 당신은 자신의 표결에 참여하지 않습니다."
        : "다른 플레이어의 표는 비공개입니다. 당신의 표를 선택하세요.",
  };
}

export function resolveVerdictVote(
  state: SoloMafiaSession,
  humanGuilty: boolean | null,
): SoloMafiaSession {
  if (state.phase !== "vote" || !state.pendingAccusedId) return state;
  const accused = livingPlayers(state).find((player) => player.id === state.pendingAccusedId);
  if (!accused) return state;

  const eligible = livingPlayers(state).filter((player) => player.id !== accused.id);
  const humanEligible = humanIsAlive(state) && state.humanId !== accused.id;
  if (humanEligible && humanGuilty === null) return state;

  const guiltyVotes =
    Object.values(state.pendingBotVerdictVotes).filter(Boolean).length +
    (humanEligible && humanGuilty ? 1 : 0);
  const result = resolveDayExecution(state.core, accused.id, guiltyVotes);
  const voteResult: SoloVoteResult = {
    accusedId: accused.id,
    accusedName: accused.name,
    guiltyVotes,
    eligibleVotes: eligible.length,
    threshold: requiredMajority(eligible.length),
    executed: result.executed,
  };

  let next: SoloMafiaSession = {
    ...withCounter(state),
    core: result.state,
    phase: result.state.winner ? "ended" : "verdict",
    lastVote: voteResult,
    pendingBotVerdictVotes: {},
    notice: null,
  };

  next = pushTalk(
    next,
    null,
    "진행",
    result.executed
      ? accused.name +
          "이(가) " +
          guiltyVotes +
          "/" +
          eligible.length +
          "표로 제거되었습니다. 정체는 공개되지 않습니다."
      : "고발이 " +
          guiltyVotes +
          "/" +
          eligible.length +
          "표로 부결되었습니다. 토론은 계속됩니다.",
    "result",
  );

  return next;
}

export function continueAfterVerdict(state: SoloMafiaSession): SoloMafiaSession {
  if (state.phase !== "verdict") return state;
  let next: SoloMafiaSession = {
    ...withCounter(state),
    phase: "discussion",
    pendingAccuserId: null,
    pendingAccusedId: null,
    lastVote: state.lastVote,
    notice: "낮은 끝나지 않았습니다. 다시 토론하거나, 고발하거나, Mafia Night를 제안할 수 있습니다.",
  };
  next = addBotDiscussion(next, 2);
  return next;
}

export function proposeNight(state: SoloMafiaSession): SoloMafiaSession {
  if (state.phase !== "discussion") return state;
  const proposer = humanIsAlive(state)
    ? human(state)
    : aliveBots(state)[Math.floor(random01(state.seed, state.actionCounter * 83) * aliveBots(state).length)]!;
  const botVotes = prepareBotNightVotes(state);
  let next = pushTalk(
    withCounter(state),
    proposer.id,
    proposer.name,
    "Mafia Night를 제안합니다. 지금 살아 있는 Mafia 수를 확인합시다.",
    "pressure",
  );
  return {
    ...next,
    phase: "night-vote",
    pendingBotNightVotes: botVotes,
    lastNightProposal: null,
    notice: humanIsAlive(state)
      ? "모든 생존자가 Mafia Night 시작 여부를 표결합니다."
      : "당신은 제거되어 표결에 참여하지 않습니다.",
  };
}

export function resolveNightProposal(
  state: SoloMafiaSession,
  humanAgree: boolean | null,
): SoloMafiaSession {
  if (state.phase !== "night-vote") return state;
  const voters = livingPlayers(state);
  const humanEligible = humanIsAlive(state);
  if (humanEligible && humanAgree === null) return state;

  const yesVotes =
    Object.values(state.pendingBotNightVotes).filter(Boolean).length +
    (humanEligible && humanAgree ? 1 : 0);
  const threshold = requiredMajority(voters.length);
  const passed = yesVotes >= threshold;
  const proposal: SoloNightProposalResult = {
    yesVotes,
    voterCount: voters.length,
    threshold,
    passed,
  };

  if (!passed) {
    let next: SoloMafiaSession = {
      ...withCounter(state),
      phase: "discussion",
      lastNightProposal: proposal,
      pendingBotNightVotes: {},
      notice: "Mafia Night 제안이 부결되었습니다. 낮의 토론이 계속됩니다.",
    };
    next = pushTalk(
      next,
      null,
      "진행",
      "Mafia Night 제안 " + yesVotes + "/" + voters.length + "표 · 과반 미달.",
      "result",
    );
    return addBotDiscussion(next, 2);
  }

  return {
    ...withCounter(state),
    core: beginNight(state.core),
    phase: "night-note",
    lastNightProposal: proposal,
    pendingBotNightVotes: {},
    notice:
      humanRole(state) === "mafia" && humanIsAlive(state)
        ? "당신은 Mafia입니다. 제거할 한 사람의 이름을 비밀리에 적으세요."
        : "당신의 쪽지는 HONEST입니다. 다른 사람의 입력은 볼 수 없습니다.",
  };
}

export function legalHumanNightTargets(state: SoloMafiaSession): MafiaPlayer[] {
  if (
    state.phase !== "night-note" ||
    !humanIsAlive(state) ||
    humanRole(state) !== "mafia"
  ) {
    return [];
  }
  return livingPlayers(state).filter((player) => player.id !== state.humanId);
}

export function submitNightNote(
  state: SoloMafiaSession,
  humanTargetId: string | null,
): SoloMafiaSession {
  if (state.phase !== "night-note") return state;

  if (
    humanIsAlive(state) &&
    humanRole(state) === "mafia" &&
    !legalHumanNightTargets(state).some((player) => player.id === humanTargetId)
  ) {
    return state;
  }

  const targets: Record<string, string> = {};
  const mafia = livingPlayers(state).filter((player) => player.alignment === "mafia");

  mafia.forEach((player, index) => {
    if (player.id === state.humanId) {
      if (humanTargetId) targets[player.id] = humanTargetId;
      return;
    }
    targets[player.id] = chooseBotNightTarget(state, player, index, humanTargetId);
  });

  const result = resolveMafiaNight(state.core, targets);
  const murdered = result.murderedPlayerId
    ? state.core.players.find((player) => player.id === result.murderedPlayerId) ?? null
    : null;

  const nightResult: SoloNightResult = {
    shotCount: result.shotCount,
    murderedPlayerId: result.murderedPlayerId,
    murderedPlayerName: murdered?.name ?? null,
    unanimous: result.unanimous,
  };

  let next: SoloMafiaSession = {
    ...withCounter(state),
    core: result.state,
    phase: result.state.winner ? "ended" : "night-result",
    lastNight: nightResult,
    notice: null,
  };

  const resultText =
    result.shotCount === 0
      ? "총성은 0발입니다. 살아 있는 Mafia는 없습니다."
      : result.unanimous && murdered
        ? result.shotCount +
          "발의 Mafia 쪽지가 같은 이름을 가리켰습니다. " +
          murdered.name +
          "이(가) 제거되었습니다."
        : result.shotCount +
          "발의 Mafia 쪽지가 서로 다른 이름을 가리켰습니다. 아무도 제거되지 않았습니다.";

  next = pushTalk(next, null, "진행", resultText, "result");
  return next;
}

export function continueAfterNight(state: SoloMafiaSession): SoloMafiaSession {
  if (state.phase !== "night-result") return state;

  let next: SoloMafiaSession = {
    ...withCounter(state),
    phase: "discussion",
    pendingAccuserId: null,
    pendingAccusedId: null,
    notice:
      "새로운 낮입니다. 공개된 정보는 생존자, 이전 표결, 그리고 Mafia 쪽지 수뿐입니다.",
  };
  next = pushTalk(
    next,
    null,
    "진행",
    "DAY " + next.core.day + " · 살아 있는 플레이어 " + livingPlayers(next).length + "명.",
    "system",
  );
  return addBotDiscussion(next, 3);
}

export function mafiaTeammatesForHuman(state: SoloMafiaSession): MafiaPlayer[] {
  if (humanRole(state) !== "mafia") return [];
  return state.core.players.filter(
    (player) => player.id !== state.humanId && player.alignment === "mafia",
  );
}
