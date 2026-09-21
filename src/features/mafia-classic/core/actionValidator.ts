import {
  findPlayer,
  livingPlayers,
} from "./gameState.js";
import type {
  ActionErrorCode,
  GameAction,
  GameState,
  ValidationResult,
} from "./types.js";

function ok(): ValidationResult {
  return { ok: true, code: null, message: null };
}

function fail(code: ActionErrorCode, message: string): ValidationResult {
  return { ok: false, code, message };
}

function phaseIs(state: GameState, ...phases: GameState["phase"][]): boolean {
  return phases.includes(state.phase);
}

function requiresAlive(action: GameAction): boolean {
  return (
    action.type === "SELECT_NIGHT_TARGET" ||
    action.type === "CONFIRM_NIGHT_ACTION" ||
    action.type === "NOMINATE_PLAYER" ||
    action.type === "SELECT_VOTE" ||
    action.type === "CONFIRM_VOTE"
  );
}

export function validateAction(state: GameState, action: GameAction): ValidationResult {
  if (state.phase === "GAME_OVER") {
    return fail("GAME_OVER", "Game Over 이후에는 어떤 게임 Action도 실행할 수 없습니다.");
  }

  const player = findPlayer(state, action.playerId);
  if (!player) return fail("UNKNOWN_PLAYER", "존재하지 않는 플레이어입니다.");
  if (!player.connected) {
    return fail("PLAYER_DISCONNECTED", "연결되지 않은 플레이어는 Action을 보낼 수 없습니다.");
  }
  if (requiresAlive(action) && !player.alive) {
    return fail("ILLEGAL_ACTION_DEAD_PLAYER", "사망자는 이 Action을 실행할 수 없습니다.");
  }

  switch (action.type) {
    case "SET_READY":
      if (!phaseIs(state, "LOBBY")) return fail("ILLEGAL_PHASE", "LOBBY에서만 READY를 변경할 수 있습니다.");
      return ok();

    case "START_GAME": {
      if (!phaseIs(state, "LOBBY")) return fail("ILLEGAL_PHASE", "LOBBY에서만 게임을 시작할 수 있습니다.");
      if (action.playerId !== state.hostId) return fail("HOST_ONLY", "호스트만 게임을 시작할 수 있습니다.");
      if (state.players.length !== 8) {
        return fail(
          "UNSUPPORTED_PLAYER_COUNT",
          "M1 v1 역할 배정은 기준 규칙이 완전히 정의된 8인 구성만 지원합니다.",
        );
      }
      const allReady = state.players.every((candidate) => candidate.connected && candidate.ready);
      return allReady
        ? ok()
        : fail("START_CONDITIONS_NOT_MET", "모든 플레이어가 연결되고 READY여야 합니다.");
    }

    case "CONFIRM_ROLE":
      if (!phaseIs(state, "ROLE_REVEAL")) return fail("ILLEGAL_PHASE", "ROLE_REVEAL에서만 역할 확인이 가능합니다.");
      if (player.roleConfirmed) return fail("ROLE_ALREADY_CONFIRMED", "이미 역할 확인을 완료했습니다.");
      return ok();

    case "SELECT_NIGHT_TARGET": {
      if (!phaseIs(state, "NIGHT_ACTION")) return fail("ILLEGAL_PHASE", "NIGHT_ACTION에서만 야간 대상을 선택할 수 있습니다.");
      if (player.role !== "MAFIA" && player.role !== "DOCTOR" && player.role !== "DETECTIVE") {
        return fail("ILLEGAL_ROLE_ACTION", "이 역할은 야간 대상을 선택할 수 없습니다.");
      }

      const target = findPlayer(state, action.targetId);
      if (!target?.alive) return fail("INVALID_TARGET", "야간 대상은 살아 있는 플레이어여야 합니다.");

      if (player.role === "MAFIA") {
        const current = state.nightActions.mafiaVotes[player.id];
        if (current?.confirmed) {
          return fail("ACTION_ALREADY_CONFIRMED", "확정한 Mafia 행동은 변경할 수 없습니다.");
        }
        if (target.alignment === "MAFIA") {
          return fail("INVALID_TARGET", "Mafia는 자신이나 다른 Mafia를 공격할 수 없습니다.");
        }
        return ok();
      }

      if (player.role === "DOCTOR") {
        if (state.nightActions.doctor.confirmed) {
          return fail("ACTION_ALREADY_CONFIRMED", "확정한 Doctor 행동은 변경할 수 없습니다.");
        }
        if (state.doctorLastProtectedTargetId === target.id) {
          return fail("INVALID_TARGET", "Doctor는 같은 플레이어를 2일 연속 보호할 수 없습니다.");
        }
        return ok();
      }

      if (state.nightActions.detective.confirmed) {
        return fail("ACTION_ALREADY_CONFIRMED", "확정한 Detective 행동은 변경할 수 없습니다.");
      }
      if (target.id === player.id) {
        return fail("INVALID_TARGET", "Detective는 자신을 조사할 수 없습니다.");
      }
      return ok();
    }

    case "CONFIRM_NIGHT_ACTION":
      if (!phaseIs(state, "NIGHT_ACTION")) return fail("ILLEGAL_PHASE", "NIGHT_ACTION에서만 야간 행동을 확정할 수 있습니다.");
      if (player.role === "MAFIA") {
        const choice = state.nightActions.mafiaVotes[player.id];
        if (choice?.confirmed) return fail("ACTION_ALREADY_CONFIRMED", "이미 야간 행동을 확정했습니다.");
        return choice?.targetId
          ? ok()
          : fail("ACTION_NOT_SELECTED", "먼저 공격 대상을 선택해야 합니다.");
      }
      if (player.role === "DOCTOR") {
        if (state.nightActions.doctor.confirmed) return fail("ACTION_ALREADY_CONFIRMED", "이미 야간 행동을 확정했습니다.");
        return state.nightActions.doctor.targetId
          ? ok()
          : fail("ACTION_NOT_SELECTED", "먼저 보호 대상을 선택해야 합니다.");
      }
      if (player.role === "DETECTIVE") {
        if (state.nightActions.detective.confirmed) return fail("ACTION_ALREADY_CONFIRMED", "이미 야간 행동을 확정했습니다.");
        return state.nightActions.detective.targetId
          ? ok()
          : fail("ACTION_NOT_SELECTED", "먼저 조사 대상을 선택해야 합니다.");
      }
      return fail("ILLEGAL_ROLE_ACTION", "Citizen은 확정할 야간 능력이 없습니다.");

    case "CONFIRM_RESULT":
      if (!phaseIs(state, "DAWN", "VOTE_RESULT", "EXECUTION")) {
        return fail("ILLEGAL_PHASE", "현재는 확인할 결과가 없습니다.");
      }
      if (state.phaseConfirmations.includes(player.id)) {
        return fail("RESULT_ALREADY_CONFIRMED", "이미 이 결과를 확인했습니다.");
      }
      return ok();

    case "END_DISCUSSION":
      if (!phaseIs(state, "DAY_DISCUSSION")) return fail("ILLEGAL_PHASE", "DAY_DISCUSSION에서만 토론을 종료할 수 있습니다.");
      return action.playerId === state.hostId ? ok() : fail("HOST_ONLY", "호스트만 토론을 종료할 수 있습니다.");

    case "NOMINATE_PLAYER": {
      if (!phaseIs(state, "NOMINATION")) return fail("ILLEGAL_PHASE", "NOMINATION에서만 후보를 지목할 수 있습니다.");
      const target = findPlayer(state, action.targetId);
      return target?.alive ? ok() : fail("INVALID_TARGET", "지목 대상은 생존자여야 합니다.");
    }

    case "END_NOMINATION":
      if (!phaseIs(state, "NOMINATION")) return fail("ILLEGAL_PHASE", "NOMINATION에서만 지목을 종료할 수 있습니다.");
      return action.playerId === state.hostId ? ok() : fail("HOST_ONLY", "호스트만 지목 단계를 종료할 수 있습니다.");

    case "SELECT_VOTE": {
      if (!phaseIs(state, "DAY_VOTE")) return fail("ILLEGAL_PHASE", "DAY_VOTE에서만 투표 대상을 선택할 수 있습니다.");
      const current = state.votes[player.id];
      if (current?.confirmed) return fail("ACTION_ALREADY_CONFIRMED", "확정한 투표는 변경할 수 없습니다.");
      if (action.targetId === null) return ok();

      const nomineeIds = new Set(Object.values(state.nominations));
      if (!nomineeIds.has(action.targetId)) {
        return fail("INVALID_VOTE_TARGET", "지목된 후보 또는 처형하지 않음을 선택해야 합니다.");
      }
      const target = findPlayer(state, action.targetId);
      return target?.alive ? ok() : fail("INVALID_VOTE_TARGET", "사망한 후보에게 투표할 수 없습니다.");
    }

    case "CONFIRM_VOTE":
      if (!phaseIs(state, "DAY_VOTE")) return fail("ILLEGAL_PHASE", "DAY_VOTE에서만 투표를 확정할 수 있습니다.");
      if (state.votes[player.id]?.confirmed) return fail("ACTION_ALREADY_CONFIRMED", "이미 투표를 확정했습니다.");
      return Object.prototype.hasOwnProperty.call(state.votes, player.id)
        ? ok()
        : fail("ACTION_NOT_SELECTED", "먼저 투표 대상을 선택해야 합니다.");
  }
}

export function allConnectedConfirmed(state: GameState): boolean {
  const requiredIds = state.players
    .filter((player) => player.connected && player.alive)
    .map((player) => player.id);
  return requiredIds.every((id) => state.phaseConfirmations.includes(id));
}

export function allNightActionsConfirmed(state: GameState): boolean {
  const living = livingPlayers(state);
  for (const player of living) {
    if (player.role === "MAFIA" && !state.nightActions.mafiaVotes[player.id]?.confirmed) return false;
    if (player.role === "DOCTOR" && !state.nightActions.doctor.confirmed) return false;
    if (player.role === "DETECTIVE" && !state.nightActions.detective.confirmed) return false;
  }
  return true;
}

export function allVotesConfirmed(state: GameState): boolean {
  return livingPlayers(state).every((player) => state.votes[player.id]?.confirmed === true);
}
