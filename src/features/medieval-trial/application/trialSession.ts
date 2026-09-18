import {
  beginAccusation,
  beginVerdict,
  createGame,
  resolveAccusation,
  resolveNight,
  resolveVerdict,
} from "./gameEngine";
import { Mulberry32 } from "../domain/seededRandom";
import type {
  GameState,
  NightIntent,
  PlayerId,
  PlayerState,
  Testimony,
} from "../domain/types";
import type {
  TrialIntentResult,
  TrialOpeningAttack,
  TrialPhase,
  TrialPlayer,
  TrialResolution,
  TrialSessionState,
  TrialTestimony,
  TrialVoteTally,
} from "./trialSessionTypes";

const SEATS = [
  { name: "로언", title: "성문지기" },
  { name: "마르타", title: "직조공" },
  { name: "에드윈", title: "서기관" },
  { name: "오스릭", title: "마구간지기" },
  { name: "엘리즈", title: "약초상" },
  { name: "헨릭", title: "대장장이" },
  { name: "이사벨", title: "순례자" },
  { name: "가레스", title: "사냥꾼" },
] as const;

const HUMAN_PLAYER_ID = "p7";

function promptForPhase(phase: TrialPhase, winner: GameState["winner"]): string {
  switch (phase) {
    case "opening-night":
      return "종이 세 번 울리면 대연회장의 문이 열린다.";
    case "debate":
      return "증언의 빈틈을 살피고, 누가 거짓말을 하는지 찾아라.";
    case "accusation":
      return "한 사람을 고발하라. 두 명의 피고가 정해진다.";
    case "defendants":
      return "두 사람이 피고석에 섰다. 그들의 마지막 말을 들어라.";
    case "verdict":
      return "배심의 칼끝을 한 사람에게 향해야 한다.";
    case "resolution":
      return "판결은 기록되었다. 다음 종이 울리기 전 숨을 고르라.";
    case "ended":
      return winner === "residents"
        ? "성 안의 살인자는 모두 드러났다."
        : "어둠이 성벽 안쪽까지 번졌다.";
  }
}

function tally(votes: Readonly<Record<PlayerId, PlayerId>>): TrialVoteTally[] {
  const counts = new Map<PlayerId, number>();
  for (const targetId of Object.values(votes)) {
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }
  return [...counts].map(([playerId, count]) => ({ playerId, count }));
}

export class TrialSession {
  private readonly random: Mulberry32;
  private readonly core: GameState;
  private phase: TrialPhase = "opening-night";
  private night = 1;
  private readonly openingAttack: TrialOpeningAttack;
  private testimonies: TrialTestimony[] = [];
  private accusationVotes: TrialVoteTally[] = [];
  private defendants: PlayerId[] = [];
  private verdictVotes: TrialVoteTally[] = [];
  private resolution: TrialResolution | null = null;
  private readonly chronicle: string[];

  constructor(seed = 20260918) {
    this.random = new Mulberry32(seed);
    this.core = createGame(seed, this.random);
    const target = this.random.pick(this.core.players.filter((player) => player.role !== "murderer"));
    const targetName = this.nameOf(target.id);
    this.openingAttack = {
      targetId: target.id,
      targetName,
      killed: false,
      description: `새벽 종이 울리기 전, 누군가 ${targetName}의 문을 습격했다. 피는 남았지만 목숨은 건졌다.`,
    };
    this.chronicle = [
      "성 아그네스 성의 대연회장에 여덟 사람이 모였다.",
      this.openingAttack.description,
    ];
  }

  getState(): TrialSessionState {
    return structuredClone({
      seed: this.core.seed,
      phase: this.phase,
      day: this.core.day,
      night: this.night,
      playerId: HUMAN_PLAYER_ID,
      players: this.core.players.map((player) => this.toTrialPlayer(player)),
      openingAttack: this.openingAttack,
      testimonies: this.testimonies,
      accusationVotes: this.accusationVotes,
      defendants: this.defendants,
      verdictVotes: this.verdictVotes,
      resolution: this.resolution,
      winner: this.core.winner,
      currentPrompt: promptForPhase(this.phase, this.core.winner),
      chronicle: this.chronicle,
    });
  }

  advanceOpeningNight(): TrialIntentResult {
    if (this.phase !== "opening-night") return this.reject("개막의 밤은 이미 끝났습니다.");
    const result = resolveNight(this.core, this.createNightIntent(this.openingAttack.targetId), this.random);
    this.testimonies = result.testimonies.map((testimony) => this.toTrialTestimony(testimony));
    this.phase = "debate";
    this.chronicle.push("첫 습격은 살인으로 이어지지 않았다. 그러나 범인은 성 안에 남아 있다.");
    return this.accept();
  }

  beginAccusation(): TrialIntentResult {
    if (this.phase !== "debate") return this.reject("토론이 끝나야 고발할 수 있습니다.");
    beginAccusation(this.core);
    this.phase = "accusation";
    return this.accept();
  }

  submitAccusation(targetId: PlayerId): TrialIntentResult {
    if (this.phase !== "accusation") return this.reject("지금은 고발할 때가 아닙니다.");
    if (!this.isLiving(targetId) || targetId === HUMAN_PLAYER_ID) {
      return this.reject("살아 있는 다른 인물을 고발해야 합니다.");
    }

    const votes: Record<PlayerId, PlayerId> = {};
    for (const voter of this.livingPlayers()) {
      const choices = this.livingPlayers().filter((candidate) => candidate.id !== voter.id);
      votes[voter.id] = voter.id === HUMAN_PLAYER_ID ? targetId : this.random.pick(choices).id;
    }
    const result = resolveAccusation(this.core, votes);
    this.accusationVotes = tally(votes);
    this.defendants = [...result.finalists];
    this.phase = "defendants";
    this.chronicle.push(`${this.nameOf(targetId)}에 대한 고발이 대연회장에 울려 퍼졌다.`);
    return this.accept();
  }

  beginVerdict(): TrialIntentResult {
    if (this.phase !== "defendants") return this.reject("피고석의 변론부터 들어야 합니다.");
    beginVerdict(this.core);
    this.phase = "verdict";
    return this.accept();
  }

  submitVerdict(targetId: PlayerId): TrialIntentResult {
    if (this.phase !== "verdict") return this.reject("지금은 최종 판결을 내릴 때가 아닙니다.");
    if (!this.defendants.includes(targetId)) return this.reject("피고석에 선 사람만 판결할 수 있습니다.");

    const votes: Record<PlayerId, PlayerId> = {};
    for (const voter of this.livingPlayers()) {
      votes[voter.id] = voter.id === HUMAN_PLAYER_ID ? targetId : this.random.pick(this.defendants);
    }
    const finalists = [this.defendants[0]!, this.defendants[1]!] as const;
    const result = resolveVerdict(this.core, finalists, votes);
    this.verdictVotes = tally(votes);
    this.resolution = result.tied
      ? {
          kind: "deadlock",
          targetId: null,
          targetName: null,
          text: "배심은 결론에 이르지 못했다. 누구도 처형되지 않았다.",
        }
      : {
          kind: "execution",
          targetId: result.eliminatedPlayerId,
          targetName: result.eliminatedPlayerId ? this.nameOf(result.eliminatedPlayerId) : null,
          text: `${result.eliminatedPlayerId ? this.nameOf(result.eliminatedPlayerId) : "피고"}에게 유죄 판결이 내려졌다. 성문 밖으로 끌려갔다.`,
        };
    this.phase = "resolution";
    this.chronicle.push(this.resolution.text);
    return this.accept();
  }

  continueAfterVerdict(): TrialIntentResult {
    if (this.phase !== "resolution") return this.reject("판결 기록이 끝나야 다음 밤을 맞을 수 있습니다.");
    if (this.core.winner) {
      this.phase = "ended";
      return this.accept();
    }

    this.night += 1;
    const result = resolveNight(this.core, this.createNightIntent(), this.random);
    if (result.killedPlayerId) {
      this.chronicle.push(`${this.night}번째 밤, ${this.nameOf(result.killedPlayerId)}의 방에서 촛불이 꺼졌다.`);
    } else {
      this.chronicle.push(`${this.night}번째 밤, 약제사의 약병이 한 목숨을 붙잡았다.`);
    }
    this.testimonies = result.testimonies.map((testimony) => this.toTrialTestimony(testimony));
    this.accusationVotes = [];
    this.defendants = [];
    this.verdictVotes = [];
    this.resolution = null;
    this.phase = this.core.winner ? "ended" : "debate";
    return this.accept();
  }

  private createNightIntent(forcedMurderTargetId?: PlayerId): NightIntent {
    const living = this.livingPlayers();
    const murderTargets = living.filter((player) => player.role !== "murderer");
    const investigator = living.find((player) => player.role === "investigator") ?? null;
    const apothecary = living.find((player) => player.role === "apothecary") ?? null;
    const protectionChoices = apothecary
      ? living.filter(
          (player) =>
            player.id !== apothecary.lastProtectedTargetId &&
            !(player.id === apothecary.id && apothecary.selfProtectionUsed),
        )
      : [];

    return {
      murderTargetId: forcedMurderTargetId ?? this.random.pick(murderTargets).id,
      investigationTargetId: investigator
        ? this.random.pick(living.filter((player) => player.id !== investigator.id)).id
        : null,
      protectionTargetId: apothecary ? this.random.pick(protectionChoices).id : null,
    };
  }

  private livingPlayers(): PlayerState[] {
    return this.core.players.filter((player) => player.alive);
  }

  private isLiving(playerId: PlayerId): boolean {
    return this.core.players.some((player) => player.id === playerId && player.alive);
  }

  private nameOf(playerId: PlayerId): string {
    const player = this.core.players.find((candidate) => candidate.id === playerId);
    return player ? SEATS[player.seat]!.name : "이름 없는 자";
  }

  private toTrialPlayer(player: PlayerState): TrialPlayer {
    const seat = SEATS[player.seat]!;
    return {
      id: player.id,
      name: seat.name,
      title: seat.title,
      living: player.alive,
      isHuman: player.id === HUMAN_PLAYER_ID,
    };
  }

  private toTrialTestimony(testimony: Testimony): TrialTestimony {
    const namedCandidates = testimony.candidateIds.map((id) => this.nameOf(id));
    const text =
      namedCandidates.length > 0
        ? `${namedCandidates.join(" 또는 ")} 중 한 사람이 밤의 회랑을 지났소.`
        : "빗소리 사이로 쇠붙이가 부딪히는 소리만 들었소.";
    return {
      id: testimony.id,
      speakerId: testimony.recipientId,
      speakerName: this.nameOf(testimony.recipientId),
      text,
      reliability:
        testimony.strength === "strong"
          ? "strong"
          : testimony.strength === "medium"
            ? "clear"
            : "faint",
    };
  }

  private accept(): TrialIntentResult {
    return { state: this.getState(), error: null };
  }

  private reject(error: string): TrialIntentResult {
    return { state: this.getState(), error };
  }
}
