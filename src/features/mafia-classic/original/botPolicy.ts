import type { RandomSource } from "../core/random.js";
import type { OriginalPlayerView, OriginalPublicPlayerView } from "./playerView.js";
import type { NightNote, PlayerId } from "./types.js";

function aliveOthers(view: OriginalPlayerView): OriginalPublicPlayerView[] {
  return view.players.filter(
    (player) => player.alive && player.id !== view.self.id,
  );
}

function mafiaIds(view: OriginalPlayerView): Set<PlayerId> {
  return new Set(view.mafiaMembers?.map((member) => member.id) ?? []);
}

export function originalBotChat(view: OriginalPlayerView, rng: RandomSource): string {
  const candidates = aliveOthers(view);
  const target = candidates.length > 0 ? rng.pick(candidates) : null;
  const lines = target
    ? [
        target.name + "의 지금 말은 근거가 약해 보여.",
        target.name + ", 그 판단을 한 이유를 더 설명해줘.",
        "나는 아직 " + target.name + "을 완전히 믿지 못하겠어.",
        "지금은 표보다 발언 흐름을 더 보자.",
        "방금 이야기에서 서로 모순되는 부분이 있는지 확인해보자.",
      ]
    : ["공개된 정보부터 다시 정리해보자."];
  return rng.pick(lines);
}

export function originalBotAccusationTarget(
  view: OriginalPlayerView,
  rng: RandomSource,
): PlayerId {
  let candidates = aliveOthers(view);
  if (view.self.role === "MAFIA") {
    const mafia = mafiaIds(view);
    const honestCandidates = candidates.filter((player) => !mafia.has(player.id));
    if (honestCandidates.length > 0) candidates = honestCandidates;
  }
  return rng.pick(candidates).id;
}

export function originalBotGuiltyVote(
  view: OriginalPlayerView,
  rng: RandomSource,
): boolean {
  const accusedId = view.accusation?.accusedId;
  if (!accusedId) return false;

  if (view.self.role === "MAFIA") {
    const mafia = mafiaIds(view);
    if (mafia.has(accusedId)) return false;
    return rng.next() < 0.82;
  }

  return rng.next() < 0.58;
}

export function originalBotNightProposalVote(
  view: OriginalPlayerView,
  rng: RandomSource,
): boolean {
  void view;
  void rng;
  return true;
}

export function originalBotNightNote(
  view: OriginalPlayerView,
  rng: RandomSource,
): NightNote {
  if (view.self.role === "HONEST") return { kind: "HONEST" };

  const mafia = mafiaIds(view);
  const targets = view.players.filter(
    (player) => player.alive && !mafia.has(player.id),
  );
  if (targets.length > 0) {
    const ordered = [...targets].sort((a, b) => a.id.localeCompare(b.id));
    return { kind: "TARGET", targetId: ordered[0]!.id };
  }

  const fallback = view.players.filter((player) => player.alive);
  return { kind: "TARGET", targetId: rng.pick(fallback).id };
}
