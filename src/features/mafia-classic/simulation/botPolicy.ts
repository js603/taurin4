import type { RandomSource } from "../core/random.js";
import type { PlayerId } from "../core/types.js";
import type { PlayerView, PublicPlayerView } from "../core/playerView.js";

function aliveOthers(view: PlayerView): PublicPlayerView[] {
  return view.players.filter((player) => player.alive && player.id !== view.self.id);
}

function knownMafiaIds(view: PlayerView): Set<PlayerId> {
  return new Set(view.mafiaMembers?.map((member) => member.id) ?? []);
}

export function chooseBotNightTarget(view: PlayerView, rng: RandomSource): PlayerId {
  const candidates = aliveOthers(view);

  if (view.self.role === "MAFIA") {
    const mafia = knownMafiaIds(view);
    const legal = candidates.filter((candidate) => !mafia.has(candidate.id));
    return rng.pick(legal).id;
  }

  if (view.self.role === "DOCTOR") {
    const legal = view.players.filter(
      (candidate) =>
        candidate.alive && candidate.id !== view.doctorLastProtectedTargetId,
    );
    return rng.pick(legal).id;
  }

  if (view.self.role === "DETECTIVE") {
    return rng.pick(candidates).id;
  }

  throw new Error("This bot role has no selectable night target.");
}

function detectiveKnownMafia(view: PlayerView): PlayerId | null {
  const alive = new Set(view.players.filter((player) => player.alive).map((player) => player.id));
  const found = [...(view.detectiveHistory ?? [])]
    .reverse()
    .find((result) => result.result === "MAFIA" && alive.has(result.targetId));
  return found?.targetId ?? null;
}

export function chooseBotNomination(view: PlayerView, rng: RandomSource): PlayerId {
  const detected = detectiveKnownMafia(view);
  if (detected) return detected;

  let candidates = aliveOthers(view);
  if (view.self.role === "MAFIA") {
    const mafia = knownMafiaIds(view);
    candidates = candidates.filter((candidate) => !mafia.has(candidate.id));
  }
  return rng.pick(candidates).id;
}

export function chooseBotVote(view: PlayerView, rng: RandomSource): PlayerId | null {
  const nominees = view.players.filter(
    (player) => player.alive && view.nominations.includes(player.id),
  );
  if (nominees.length === 0) return null;

  const detected = detectiveKnownMafia(view);
  if (detected && view.nominations.includes(detected)) return detected;

  let candidates = nominees;
  if (view.self.role === "MAFIA") {
    const mafia = knownMafiaIds(view);
    const nonMafia = nominees.filter((candidate) => !mafia.has(candidate.id));
    if (nonMafia.length > 0) candidates = nonMafia;
  }

  if (rng.next() < 0.12) return null;
  return rng.pick(candidates).id;
}
