import {
  PLAYER_SEATS,
  ROLE_COUNTS,
  createOpeningAttack,
  createTestimonies,
  determineWinner,
  livingPlayers,
  rankVotes,
} from "../domain/rules";
import { SeededRandom } from "../domain/seededRandom";
import type { GameState, Player, PlayerIntentResult, Role, VoteTally } from "../domain/types";

const HUMAN_PLAYER_ID = "isabel";

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function voteTally(votes: string[]): VoteTally[] {
  const counts = new Map<string, number>();
  for (const vote of votes) counts.set(vote, (counts.get(vote) ?? 0) + 1);
  return [...counts.entries()].map(([playerId, count]) => ({ playerId, count }));
}

function roleDeck(random: SeededRandom): Role[] {
  const roles: Role[] = [];
  for (const [role, count] of Object.entries(ROLE_COUNTS) as [Role, number][]) {
    for (let index = 0; index < count; index += 1) roles.push(role);
  }
  return random.shuffle(roles);
}

function promptForPhase(state: GameState): string {
  switch (state.phase) {
    case "opening-night":
      return "종이 세 번 울리면 대연회장의 문이 열린다.";
    case "debate":
      return "증언의 빈틈을 살피고, 누가 거짓말을 하는지 찾아라.";
    case "accusation":
      return "한 사람을 고발하라. 다른 이들의 고발과 함께 피고석이 정해진다.";
    case "defendants":
      return "두 사람이 피고석에 섰다. 그들의 마지막 말을 들을 때다.";
    case "verdict":
      return "이제 배심의 칼끝을 한 사람에게 향해야 한다.";
    case "resolution":
      return "판결은 기록되었다. 다음 종이 울리기 전, 숨을 고르라.";
    case "ended":
      return state.winner === "commoners"
        ? "성 안의 살인자는 모두 드러났다."
        : "어둠이 성벽 안쪽까지 번졌다.";
  }
}

export class GameEngine {
  private readonly random: SeededRandom;
  private state: GameState;

  constructor(seed = 240918, playerId = HUMAN_PLAYER_ID) {
    this.random = new SeededRandom(seed);
    const roles = roleDeck(this.random);
    const players: Player[] = PLAYER_SEATS.map((seat, index) => ({
      ...seat,
      role: roles[index]!,
      living: true,
      isHuman: seat.id === playerId,
    }));
    const openingTarget = this.random.pick(players);

    this.state = {
      seed,
      phase: "opening-night",
      day: 0,
      night: 1,
      playerId,
      players,
      openingAttack: createOpeningAttack(openingTarget),
      testimonies: [],
      accusationVotes: [],
      defendants: [],
      verdictVotes: [],
      resolution: null,
      winner: null,
      currentPrompt: "종이 세 번 울리면 대연회장의 문이 열린다.",
      chronicle: [
        "성 아그네스 성의 대연회장에 여덟 사람이 모였다.",
        createOpeningAttack(openingTarget).description,
      ],
    };
  }

  getState(): GameState {
    return cloneState(this.state);
  }

  advanceOpeningNight(): PlayerIntentResult {
    if (this.state.phase !== "opening-night")
      return this.reject("아직 개막의 밤이 끝나지 않았습니다.");
    this.state.phase = "debate";
    this.state.day = 1;
    this.state.testimonies = createTestimonies(this.state.players, ["rowan", "marta", "gareth"]);
    this.state.chronicle.push(
      "첫 습격은 살인으로 이어지지 않았다. 그러나 범인은 성 안에 남아 있다.",
    );
    this.refreshPrompt();
    return this.accept();
  }

  beginAccusation(): PlayerIntentResult {
    if (this.state.phase !== "debate") return this.reject("토론이 끝나야 고발할 수 있습니다.");
    this.state.phase = "accusation";
    this.refreshPrompt();
    return this.accept();
  }

  submitAccusation(targetId: string): PlayerIntentResult {
    if (this.state.phase !== "accusation") return this.reject("지금은 고발할 때가 아닙니다.");
    if (!this.isLivingPlayer(targetId) || targetId === this.state.playerId) {
      return this.reject("살아 있는 다른 인물을 고발해야 합니다.");
    }

    const living = livingPlayers(this.state.players);
    const botVotes = living
      .filter((player) => player.id !== this.state.playerId)
      .map((player, index) => this.chooseAccusation(player, living, index));
    this.state.accusationVotes = voteTally([targetId, ...botVotes]);
    const ranked = rankVotes(this.state.accusationVotes, this.state.players);
    this.state.defendants = ranked.slice(0, 2).map((vote) => vote.playerId);
    this.state.phase = "defendants";
    this.state.chronicle.push(
      `${this.getPlayer(targetId)?.name ?? "누군가"}에 대한 고발이 울려 퍼졌다.`,
    );
    this.refreshPrompt();
    return this.accept();
  }

  beginVerdict(): PlayerIntentResult {
    if (this.state.phase !== "defendants")
      return this.reject("피고석이 열리기 전에는 판결할 수 없습니다.");
    this.state.phase = "verdict";
    this.refreshPrompt();
    return this.accept();
  }

  submitVerdict(targetId: string): PlayerIntentResult {
    if (this.state.phase !== "verdict")
      return this.reject("지금은 최종 판결을 내릴 때가 아닙니다.");
    if (!this.state.defendants.includes(targetId))
      return this.reject("피고석에 선 사람만 판결할 수 있습니다.");

    const living = livingPlayers(this.state.players);
    const botVotes = living
      .filter((player) => player.id !== this.state.playerId)
      .map((player, index) => this.chooseVerdict(player, index));
    this.state.verdictVotes = voteTally([targetId, ...botVotes]);
    const ranked = rankVotes(this.state.verdictVotes, this.state.players).filter((vote) =>
      this.state.defendants.includes(vote.playerId),
    );
    const top = ranked[0];
    const second = ranked[1];
    const isDeadlock = !top || (second !== undefined && top.count === second.count);

    if (isDeadlock) {
      this.state.resolution = {
        kind: "deadlock",
        targetId: null,
        targetName: null,
        text: "배심은 결론에 이르지 못했다. 누구도 처형되지 않았다.",
      };
    } else {
      const target = this.getPlayer(top.playerId);
      if (!target) return this.reject("판결 대상이 사라졌습니다.");
      target.living = false;
      this.state.resolution = {
        kind: "execution",
        targetId: target.id,
        targetName: target.name,
        text: `${target.name}에게 유죄 판결이 내려졌다. 성문 밖으로 끌려갔다.`,
      };
    }

    this.state.winner = determineWinner(this.state.players);
    this.state.phase = "resolution";
    this.state.chronicle.push(this.state.resolution.text);
    this.refreshPrompt();
    return this.accept();
  }

  continueAfterVerdict(): PlayerIntentResult {
    if (this.state.phase !== "resolution")
      return this.reject("판결 기록이 끝난 뒤에 다음 밤으로 갈 수 있습니다.");
    if (this.state.winner) {
      this.state.phase = "ended";
      this.refreshPrompt();
      return this.accept();
    }

    this.state.night += 1;
    const living = livingPlayers(this.state.players);
    const murderers = living.filter((player) => player.role === "murderer");
    const targets = living.filter((player) => player.role !== "murderer");
    const victim = targets.length > 0 ? this.random.pick(targets) : null;
    const protector = living.find((player) => player.role === "apothecary");
    if (victim && victim.id !== protector?.id) {
      victim.living = false;
      this.state.chronicle.push(`둘째 밤, ${victim.name}의 방에서 촛불이 꺼졌다.`);
    } else if (murderers.length > 0) {
      this.state.chronicle.push("둘째 밤, 약제사의 약병이 한 목숨을 붙잡았다.");
    }

    this.state.winner = determineWinner(this.state.players);
    if (this.state.winner) {
      this.state.phase = "ended";
    } else {
      this.state.day += 1;
      this.state.phase = "debate";
      this.state.testimonies = createTestimonies(this.state.players, ["rowan", "marta", "gareth"]);
    }
    this.refreshPrompt();
    return this.accept();
  }

  private chooseAccusation(player: Player, living: Player[], index: number): string {
    const suspects = living.filter(
      (candidate) => candidate.id !== player.id && candidate.id !== this.state.playerId,
    );
    const testimonyHint =
      this.state.testimonies[index % Math.max(this.state.testimonies.length, 1)]?.speakerId;
    const hinted = suspects.find((candidate) => candidate.id === testimonyHint);
    return hinted?.id ?? this.random.pick(suspects).id;
  }

  private chooseVerdict(player: Player, index: number): string {
    const candidates = this.state.defendants.filter((id) => id !== player.id);
    if (candidates.length === 0) return this.state.defendants[0]!;
    const preference = index % 3 === 0 ? this.state.defendants[0] : this.state.defendants[1];
    return preference && candidates.includes(preference)
      ? preference
      : this.random.pick(candidates);
  }

  private isLivingPlayer(playerId: string): boolean {
    return this.state.players.some((player) => player.id === playerId && player.living);
  }

  private getPlayer(playerId: string): Player | undefined {
    return this.state.players.find((player) => player.id === playerId);
  }

  private refreshPrompt(): void {
    this.state.currentPrompt = promptForPhase(this.state);
  }

  private accept(): PlayerIntentResult {
    return { state: this.getState(), error: null };
  }

  private reject(error: string): PlayerIntentResult {
    return { state: this.getState(), error };
  }
}
