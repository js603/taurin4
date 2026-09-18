import type { GamePhase, Player, Role, Testimony, VoteTally, Winner } from "./types";

export const PLAYER_SEATS = [
  { id: "rowan", name: "로언", title: "성문지기" },
  { id: "marta", name: "마르타", title: "직조공" },
  { id: "edwin", name: "에드윈", title: "서기관" },
  { id: "osric", name: "오스릭", title: "마구간지기" },
  { id: "elise", name: "엘리즈", title: "약초상" },
  { id: "henrik", name: "헨릭", title: "대장장이" },
  { id: "isabel", name: "이사벨", title: "순례자" },
  { id: "gareth", name: "가레스", title: "사냥꾼" },
] as const;

export const ROLE_COUNTS: Record<Role, number> = {
  murderer: 2,
  bailiff: 1,
  apothecary: 1,
  commoner: 4,
};

export const PHASE_LABELS: Record<GamePhase, string> = {
  "opening-night": "개막의 밤",
  debate: "자유 토론",
  accusation: "고발",
  defendants: "피고석",
  verdict: "최종 판결",
  resolution: "판결 기록",
  ended: "재판 종결",
};

export function livingPlayers(players: Player[]): Player[] {
  return players.filter((player) => player.living);
}

export function isMurderer(player: Player): boolean {
  return player.role === "murderer";
}

export function determineWinner(players: Player[]): Winner {
  const living = livingPlayers(players);
  const murderers = living.filter(isMurderer).length;
  const innocents = living.length - murderers;

  if (murderers === 0) return "commoners";
  if (murderers >= innocents) return "murderers";
  return null;
}

export function rankVotes(votes: VoteTally[], players: Player[]): VoteTally[] {
  const seatOrder = new Map(players.map((player, index) => [player.id, index]));
  return [...votes].sort((left, right) => {
    const countDifference = right.count - left.count;
    if (countDifference !== 0) return countDifference;
    return (seatOrder.get(left.playerId) ?? 0) - (seatOrder.get(right.playerId) ?? 0);
  });
}

export function createOpeningAttack(target: Player): {
  targetId: string;
  targetName: string;
  killed: false;
  description: string;
} {
  return {
    targetId: target.id,
    targetName: target.name,
    killed: false,
    description: `새벽 종이 울리기 전, 누군가 ${target.name}의 문을 습격했다. 피는 남았지만 목숨은 건졌다.`,
  };
}

export function createTestimonies(players: Player[], witnesses: string[]): Testimony[] {
  const living = livingPlayers(players);
  const candidates = living.filter((player) => witnesses.includes(player.id));
  const fallback = living.slice(0, 3);
  const speakers = candidates.length >= 2 ? candidates : fallback;
  const lines = [
    "빗소리 사이로 쇠붙이가 부딪히는 소리를 들었소.",
    "회랑 끝 촛불이 꺼질 때, 검은 망토 하나가 스쳤소.",
    "누군가 성문 안쪽 열쇠를 너무 잘 알고 있었소.",
  ];
  const reliabilities: Testimony["reliability"][] = ["faint", "clear", "strong"];

  return speakers.slice(0, 3).map((speaker, index) => ({
    id: `testimony-${speaker.id}-${index}`,
    speakerId: speaker.id,
    speakerName: speaker.name,
    text: lines[index % lines.length]!,
    reliability: reliabilities[index % reliabilities.length]!,
  }));
}
