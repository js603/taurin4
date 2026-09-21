import type { PlayerView } from "../core/playerView.js";
import type { GameAction, GamePhase, Role } from "../core/types.js";

export type ScreenId =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "NIGHT_CITIZEN_WAIT"
  | "NIGHT_DOCTOR"
  | "NIGHT_DETECTIVE"
  | "NIGHT_MAFIA"
  | "DAWN"
  | "DAY_DISCUSSION"
  | "NOMINATION"
  | "DAY_VOTE"
  | "VOTE_RESULT"
  | "EXECUTION"
  | "DEAD_PLAYER"
  | "GAME_OVER"
  | "ENGINE_TRANSITION";

export type ScreenMode = "ACTION" | "WAITING" | "RESULT" | "TERMINAL" | "ENGINE";

export type WaitingKind =
  | "NONE"
  | "OTHER_PLAYERS"
  | "HOST"
  | "ENGINE"
  | "SPECTATING"
  | "GAME_OVER";

export type TargetPolicy =
  | "NONE"
  | "ALIVE_PLAYER"
  | "ALIVE_NON_MAFIA"
  | "ALIVE_EXCEPT_SELF"
  | "DOCTOR_LEGAL_TARGET"
  | "NOMINEE_OR_NO_EXECUTION";

export type PlayerViewField =
  | "phase"
  | "day"
  | "night"
  | "winner"
  | "self"
  | "players"
  | "mafiaMembers"
  | "detectiveHistory"
  | "doctorLastProtectedTargetId"
  | "ownNightTargetId"
  | "mafiaNightProgress"
  | "nominations"
  | "ownNominationTargetId"
  | "ownVoteTargetId"
  | "voteProgress"
  | "voteResult"
  | "publicEvents"
  | "availableActions";

export interface ScreenWaitingContract {
  readonly active: boolean;
  readonly kind: WaitingKind;
  readonly reason: string;
}

export interface ScreenContract {
  readonly id: ScreenId;
  readonly phase: GamePhase;
  readonly mode: ScreenMode;
  readonly situation: string;
  readonly objective: string;
  readonly visibleFields: readonly PlayerViewField[];
  readonly primaryActions: readonly GameAction["type"][];
  readonly secondaryActions: readonly GameAction["type"][];
  readonly forbiddenActions: readonly GameAction["type"][];
  readonly targetPolicy: TargetPolicy;
  readonly waiting: ScreenWaitingContract;
  readonly exitCondition: string;
}

const ALL_ACTIONS: readonly GameAction["type"][] = [
  "SET_READY",
  "START_GAME",
  "CONFIRM_ROLE",
  "SELECT_NIGHT_TARGET",
  "CONFIRM_NIGHT_ACTION",
  "CONFIRM_RESULT",
  "END_DISCUSSION",
  "NOMINATE_PLAYER",
  "END_NOMINATION",
  "SELECT_VOTE",
  "CONFIRM_VOTE",
] as const;

interface ScreenDraft {
  readonly id: ScreenId;
  readonly mode: ScreenMode;
  readonly situation: string;
  readonly objective: string;
  readonly visibleFields: readonly PlayerViewField[];
  readonly supportedActions: readonly GameAction["type"][];
  readonly primaryOrder?: readonly GameAction["type"][];
  readonly secondaryOrder?: readonly GameAction["type"][];
  readonly targetPolicy: TargetPolicy;
  readonly waitingKindWhenIdle: WaitingKind;
  readonly waitingReasonWhenIdle: string;
  readonly exitCondition: string;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function sameMembers<T extends string>(a: readonly T[], b: readonly T[]): boolean {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function finalize(view: PlayerView, draft: ScreenDraft): ScreenContract {
  const unexpected = view.availableActions.filter(
    (action) => !draft.supportedActions.includes(action),
  );
  if (unexpected.length > 0) {
    throw new Error(
      "SCREEN_CONTRACT_UNEXPECTED_ACTION: " +
        draft.id +
        " received " +
        unexpected.join(", "),
    );
  }

  const allowed = unique(view.availableActions);
  const primary = (draft.primaryOrder ?? []).filter((action) => allowed.includes(action));
  const secondary = (draft.secondaryOrder ?? []).filter((action) => allowed.includes(action));
  const classified = unique([...primary, ...secondary]);

  if (!sameMembers(allowed, classified)) {
    const unclassified = allowed.filter((action) => !classified.includes(action));
    if (unclassified.length > 0) {
      throw new Error(
        "SCREEN_CONTRACT_UNCLASSIFIED_ACTION: " +
          draft.id +
          " missing " +
          unclassified.join(", "),
      );
    }
  }

  const forbidden = ALL_ACTIONS.filter((action) => !allowed.includes(action));
  const idle = allowed.length === 0;

  return {
    id: draft.id,
    phase: view.phase,
    mode: idle && draft.mode === "ACTION" ? "WAITING" : draft.mode,
    situation: draft.situation,
    objective: draft.objective,
    visibleFields: unique([
      "phase",
      "day",
      "night",
      "self",
      "players",
      "availableActions",
      ...draft.visibleFields,
    ]),
    primaryActions: primary,
    secondaryActions: secondary,
    forbiddenActions: forbidden,
    targetPolicy: idle ? "NONE" : draft.targetPolicy,
    waiting: {
      active: idle,
      kind: idle ? draft.waitingKindWhenIdle : "NONE",
      reason: idle ? draft.waitingReasonWhenIdle : "",
    },
    exitCondition: draft.exitCondition,
  };
}

function deadPlayerContract(view: PlayerView): ScreenContract {
  return finalize(view, {
    id: "DEAD_PLAYER",
    mode: "WAITING",
    situation: "사망자는 현재 게임을 관전합니다.",
    objective: "공개 정보만 확인하고 게임 종료를 기다립니다.",
    visibleFields: ["publicEvents", "nominations", "voteProgress", "voteResult"],
    supportedActions: [],
    primaryOrder: [],
    secondaryOrder: [],
    targetPolicy: "NONE",
    waitingKindWhenIdle: "SPECTATING",
    waitingReasonWhenIdle: "사망자는 생존자에게 영향을 주는 Action을 실행하지 않습니다.",
    exitCondition: "GAME_OVER에 도달하면 최종 결과 화면으로 이동합니다.",
  });
}

function nightContract(view: PlayerView, role: Role | null): ScreenContract {
  if (role === "CITIZEN" || role === null) {
    return finalize(view, {
      id: "NIGHT_CITIZEN_WAIT",
      mode: "WAITING",
      situation: "밤이 진행 중입니다.",
      objective: "Citizen은 수행할 야간 능력이 없습니다.",
      visibleFields: [],
      supportedActions: [],
      primaryOrder: [],
      secondaryOrder: [],
      targetPolicy: "NONE",
      waitingKindWhenIdle: "OTHER_PLAYERS",
      waitingReasonWhenIdle: "야간 능력을 가진 플레이어의 확정을 기다립니다.",
      exitCondition: "모든 필수 야간 Action이 확정되고 Night Resolver가 종료됩니다.",
    });
  }

  if (role === "DOCTOR") {
    return finalize(view, {
      id: "NIGHT_DOCTOR",
      mode: "ACTION",
      situation: "Doctor의 야간 행동 단계입니다.",
      objective: "이번 밤 보호할 생존자 한 명을 선택하고 확정합니다.",
      visibleFields: ["doctorLastProtectedTargetId", "ownNightTargetId"],
      supportedActions: ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"],
      primaryOrder: ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"],
      secondaryOrder: [],
      targetPolicy: "DOCTOR_LEGAL_TARGET",
      waitingKindWhenIdle: "OTHER_PLAYERS",
      waitingReasonWhenIdle: "보호 행동이 확정되었습니다. 다른 야간 Action을 기다립니다.",
      exitCondition: "Doctor Action이 확정되고 모든 필수 야간 Action이 완료됩니다.",
    });
  }

  if (role === "DETECTIVE") {
    return finalize(view, {
      id: "NIGHT_DETECTIVE",
      mode: "ACTION",
      situation: "Detective의 야간 행동 단계입니다.",
      objective: "자신을 제외한 생존자 한 명을 조사 대상으로 선택하고 확정합니다.",
      visibleFields: ["detectiveHistory", "ownNightTargetId"],
      supportedActions: ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"],
      primaryOrder: ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"],
      secondaryOrder: [],
      targetPolicy: "ALIVE_EXCEPT_SELF",
      waitingKindWhenIdle: "OTHER_PLAYERS",
      waitingReasonWhenIdle: "조사 행동이 확정되었습니다. 다른 야간 Action을 기다립니다.",
      exitCondition: "Detective Action이 확정되고 모든 필수 야간 Action이 완료됩니다.",
    });
  }

  return finalize(view, {
    id: "NIGHT_MAFIA",
    mode: "ACTION",
    situation: "Mafia의 야간 공격 선택 단계입니다.",
    objective: "생존한 비-Mafia 한 명을 공격 대상으로 선택하고 확정합니다.",
    visibleFields: ["mafiaMembers", "ownNightTargetId", "mafiaNightProgress"],
    supportedActions: ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"],
    primaryOrder: ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"],
    secondaryOrder: [],
    targetPolicy: "ALIVE_NON_MAFIA",
    waitingKindWhenIdle: "OTHER_PLAYERS",
    waitingReasonWhenIdle: "공격 선택이 확정되었습니다. 다른 Mafia 또는 야간 역할을 기다립니다.",
    exitCondition: "모든 필수 야간 Action이 확정되어 Night Resolver가 실행됩니다.",
  });
}

export function buildScreenContract(view: PlayerView): ScreenContract {
  if (view.phase === "GAME_OVER") {
    return finalize(view, {
      id: "GAME_OVER",
      mode: "TERMINAL",
      situation: "게임이 종료되었습니다.",
      objective: "승자와 공개된 모든 역할을 확인합니다.",
      visibleFields: ["winner", "publicEvents"],
      supportedActions: [],
      primaryOrder: [],
      secondaryOrder: [],
      targetPolicy: "NONE",
      waitingKindWhenIdle: "GAME_OVER",
      waitingReasonWhenIdle: "이 게임에서는 더 이상 GameAction을 보낼 수 없습니다.",
      exitCondition: "현재 게임 세션의 종착 상태입니다.",
    });
  }

  if (!view.self.alive) {
    return deadPlayerContract(view);
  }

  switch (view.phase) {
    case "LOBBY":
      return finalize(view, {
        id: "LOBBY",
        mode: "ACTION",
        situation: "게임 시작 전 로비입니다.",
        objective: "READY 상태를 준비하고 호스트가 시작 조건을 만족하면 게임을 시작합니다.",
        visibleFields: [],
        supportedActions: ["SET_READY", "START_GAME"],
        primaryOrder: ["SET_READY", "START_GAME"],
        secondaryOrder: [],
        targetPolicy: "NONE",
        waitingKindWhenIdle: "HOST",
        waitingReasonWhenIdle: "다른 플레이어 또는 호스트의 시작을 기다립니다.",
        exitCondition: "호스트의 START_GAME이 검증되면 ROLE_ASSIGNMENT로 이동합니다.",
      });

    case "ROLE_REVEAL":
      return finalize(view, {
        id: "ROLE_REVEAL",
        mode: "ACTION",
        situation: "자신의 비밀 역할을 확인하는 단계입니다.",
        objective: "자기 역할만 확인한 뒤 역할 확인을 확정합니다.",
        visibleFields: [],
        supportedActions: ["CONFIRM_ROLE"],
        primaryOrder: ["CONFIRM_ROLE"],
        secondaryOrder: [],
        targetPolicy: "NONE",
        waitingKindWhenIdle: "OTHER_PLAYERS",
        waitingReasonWhenIdle: "역할 확인을 완료했습니다. 다른 플레이어를 기다립니다.",
        exitCondition: "모든 플레이어가 역할 확인을 완료하면 NIGHT 1로 이동합니다.",
      });

    case "NIGHT_ACTION":
      return nightContract(view, view.self.role);

    case "DAWN":
      return finalize(view, {
        id: "DAWN",
        mode: "RESULT",
        situation: "밤 결과가 공개되는 새벽입니다.",
        objective: "공개된 사망/무사망 결과와 공개 역할을 확인합니다.",
        visibleFields: ["publicEvents"],
        supportedActions: ["CONFIRM_RESULT"],
        primaryOrder: ["CONFIRM_RESULT"],
        secondaryOrder: [],
        targetPolicy: "NONE",
        waitingKindWhenIdle: "OTHER_PLAYERS",
        waitingReasonWhenIdle: "결과 확인을 완료했습니다. 다른 생존자를 기다립니다.",
        exitCondition: "모든 생존자가 결과를 확인하면 DAY_DISCUSSION으로 이동합니다.",
      });

    case "DAY_DISCUSSION":
      return finalize(view, {
        id: "DAY_DISCUSSION",
        mode: "ACTION",
        situation: "낮 토론 단계입니다.",
        objective: "공개 정보와 대화를 바탕으로 추리합니다. 호스트는 토론을 종료할 수 있습니다.",
        visibleFields: ["publicEvents"],
        supportedActions: ["END_DISCUSSION"],
        primaryOrder: [],
        secondaryOrder: ["END_DISCUSSION"],
        targetPolicy: "NONE",
        waitingKindWhenIdle: "HOST",
        waitingReasonWhenIdle: "호스트가 토론 종료를 선언할 때까지 토론을 계속합니다.",
        exitCondition: "호스트가 END_DISCUSSION을 보내면 NOMINATION으로 이동합니다.",
      });

    case "NOMINATION":
      return finalize(view, {
        id: "NOMINATION",
        mode: "ACTION",
        situation: "처형 후보 지목 단계입니다.",
        objective: "생존자 한 명을 후보로 지목할 수 있으며 호스트가 지목 단계를 종료합니다.",
        visibleFields: ["nominations", "ownNominationTargetId", "publicEvents"],
        supportedActions: ["NOMINATE_PLAYER", "END_NOMINATION"],
        primaryOrder: ["NOMINATE_PLAYER"],
        secondaryOrder: ["END_NOMINATION"],
        targetPolicy: "ALIVE_PLAYER",
        waitingKindWhenIdle: "HOST",
        waitingReasonWhenIdle: "지목할 권한이 없거나 호스트의 종료를 기다리고 있습니다.",
        exitCondition: "후보가 있으면 DAY_VOTE, 후보가 없으면 WIN_CHECK 후 다음 NIGHT로 이동합니다.",
      });

    case "DAY_VOTE":
      return finalize(view, {
        id: "DAY_VOTE",
        mode: "ACTION",
        situation: "낮 처형 투표 단계입니다.",
        objective: "지목된 후보 또는 처형하지 않음을 선택하고 최종 확정합니다.",
        visibleFields: [
          "nominations",
          "ownVoteTargetId",
          "voteProgress",
          "publicEvents",
        ],
        supportedActions: ["SELECT_VOTE", "CONFIRM_VOTE"],
        primaryOrder: ["SELECT_VOTE", "CONFIRM_VOTE"],
        secondaryOrder: [],
        targetPolicy: "NOMINEE_OR_NO_EXECUTION",
        waitingKindWhenIdle: "OTHER_PLAYERS",
        waitingReasonWhenIdle: "투표를 확정했습니다. 다른 생존자의 확정을 기다립니다.",
        exitCondition: "모든 생존자가 투표를 확정하면 VOTE_RESULT로 이동합니다.",
      });

    case "VOTE_RESULT":
      return finalize(view, {
        id: "VOTE_RESULT",
        mode: "RESULT",
        situation: "낮 투표 결과가 공개되었습니다.",
        objective: "최종 집계와 처형 대상 유무를 확인합니다.",
        visibleFields: ["nominations", "voteResult", "publicEvents"],
        supportedActions: ["CONFIRM_RESULT"],
        primaryOrder: ["CONFIRM_RESULT"],
        secondaryOrder: [],
        targetPolicy: "NONE",
        waitingKindWhenIdle: "OTHER_PLAYERS",
        waitingReasonWhenIdle: "결과 확인을 완료했습니다. 다른 생존자를 기다립니다.",
        exitCondition: "처형 대상이 있으면 EXECUTION, 없으면 WIN_CHECK 후 다음 NIGHT로 이동합니다.",
      });

    case "EXECUTION":
      return finalize(view, {
        id: "EXECUTION",
        mode: "RESULT",
        situation: "투표로 선택된 플레이어의 처형 결과 단계입니다.",
        objective: "사망자와 공개된 역할을 확인합니다.",
        visibleFields: ["voteResult", "publicEvents"],
        supportedActions: ["CONFIRM_RESULT"],
        primaryOrder: ["CONFIRM_RESULT"],
        secondaryOrder: [],
        targetPolicy: "NONE",
        waitingKindWhenIdle: "OTHER_PLAYERS",
        waitingReasonWhenIdle: "처형 결과 확인을 완료했습니다. 다른 생존자를 기다립니다.",
        exitCondition: "모든 생존자가 확인하면 WIN_CHECK 후 다음 NIGHT 또는 GAME_OVER로 이동합니다.",
      });

    case "ROLE_ASSIGNMENT":
    case "NIGHT_START":
    case "NIGHT_RESOLVE":
    case "WIN_CHECK":
      return finalize(view, {
        id: "ENGINE_TRANSITION",
        mode: "ENGINE",
        situation: "엔진이 자동 전이를 처리 중입니다.",
        objective: "사용자 입력 없이 다음 안정 Phase로 전이합니다.",
        visibleFields: [],
        supportedActions: [],
        primaryOrder: [],
        secondaryOrder: [],
        targetPolicy: "NONE",
        waitingKindWhenIdle: "ENGINE",
        waitingReasonWhenIdle: "GameEngine의 자동 Resolver가 완료되기를 기다립니다.",
        exitCondition: "자동 Resolver가 다음 사용자 Phase 또는 GAME_OVER를 결정합니다.",
      });
  }
}

export function assertScreenContract(view: PlayerView, contract: ScreenContract): void {
  if (contract.phase !== view.phase) {
    throw new Error("SCREEN_CONTRACT_PHASE_MISMATCH");
  }

  const allowed = unique([...contract.primaryActions, ...contract.secondaryActions]);
  if (!sameMembers(allowed, view.availableActions)) {
    throw new Error(
      "SCREEN_CONTRACT_ACTION_MISMATCH: " +
        contract.id +
        " expected " +
        view.availableActions.join(",") +
        " got " +
        allowed.join(","),
    );
  }

  const overlap = allowed.filter((action) => contract.forbiddenActions.includes(action));
  if (overlap.length > 0) {
    throw new Error("SCREEN_CONTRACT_ALLOWED_FORBIDDEN_OVERLAP: " + overlap.join(","));
  }

  if (unique(contract.visibleFields).length !== contract.visibleFields.length) {
    throw new Error("SCREEN_CONTRACT_DUPLICATE_VISIBLE_FIELD");
  }

  if (contract.waiting.active && allowed.length > 0) {
    throw new Error("SCREEN_CONTRACT_WAITING_WITH_ACTIONS");
  }

  if (!contract.waiting.active && allowed.length === 0 && contract.mode === "ACTION") {
    throw new Error("SCREEN_CONTRACT_ACTION_MODE_WITHOUT_ACTION");
  }

  if (
    contract.id === "ENGINE_TRANSITION" &&
    (contract.primaryActions.length > 0 || contract.secondaryActions.length > 0)
  ) {
    throw new Error("SCREEN_CONTRACT_ENGINE_ACTION");
  }

  if (contract.id === "DEAD_PLAYER" && allowed.length > 0) {
    throw new Error("SCREEN_CONTRACT_DEAD_PLAYER_ACTION");
  }
}
