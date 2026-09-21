import { canWriteChat } from "./chatPolicy.js";
import {
  livingOriginalPlayers,
  originalPlayer,
  strictMajority,
} from "./gameState.js";
import type {
  OriginalAction,
  OriginalActionError,
  OriginalGameState,
  OriginalValidationResult,
} from "./types.js";

function ok(): OriginalValidationResult {
  return { ok: true, code: null, message: null };
}

function fail(
  code: OriginalActionError,
  message: string,
): OriginalValidationResult {
  return { ok: false, code, message };
}

export function validateOriginalAction(
  state: OriginalGameState,
  action: OriginalAction,
): OriginalValidationResult {
  if (state.phase === "GAME_OVER") {
    return fail("GAME_OVER", "게임 종료 후에는 Action을 실행할 수 없습니다.");
  }

  const player = originalPlayer(state, action.playerId);
  if (!player) return fail("UNKNOWN_PLAYER", "존재하지 않는 플레이어입니다.");
  if (!player.connected) {
    return fail("PLAYER_DISCONNECTED", "연결되지 않은 플레이어입니다.");
  }

  switch (action.type) {
    case "SET_READY":
      return state.phase === "LOBBY"
        ? ok()
        : fail("INVALID_PHASE", "LOBBY에서만 READY를 변경할 수 있습니다.");

    case "START_GAME":
      if (state.phase !== "LOBBY") {
        return fail("INVALID_PHASE", "LOBBY에서만 게임을 시작할 수 있습니다.");
      }
      if (action.playerId !== state.hostId) {
        return fail("HOST_ONLY", "호스트만 게임을 시작할 수 있습니다.");
      }
      if (!state.players.every((candidate) => candidate.connected && candidate.ready)) {
        return fail("START_CONDITIONS_NOT_MET", "모든 플레이어가 READY여야 합니다.");
      }
      return ok();

    case "CONFIRM_ROLE":
      if (state.phase !== "ROLE_REVEAL") {
        return fail("INVALID_PHASE", "ROLE_REVEAL에서만 역할을 확인할 수 있습니다.");
      }
      return player.roleConfirmed
        ? fail("ALREADY_CONFIRMED", "이미 역할을 확인했습니다.")
        : ok();

    case "CONFIRM_SUNRISE":
      if (state.phase !== "SUNRISE") {
        return fail("INVALID_PHASE", "SUNRISE에서만 확인할 수 있습니다.");
      }
      return player.sunriseConfirmed
        ? fail("ALREADY_CONFIRMED", "이미 Sunrise 확인을 완료했습니다.")
        : ok();

    case "SEND_CHAT": {
      const text = action.text.trim();
      if (!text) return fail("EMPTY_CHAT", "빈 메시지는 보낼 수 없습니다.");
      if (text.length > 500) {
        return fail("CHAT_TOO_LONG", "메시지는 500자 이하여야 합니다.");
      }
      if (!canWriteChat(state, action.playerId, action.channel)) {
        return fail(
          player.alive ? "CHAT_CLOSED" : "INVALID_CHAT_CHANNEL",
          "현재 이 채널에는 메시지를 보낼 수 없습니다.",
        );
      }
      return ok();
    }

    case "ACCUSE_PLAYER": {
      if (!player.alive) return fail("PLAYER_DEAD", "사망자는 고발할 수 없습니다.");
      if (state.phase !== "DAY_DISCUSSION") {
        return fail("INVALID_PHASE", "자유 토론 중에만 새 고발을 시작할 수 있습니다.");
      }
      const target = originalPlayer(state, action.targetId);
      if (!target?.alive) return fail("INVALID_TARGET", "생존자만 고발할 수 있습니다.");
      if (target.id === player.id) return fail("SELF_ACCUSATION", "자기 자신은 고발할 수 없습니다.");
      return ok();
    }

    case "CALL_GUILTY_VOTE":
      if (!player.alive) return fail("PLAYER_DEAD", "사망자는 표결을 요청할 수 없습니다.");
      if (state.phase !== "ACCUSATION" || !state.accusation) {
        return fail("INVALID_PHASE", "진행 중인 고발에서만 유죄 표결을 요청할 수 있습니다.");
      }
      return state.accusation.accuserId === player.id
        ? ok()
        : fail("NOT_ACCUSER", "고발자만 유죄 표결을 요청할 수 있습니다.");

    case "CAST_GUILTY_VOTE": {
      if (!player.alive) return fail("PLAYER_DEAD", "사망자는 표결할 수 없습니다.");
      if (state.phase !== "GUILTY_VOTE" || !state.accusation || !state.guiltyVote) {
        return fail("INVALID_PHASE", "유죄 표결 단계가 아닙니다.");
      }
      if (state.accusation.accusedId === player.id) {
        return fail("ACCUSED_CANNOT_VOTE", "피고는 자신의 유죄 표결에 참여하지 않습니다.");
      }
      if (Object.prototype.hasOwnProperty.call(state.guiltyVote.votes, player.id)) {
        return fail("ALREADY_VOTED", "이미 표결했습니다.");
      }
      return ok();
    }

    case "PROPOSE_MAFIA_NIGHT":
      if (!player.alive) return fail("PLAYER_DEAD", "사망자는 Mafia Night를 제안할 수 없습니다.");
      return state.phase === "DAY_DISCUSSION"
        ? ok()
        : fail("INVALID_PHASE", "자유 토론 중에만 Mafia Night를 제안할 수 있습니다.");

    case "CAST_NIGHT_PROPOSAL_VOTE":
      if (!player.alive) return fail("PLAYER_DEAD", "사망자는 Night 제안 표결에 참여할 수 없습니다.");
      if (state.phase !== "NIGHT_PROPOSAL_VOTE" || !state.nightProposal) {
        return fail("INVALID_PHASE", "Mafia Night 제안 표결 단계가 아닙니다.");
      }
      if (Object.prototype.hasOwnProperty.call(state.nightProposal.vote.votes, player.id)) {
        return fail("ALREADY_VOTED", "이미 표결했습니다.");
      }
      return ok();

    case "SUBMIT_NIGHT_NOTE": {
      if (!player.alive) return fail("PLAYER_DEAD", "사망자는 Night 쪽지를 제출할 수 없습니다.");
      if (state.phase !== "MAFIA_NIGHT") {
        return fail("INVALID_PHASE", "Mafia Night에서만 쪽지를 제출할 수 있습니다.");
      }
      if (Object.prototype.hasOwnProperty.call(state.nightNotes, player.id)) {
        return fail("ALREADY_SUBMITTED", "이미 Night 쪽지를 제출했습니다.");
      }
      if (player.role === "HONEST") {
        return action.note.kind === "HONEST"
          ? ok()
          : fail("INVALID_NIGHT_NOTE", "Honest는 HONEST 쪽지만 제출해야 합니다.");
      }
      if (action.note.kind !== "TARGET") {
        return fail("INVALID_NIGHT_NOTE", "Mafia는 한 명의 이름을 제출해야 합니다.");
      }
      const target = originalPlayer(state, action.note.targetId);
      return target?.alive
        ? ok()
        : fail("INVALID_TARGET", "Mafia Night 표적은 생존자여야 합니다.");
    }
  }
}

export function guiltyVoteRequired(state: OriginalGameState): number {
  if (!state.accusation) return 0;
  const eligible = livingOriginalPlayers(state).filter(
    (player) => player.id !== state.accusation!.accusedId,
  ).length;
  return strictMajority(eligible);
}

export function nightProposalRequired(state: OriginalGameState): number {
  return strictMajority(livingOriginalPlayers(state).length);
}
