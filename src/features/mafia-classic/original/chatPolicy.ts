import type {
  ChatChannel,
  OriginalGameState,
  PlayerId,
} from "./types.js";
import { originalPlayer } from "./gameState.js";

export function writableChatChannels(
  state: OriginalGameState,
  playerId: PlayerId,
): readonly Exclude<ChatChannel, "SYSTEM">[] {
  const player = originalPlayer(state, playerId);
  if (!player?.connected || state.phase === "GAME_OVER") return [];

  if (!player.alive) return ["DEAD"];

  if (state.phase === "DAY_DISCUSSION" || state.phase === "ACCUSATION") {
    return ["PUBLIC"];
  }

  return [];
}

export function readableChatChannels(
  state: OriginalGameState,
  playerId: PlayerId,
): readonly ChatChannel[] {
  const player = originalPlayer(state, playerId);
  if (!player) return [];

  if (state.phase === "GAME_OVER") return ["PUBLIC", "DEAD", "SYSTEM"];
  if (!player.alive) return ["PUBLIC", "DEAD", "SYSTEM"];
  return ["PUBLIC", "SYSTEM"];
}

export function canWriteChat(
  state: OriginalGameState,
  playerId: PlayerId,
  channel: "PUBLIC" | "DEAD",
): boolean {
  return writableChatChannels(state, playerId).includes(channel);
}
