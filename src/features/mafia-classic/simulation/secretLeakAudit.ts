import { publicRoleOf } from "../core/resolvers.js";
import type { GameState, PlayerId } from "../core/types.js";
import type { PlayerView } from "../core/playerView.js";

function leak(message: string): never {
  throw new Error("SECRET_LEAK: " + message);
}

export function assertPlayerViewSecrecy(
  state: GameState,
  viewerId: PlayerId,
  view: PlayerView,
): void {
  const viewer = state.players.find((player) => player.id === viewerId);
  if (!viewer) leak("unknown viewer");

  if (view.self.id !== viewer.id) leak("self id mismatch");
  if (view.self.role !== viewer.role) leak("self role mismatch");
  if (view.self.alignment !== viewer.alignment) leak("self alignment mismatch");

  for (const publicPlayer of view.players) {
    const source = state.players.find((player) => player.id === publicPlayer.id);
    if (!source) leak("unknown public player");

    const expectedPublicRole = publicRoleOf(state, source.id);
    if (publicPlayer.publicRole !== expectedPublicRole) {
      leak("public role visibility mismatch for " + source.id);
    }

    if (
      state.phase !== "GAME_OVER" &&
      source.alive &&
      source.id !== viewerId &&
      publicPlayer.publicRole !== null
    ) {
      leak("living hidden role exposed before GAME_OVER for " + source.id);
    }
  }

  if (viewer.role === "MAFIA") {
    if (!view.mafiaMembers) leak("Mafia viewer missing mafiaMembers");
    const expectedIds = state.players
      .filter((player) => player.alive && player.role === "MAFIA")
      .map((player) => player.id)
      .sort();
    const actualIds = view.mafiaMembers.map((player) => player.id).sort();
    if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
      leak("Mafia membership mismatch");
    }
  } else if (view.mafiaMembers !== null) {
    leak("non-Mafia viewer received mafiaMembers");
  }

  if (viewer.role === "DETECTIVE") {
    const expected = state.investigationResults[viewer.id] ?? [];
    if (JSON.stringify(view.detectiveHistory) !== JSON.stringify(expected)) {
      leak("Detective history mismatch");
    }
  } else if (view.detectiveHistory !== null) {
    leak("non-Detective viewer received detectiveHistory");
  }

  if (viewer.role === "DOCTOR") {
    if (view.doctorLastProtectedTargetId !== state.doctorLastProtectedTargetId) {
      leak("Doctor protection history mismatch");
    }
  } else if (view.doctorLastProtectedTargetId !== null) {
    leak("non-Doctor viewer received doctor protection history");
  }

  if (viewer.role !== "MAFIA" && view.mafiaNightProgress !== null) {
    leak("non-Mafia viewer received Mafia progress");
  }

  if (state.phase === "DAY_VOTE" && view.voteResult !== null) {
    leak("vote result exposed before VOTE_RESULT");
  }

  const serialized = JSON.stringify(view);
  if (serialized.includes('"votes"') || serialized.includes('"nightActions"')) {
    leak("raw secret GameState containers exposed");
  }
}

export function assertAllPlayerViewsSecretSafe(state: GameState): void {
  for (const player of state.players) {
    const { buildPlayerView } = requirePlayerView();
    const view = buildPlayerView(state, player.id);
    assertPlayerViewSecrecy(state, player.id, view);
  }
}

function requirePlayerView(): typeof import("../core/playerView.js") {
  // Kept behind a function to avoid accidental state mutation and make the audit dependency explicit.
  return playerViewModule;
}

import * as playerViewModule from "../core/playerView.js";
