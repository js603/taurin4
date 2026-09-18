import type { Faction, PlayerState, Role } from "./types.js";

export const MEDIEVAL_TRIAL_V01 = {
  playerCount: 8,
  roleCount: {
    murderer: 2,
    investigator: 1,
    apothecary: 1,
    commoner: 4,
  } satisfies Record<Role, number>,
  testimonyRecipientsMin: 2,
  testimonyRecipientsMax: 3,
  selfProtectionLimit: 1,
  consecutiveProtectionAllowed: false,
  prologueKills: false,
} as const;

export function factionOf(role: Role): Faction {
  return role === "murderer" ? "murderers" : "residents";
}

export function alivePlayers(players: readonly PlayerState[]): PlayerState[] {
  return players.filter((player) => player.alive);
}

export function livingByRole(players: readonly PlayerState[], role: Role): PlayerState[] {
  return players.filter((player) => player.alive && player.role === role);
}

export function checkWinner(players: readonly PlayerState[]): Faction | null {
  const alive = alivePlayers(players);
  const murderers = alive.filter((player) => player.role === "murderer").length;
  const residents = alive.length - murderers;

  if (murderers === 0) return "residents";
  if (murderers >= residents) return "murderers";
  return null;
}
