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
  addPublicClaim,
  publicVoteReason,
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
      return "배역을 확인하세요. 첫 밤에는 아무도 죽지 않습니다.";
    case "dawn":
      return "아침 발표를 확인한 뒤 토론을 시작하세요.";
    case "night":
      return "당신의 역할에 따라 밤의 행동 대상을 선택하라.";
    case "debate":
      return "증언의 빈틈을 살피고, 누가 거짓말을 하는지 찾아라.";
    case "accusation":
      return "한 사람을 고발하라. 두 명의 피고가 정해진다.";
    case "defendants":
      return "두 사람이 피고석에 섰다. 그들의 마지막 말을 들어라.";
    case "verdict":
      return "피고 한 명 또는 처형 보류를 선택하세요. 생존자 과반수의 찬성만 처형으로 이어집니다.";
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
  private readonly names: string[];
  private pendingAccusations: Record<PlayerId, PlayerId> = {};
  private accusations: string[] = [];
  private ballotRecords: string[] = [];
  private humanDefense: string | null = null;

  constructor(seed = 20260918, nickname = "당신") {
    this.random = new Mulberry32(seed);
    this.core = createGame(seed, this.random);
    this.ledger = createSuspicionLedger(this.core, this.random);
    this.names = SEATS.map((seat) => seat.name as string);
    const nameRandom = new Mulberry32(seed ^ 0x61ac);
    for (let i = this.names.length - 1; i > 0; i--) {
      const j = Math.floor(nameRandom.next() * (i + 1));
      [this.names[i], this.names[j]] = [this.names[j]!, this.names[i]!];
    }
    this.names[6] = nickname.trim().slice(0, 16) || "당신";
    this.names = this.names.map((name, index) =>
      index !== 6 && name === this.names[6] ? `${name}·${index + 1}` : name,
    );
    this.openingAttack = {
      targetId: "",
      targetName: "",
      killed: false,
      description:
        "8명 중 살인자 2명이 숨어 있습니다. 첫 밤은 준비 단계입니다. 집행관만 진영을 조사하며, 살인과 보호 자원 소모는 없습니다. 이름과 비밀 역할은 서로 무관합니다.",
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
      ballotRecords: this.ballotRecords,
      accusations: this.accusations,
      resolution: this.resolution,
      winner: this.core.winner,
      currentPrompt: promptForPhase(this.phase, this.core.winner),
      chronicle: this.chronicle,
    });
  }

  advanceOpeningNight(targetId?: PlayerId): TrialIntentResult {
    if (this.phase !== "opening-night") return this.reject("개막의 밤은 이미 끝났습니다.");
    const needsTarget = this.legalNightTargets().length > 0;
    if (needsTarget) {
      if (!targetId || !this.legalNightTargets().includes(targetId))
        return this.reject("첫 밤에 조사할 다른 생존자를 선택하세요.");
    }
    const automatic = this.createNightIntent();
    const intent = needsTarget ? { ...automatic, investigationTargetId: targetId! } : automatic;
    resolveNight(this.core, intent, this.random);
    this.publishNightInformation();
    this.phase = "dawn";
    this.chronicle.push(
      "1일 아침 · 준비 밤이 끝났습니다. 사망자는 없습니다. 살인 대상이나 보호 대상은 공개되지 않습니다.",
    );
    return this.accept();
  }

  beginDiscussion(): TrialIntentResult {
    if (this.phase !== "dawn") return this.reject("아침 발표 후에 토론할 수 있습니다.");
    this.phase = this.core.winner ? "ended" : "debate";
    return this.accept();
  }

  claimInvestigation(targetId: PlayerId, guilty: boolean): TrialIntentResult {
    if (this.phase !== "debate" || !this.isLiving(HUMAN_PLAYER_ID))
      return this.reject("살아 있는 플레이어만 토론 중 발언할 수 있습니다.");
    if (
      !this.isLiving(targetId) ||
      targetId === HUMAN_PLAYER_ID ||
      this.ledger.claims.some((c) => c.day === this.core.day && c.speakerId === HUMAN_PLAYER_ID)
    )
      return this.reject("자신을 제외한 생존자에 대해 하루 한 번만 조사 주장을 할 수 있습니다.");
    addPublicClaim(this.core, this.ledger, HUMAN_PLAYER_ID, targetId, guilty);
    this.refreshClaims();
    this.chronicle.push(
      `${this.nameOf(HUMAN_PLAYER_ID)}의 공개 주장: ${this.nameOf(targetId)} — ${guilty ? "살인자" : "주민"}. 진위 미확인.`,
    );
    return this.accept();
  }

  discloseLatestInvestigation(): TrialIntentResult {
    const result = this.core.nightHistory.at(-1)?.investigation;
    if (!result || result.investigatorId !== HUMAN_PLAYER_ID)
      return this.reject("공개할 본인의 최근 조사 결과가 없습니다.");
    return this.claimInvestigation(result.targetId, result.targetIsMurderer);
  }

  beginAccusation(): TrialIntentResult {
    if (this.phase !== "debate") return this.reject("토론이 끝나야 고발할 수 있습니다.");
    beginAccusation(this.core);
    this.pendingAccusations = chooseAccusationVotes(
      this.core,
      this.ledger,
      this.random,
      BOT_PROFILES.baseline,
    );
    this.accusations = Object.entries(this.pendingAccusations)
      .filter(([voter]) => voter !== HUMAN_PLAYER_ID)
      .map(
        ([voter, target]) =>
          `${this.nameOf(voter)} → ${this.nameOf(target)}: ${this.reasonFor(target)}`,
      );
    this.phase = "accusation";
    return this.accept();
  }

  submitAccusation(targetId: PlayerId): TrialIntentResult {
    if (this.phase !== "accusation") return this.reject("지금은 고발할 때가 아닙니다.");
    if (!this.isLiving(targetId) || targetId === HUMAN_PLAYER_ID) {
      return this.reject("살아 있는 다른 인물을 고발해야 합니다.");
    }

    const votes = { ...this.pendingAccusations };
    if (this.isLiving(HUMAN_PLAYER_ID)) votes[HUMAN_PLAYER_ID] = targetId;
    const result = resolveAccusation(this.core, votes);
    this.accusationVotes = tally(votes);
    this.defendants = [...result.finalists];
    this.recordBallots("고발", votes);
    this.phase = "defendants";
    const pair = joinKoreanAnd(this.nameOf(this.defendants[0]!), this.nameOf(this.defendants[1]!));
    this.chronicle.push(
      `${withParticle(pair, "이", "가")} 득표 상위 2명으로 피고가 됐습니다. ${this.defendants.map((id) => `${this.nameOf(id)} ${votes ? Object.values(votes).filter((v) => v === id).length : 0}표`).join(", ")}. 동률은 이번 날 공개된 좌석 순번으로 결정합니다. 고발은 유죄 확정이 아닙니다.`,
    );
    return this.accept();
  }

  beginVerdict(): TrialIntentResult {
    if (this.phase !== "defendants") return this.reject("피고석의 변론부터 들어야 합니다.");
    beginVerdict(this.core);
    this.phase = "verdict";
    return this.accept();
  }

  submitDefense(choice: "deny" | "evidence"): TrialIntentResult {
    if (
      this.phase !== "defendants" ||
      !this.defendants.includes(HUMAN_PLAYER_ID) ||
      this.humanDefense
    )
      return this.reject("피고로 지목된 날 변론 단계에서 한 번 발언할 수 있습니다.");
    this.humanDefense =
      choice === "deny"
        ? "나는 살인자가 아닙니다. 고발만으로 유죄를 확정하지 마세요."
        : "고발한 분들은 주장과 확정 사실을 구분해 주세요. 근거가 부족하면 처형을 보류해 주세요.";
    this.chronicle.push(`${this.nameOf(HUMAN_PLAYER_ID)}의 변론: ${this.humanDefense}`);
    return this.accept();
  }

  submitVerdict(targetId: PlayerId): TrialIntentResult {
    if (this.phase !== "verdict") return this.reject("지금은 최종 판결을 내릴 때가 아닙니다.");
    if (targetId !== "pardon" && !this.defendants.includes(targetId))
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
    this.recordBallots("판결", votes);
    this.resolution = !result.eliminatedPlayerId
      ? {
          kind: "deadlock",
          targetId: null,
          targetName: null,
          text: `처형에 필요한 ${Math.floor(this.core.players.filter((p) => p.alive).length / 2) + 1}표를 얻은 피고가 없습니다. 오늘은 처형을 보류합니다.`,
        }
      : {
          kind: "execution",
          targetId: result.eliminatedPlayerId,
          targetName: result.eliminatedPlayerId ? this.nameOf(result.eliminatedPlayerId) : null,
          text: `${this.nameOf(result.eliminatedPlayerId!)} 처형. 공개된 실제 역할: ${this.roleLabel(this.core.players.find((p) => p.id === result.eliminatedPlayerId)!.role)}.`,
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
        `${this.core.day}일 아침 · 밤의 습격으로 ${this.nameOf(result.killedPlayerId)} 사망. 공개 역할: ${this.roleLabel(this.core.players.find((p) => p.id === result.killedPlayerId)!.role)}. 범인과 행동 대상은 공개되지 않습니다.`,
      );
    } else {
      this.chronicle.push(
        `${this.core.day}일 아침 · 사망자 없음. 보호 대상과 약제사의 신원은 공개하지 않습니다.`,
      );
    }
    const announcement = this.chronicle.at(-1)!;
    this.publishNightInformation();
    this.chronicle.push(announcement);
    this.accusationVotes = [];
    this.defendants = [];
    this.verdictVotes = [];
    this.resolution = null;
    this.humanDefense = null;
    this.accusations = [];
    this.phase = "dawn";
    return this.accept();
  }

  private legalNightTargets(): PlayerId[] {
    const human = this.core.players.find((player) => player.id === HUMAN_PLAYER_ID)!;
    if (this.phase !== "night" && this.phase !== "opening-night") return [];
    if (this.phase === "opening-night" && human.role !== "investigator") return [];
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
          `${night.day}일 비공개 조사: ${this.nameOf(night.investigation.targetId)} — ${night.investigation.targetIsMurderer ? "살인자 진영" : "주민 진영"}. 이 결과는 당신만 확인했습니다. 공개 발언은 다른 사람에게는 검증되지 않은 주장입니다.`,
        );
      }
      for (const testimony of night.testimonies.filter((item) => item.recipientId === human.id))
        notes.push(`${night.day}일 목격: ${this.toTrialTestimony(testimony).text}`);
    }
    return notes;
  }

  private defenseFor(playerId: PlayerId): string {
    const voters = Object.entries(this.core.accusationHistory.at(-1)?.votes ?? {})
      .filter(([, target]) => target === playerId)
      .map(([voter]) => this.nameOf(voter));
    const allegations = this.ledger.claims
      .filter((c) => c.targetId === playerId && c.guilty)
      .map((c) => this.nameOf(c.speakerId));
    const speech =
      playerId === HUMAN_PLAYER_ID
        ? (this.humanDefense ??
          "아직 변론하지 않았습니다. 아래에서 발언을 선택하거나 침묵할 수 있습니다.")
        : allegations.length
          ? `“${allegations.join(", ")}의 조사 주장을 부인합니다. 사칭일 수 있습니다. 나는 살인자가 아닙니다.”`
          : "“나를 살인자라고 확인한 공개 정보가 없습니다. 표가 많다는 이유만으로 처형하지 마세요.”";
    return `${voters.join(", ") || "동률 순번"}의 고발로 ${this.accusationVotes.find((v) => v.playerId === playerId)?.count ?? 0}표를 받았습니다. ${speech} 변론 자체는 진실을 보증하지 않습니다.`;
  }

  private createNightIntent(forcedMurderTargetId?: PlayerId): NightIntent {
    const intent = chooseNightIntent(this.core, this.random, BOT_PROFILES.baseline, this.ledger);
    return { ...intent, murderTargetId: forcedMurderTargetId ?? intent.murderTargetId };
  }

  private publishNightInformation(): void {
    absorbNightInformation(
      this.core,
      this.ledger,
      this.random,
      BOT_PROFILES.baseline,
      HUMAN_PLAYER_ID,
    );
    this.refreshClaims();
    for (const clue of this.testimonies.filter((c) => c.id.startsWith(`claim-${this.core.day}-`)))
      this.chronicle.push(`${clue.speakerName}: ${clue.text}`);
  }

  private refreshClaims(): void {
    this.testimonies = this.ledger.claims.map((claim) => ({
      id: claim.id,
      speakerId: claim.speakerId,
      speakerName: this.nameOf(claim.speakerId),
      text: `${claim.day}일 · “나는 집행관이며 ${this.nameOf(claim.targetId)} 조사 결과는 ${claim.guilty ? "살인자" : "주민"}입니다.” 검증되지 않은 주장 · 사칭 가능`,
      reliability: "faint",
    }));
  }

  private reasonFor(target: PlayerId): string {
    let reason = publicVoteReason(this.core, this.ledger, target);
    for (const claim of this.ledger.claims)
      reason = reason.replaceAll(claim.id, `${claim.day}일 ${this.nameOf(claim.speakerId)}의 주장`);
    return reason;
  }

  private recordBallots(kind: string, votes: Record<PlayerId, PlayerId>): void {
    for (const [voter, target] of Object.entries(votes)) {
      const line = `${this.core.day}일 ${kind} · ${this.nameOf(voter)} → ${target === "pardon" ? "처형 보류" : this.nameOf(target)}`;
      this.ballotRecords.push(line);
      this.chronicle.push(line);
    }
  }

  private roleLabel(role: PlayerState["role"]): string {
    return { murderer: "살인자", investigator: "집행관", apothecary: "약제사", commoner: "평민" }[
      role
    ];
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
    return player ? this.names[player.seat]! : "이름 없는 자";
  }

  private toTrialPlayer(player: PlayerState): TrialPlayer {
    return {
      id: player.id,
      name: this.nameOf(player.id),
      title:
        !player.alive || this.core.winner
          ? this.roleLabel(player.role)
          : `좌석 ${player.seat + 1} · 역할 비공개`,
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
