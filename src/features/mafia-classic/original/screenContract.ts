import type { OriginalPlayerView } from "./playerView.js";
import type {
  ChatChannel,
  OriginalAction,
  OriginalPhase,
} from "./types.js";

export type OriginalScreenId =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "SUNRISE"
  | "DAY_CHAT"
  | "ACCUSATION_CHAT"
  | "GUILTY_VOTE"
  | "NIGHT_PROPOSAL_VOTE"
  | "NIGHT_NOTES"
  | "DEAD_CHAT"
  | "GAME_OVER"
  | "ENGINE_TRANSITION";

export interface OriginalScreenContract {
  readonly id: OriginalScreenId;
  readonly phase: OriginalPhase;
  readonly mainSurface: "CHAT" | "ROLE" | "VOTE" | "NOTE" | "RESULT" | "LOBBY";
  readonly chatVisible: boolean;
  readonly writableChannels: readonly Exclude<ChatChannel, "SYSTEM">[];
  readonly primaryActions: readonly OriginalAction["type"][];
  readonly objective: string;
  readonly waiting: boolean;
}

export function buildOriginalScreenContract(
  view: OriginalPlayerView,
): OriginalScreenContract {
  if (view.phase === "GAME_OVER") {
    return {
      id: "GAME_OVER",
      phase: view.phase,
      mainSurface: "RESULT",
      chatVisible: true,
      writableChannels: [],
      primaryActions: [],
      objective: "승자와 모든 역할, 전체 대화 기록을 확인합니다.",
      waiting: true,
    };
  }

  if (!view.self.alive && view.phase !== "LOBBY" && view.phase !== "ROLE_REVEAL" && view.phase !== "SUNRISE") {
    return {
      id: "DEAD_CHAT",
      phase: view.phase,
      mainSurface: "CHAT",
      chatVisible: true,
      writableChannels: view.writableChatChannels,
      primaryActions: view.availableActions,
      objective: "공개 대화를 읽고 사망자 채팅에서만 대화합니다.",
      waiting: view.availableActions.length === 0,
    };
  }

  switch (view.phase) {
    case "LOBBY":
      return {
        id: "LOBBY",
        phase: view.phase,
        mainSurface: "LOBBY",
        chatVisible: false,
        writableChannels: [],
        primaryActions: view.availableActions,
        objective: "모든 플레이어가 READY한 뒤 게임을 시작합니다.",
        waiting: false,
      };
    case "ROLE_REVEAL":
      return {
        id: "ROLE_REVEAL",
        phase: view.phase,
        mainSurface: "ROLE",
        chatVisible: false,
        writableChannels: [],
        primaryActions: view.availableActions,
        objective: "자신의 카드만 확인합니다.",
        waiting: view.availableActions.length === 0,
      };
    case "SUNRISE":
      return {
        id: "SUNRISE",
        phase: view.phase,
        mainSurface: "ROLE",
        chatVisible: false,
        writableChannels: [],
        primaryActions: view.availableActions,
        objective:
          view.self.role === "MAFIA"
            ? "Mafia 동료를 확인하고 기억합니다."
            : "Honest는 추가 정보를 받지 않습니다.",
        waiting: view.availableActions.length === 0,
      };
    case "DAY_DISCUSSION":
      return {
        id: "DAY_CHAT",
        phase: view.phase,
        mainSurface: "CHAT",
        chatVisible: true,
        writableChannels: view.writableChatChannels,
        primaryActions: view.availableActions,
        objective: "채팅으로 의심과 근거를 주고받고, 고발하거나 Mafia Night를 제안합니다.",
        waiting: false,
      };
    case "ACCUSATION":
      return {
        id: "ACCUSATION_CHAT",
        phase: view.phase,
        mainSurface: "CHAT",
        chatVisible: true,
        writableChannels: view.writableChatChannels,
        primaryActions: view.availableActions,
        objective: "고발 근거와 반론을 채팅으로 이어가고, 고발자는 유죄 표결을 요청할 수 있습니다.",
        waiting: view.availableActions.length === 0 && view.writableChatChannels.length === 0,
      };
    case "GUILTY_VOTE":
      return {
        id: "GUILTY_VOTE",
        phase: view.phase,
        mainSurface: "VOTE",
        chatVisible: true,
        writableChannels: [],
        primaryActions: view.availableActions,
        objective: "피고를 제외한 생존자는 GUILTY 또는 NOT GUILTY를 선택합니다.",
        waiting: view.availableActions.length === 0,
      };
    case "NIGHT_PROPOSAL_VOTE":
      return {
        id: "NIGHT_PROPOSAL_VOTE",
        phase: view.phase,
        mainSurface: "VOTE",
        chatVisible: true,
        writableChannels: [],
        primaryActions: view.availableActions,
        objective: "생존자 과반으로 Mafia Night 진행 여부를 결정합니다.",
        waiting: view.availableActions.length === 0,
      };
    case "MAFIA_NIGHT":
      return {
        id: "NIGHT_NOTES",
        phase: view.phase,
        mainSurface: "NOTE",
        chatVisible: true,
        writableChannels: [],
        primaryActions: view.availableActions,
        objective:
          view.self.role === "MAFIA"
            ? "살아 있는 한 사람의 이름을 비밀 쪽지로 제출합니다."
            : "HONEST 쪽지를 비밀 제출합니다.",
        waiting: view.availableActions.length === 0,
      };
    case "NIGHT_RESOLVE":
      return {
        id: "ENGINE_TRANSITION",
        phase: view.phase,
        mainSurface: "RESULT",
        chatVisible: true,
        writableChannels: [],
        primaryActions: [],
        objective: "Night 쪽지를 집계하고 결과를 판정합니다.",
        waiting: true,
      };
  }
}
