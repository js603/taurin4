import {
  beginAccusation,
  beginVerdict,
  createGame,
  resolveAccusation,
  resolveNight,
  resolveVerdict,
} from "./gameEngine";
import { Mulberry32 } from "../domain/seededRandom";
import { joinKoreanAnd, withParticle } from "./koreanGrammar";
import {
  BOT_PROFILES,
  createSuspicionLedger,
  absorbNightInformation,
  chooseNightIntent,
  chooseAccusationVotes,
  chooseVerdictVotes,
  type SuspicionLedger,
} from "./botPolicy";
import type { GameState, NightIntent, PlayerId, PlayerState, Testimony } from "../domain/types";
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
    case "night":
      return "당신의 역할에 따라 밤의 행동 대상을 선택하라.";
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
  private readonly ledger: SuspicionLedger;
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
    this.ledger = createSuspicionLedger(this.core, this.random);
    const target = this.random.pick(
      this.core.players.filter((player) => player.role !== "murderer"),
    );
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
      playerRole: this.core.players.find((player) => player.id === HUMAN_PLAYER_ID)!.role,
      observing: !this.isLiving(HUMAN_PLAYER_ID),
      legalNightTargets: this.legalNightTargets(),
      privateNotes: this.privateNotes(),
      defenses: Object.fromEntries(this.defendants.map((id) => [id, this.defenseFor(id)])),
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
    resolveNight(this.core, this.createNightIntent(this.openingAttack.targetId), this.random);
    this.publishNightInformation();
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

    const votes = chooseAccusationVotes(this.core, this.ledger, this.random, BOT_PROFILES.baseline);
    if (this.isLiving(HUMAN_PLAYER_ID)) votes[HUMAN_PLAYER_ID] = targetId;
    const result = resolveAccusation(this.core, votes);
    this.accusationVotes = tally(votes);
    this.defendants = [...result.finalists];
    this.phase = "defendants";
    const pair = joinKoreanAnd(this.nameOf(this.defendants[0]!), this.nameOf(this.defendants[1]!));
    this.chronicle.push(`${withParticle(pair, "이", "가")} 고발 표결로 피고석에 섰다.`);
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
    if (!this.defendants.includes(targetId))
      return this.reject("피고석에 선 사람만 판결할 수 있습니다.");

    const finalists = [this.defendants[0]!, this.defendants[1]!] as const;
    const votes = chooseVerdictVotes(
      this.core,
      this.ledger,
      finalists,
      this.random,
      BOT_PROFILES.baseline,
    );
    if (this.isLiving(HUMAN_PLAYER_ID)) votes[HUMAN_PLAYER_ID] = targetId;
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
    if (this.phase !== "resolution")
      return this.reject("판결 기록이 끝나야 다음 밤을 맞을 수 있습니다.");
    if (this.core.winner) {
      this.phase = "ended";
      return this.accept();
    }

    this.night += 1;
    this.phase = "night";
    if (this.legalNightTargets().length > 0) return this.accept();
    return this.finishNight(this.createNightIntent());
  }

  submitNightAction(targetId: PlayerId): TrialIntentResult {
    if (this.phase !== "night" || !this.legalNightTargets().includes(targetId)) {
      return this.reject("지금 선택할 수 없는 밤 행동 대상입니다.");
    }
    const intent = this.createNightIntent();
    const role = this.core.players.find((player) => player.id === HUMAN_PLAYER_ID)!.role;
    return this.finishNight({
      ...intent,
      ...(role === "murderer" ? { murderTargetId: targetId } : {}),
      ...(role === "investigator" ? { investigationTargetId: targetId } : {}),
      ...(role === "apothecary" ? { protectionTargetId: targetId } : {}),
    });
  }

  private finishNight(intent: NightIntent): TrialIntentResult {
    const result = resolveNight(this.core, intent, this.random);
    if (result.killedPlayerId) {
      this.chronicle.push(
        `${this.night}번째 밤, ${this.nameOf(result.killedPlayerId)}의 방에서 촛불이 꺼졌다.`,
      );
    } else {
      this.chronicle.push(`${this.night}번째 밤, 약제사의 약병이 한 목숨을 붙잡았다.`);
    }
    this.publishNightInformation();
    this.accusationVotes = [];
    this.defendants = [];
    this.verdictVotes = [];
    this.resolution = null;
    this.phase = this.core.winner ? "ended" : "debate";
    return this.accept();
  }

  private legalNightTargets(): PlayerId[] {
    const human = this.core.players.find((player) => player.id === HUMAN_PLAYER_ID)!;
    if (!human.alive || human.role === "commoner") return [];
    return this.core.players
      .filter(
        (target) =>
          target.alive &&
          (human.role === "murderer"
            ? target.faction !== "murderers"
            : human.role === "investigator"
              ? target.id !== human.id
              : target.id !== human.lastProtectedTargetId &&
                (target.id !== human.id || !human.selfProtectionUsed)),
      )
      .map((target) => target.id);
  }

  private privateNotes(): string[] {
    const human = this.core.players.find((player) => player.id === HUMAN_PLAYER_ID)!;
    const notes: string[] = [];
    if (human.role === "murderer")
      notes.push(
        `살인자 동료: ${this.core.players
          .filter((p) => p.faction === "murderers" && p.id !== human.id)
          .map((p) => this.nameOf(p.id))
          .join(", ")}`,
      );
    for (const night of this.core.nightHistory) {
      if (night.investigation?.investigatorId === human.id) {
        notes.push(
          `${night.day}일 조사: ${this.nameOf(night.investigation.targetId)} — ${night.investigation.targetActed ? "밤에 행동함 (범인 확정 아님)" : "밤에 행동하지 않음"}`,
        );
      }
      for (const testimony of night.testimonies.filter((item) => item.recipientId === human.id))
        notes.push(`${night.day}일 목격: ${this.toTrialTestimony(testimony).text}`);
    }
    return notes;
  }

  private defenseFor(playerId: PlayerId): string {
    const clue = this.testimonies.find((item) => item.speakerId === playerId);
    return clue
      ? `내가 밝힌 것은 이것뿐이오. ${clue.text}`
      : "밤의 움직임만으로 범인이라 단정하지 마시오. 공개된 증언을 서로 대조해 주시오.";
  }

  private createNightIntent(forcedMurderTargetId?: PlayerId): NightIntent {
    const intent = chooseNightIntent(this.core, this.random, BOT_PROFILES.baseline, this.ledger);
    return { ...intent, murderTargetId: forcedMurderTargetId ?? intent.murderTargetId };
  }

  private publishNightInformation(): void {
    absorbNightInformation(this.core, this.ledger, this.random, BOT_PROFILES.baseline);
    const night = this.core.nightHistory.at(-1)!;
    this.testimonies = night.testimonies
      .filter((item) => this.ledger.disclosedTestimonyIds.has(item.id))
      .map((item) => this.toTrialTestimony(item));
    if (night.investigation && this.ledger.disclosedInvestigations.has(night.day)) {
      const clue = night.investigation;
      this.testimonies.push({
        id: `investigation-${night.day}`,
        speakerId: clue.investigatorId,
        speakerName: this.nameOf(clue.investigatorId),
        text: `${withParticle(this.nameOf(clue.targetId), "은", "는")} 밤에 ${clue.targetActed ? "움직였소. 단, 약제사도 밤에 움직이니 범인이라는 뜻은 아니오." : "움직이지 않았소."}`,
        reliability: "clear",
      });
    }
    for (const clue of this.testimonies) this.chronicle.push(`${clue.speakerName}: ${clue.text}`);
  }

  observeVote(): TrialIntentResult {
    if (this.isLiving(HUMAN_PLAYER_ID)) return this.reject("생존자는 직접 투표해야 합니다.");
    if (this.phase === "accusation") {
      const target = this.core.players.find((player) => player.alive)!;
      return this.submitAccusation(target.id);
    }
    if (this.phase === "verdict") return this.submitVerdict(this.defendants[0]!);
    return this.reject("지금은 표결 관전 단계가 아닙니다.");
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
