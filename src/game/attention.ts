import type { GameCommand, GameState } from "./model";

export interface AttentionChoice {
  label: string;
  command: GameCommand;
  emphasis?: "normal" | "primary" | "danger";
}

export interface AttentionCard {
  level: "floating" | "focus" | "critical";
  eyebrow: string;
  title: string;
  body: string;
  countdownMs?: number;
  choices: readonly AttentionChoice[];
}

export function getAttentionCard(state: GameState): AttentionCard | null {
  if (state.phase === "encounter") {
    return {
      level: "focus",
      eyebrow: "TRAVEL INTERRUPTED",
      title: "이상한 기척",
      body: "낮은 숨소리. 수풀 너머에서 무언가 당신을 따라오고 있다.",
      choices: [
        {
          label: "살펴본다",
          command: { type: "INVESTIGATE_ENCOUNTER" },
          emphasis: "primary",
        },
        {
          label: "무시하고 이동한다",
          command: { type: "IGNORE_ENCOUNTER" },
        },
      ],
    };
  }

  if (state.phase === "reward" && state.reward) {
    return {
      level: "focus",
      eyebrow: "REWARD",
      title: state.reward.title,
      body: state.reward.items.join("  ·  "),
      choices: [
        {
          label: "전리품 획득",
          command: { type: "COLLECT_REWARD" },
          emphasis: "primary",
        },
      ],
    };
  }

  if (state.phase !== "combat" || !state.combat) return null;

  const combat = state.combat;
  const hpText =
    combat.enemy.hp + " / " + combat.enemy.maxHp + " HP · 거리 " +
    combat.enemy.distanceMeters +
    "m";

  if (combat.telegraphRemainingMs !== null) {
    return {
      level: "critical",
      eyebrow: "CRITICAL",
      title: "늑대가 몸을 낮춘다",
      body: "돌진 직전이다. 공격을 멈추고 즉시 반응해야 한다.",
      countdownMs: combat.telegraphRemainingMs,
      choices: [
        {
          label: "회피",
          command: { type: "DODGE" },
          emphasis: "primary",
        },
        {
          label: "가드",
          command: { type: "GUARD" },
        },
      ],
    };
  }

  if (combat.vulnerable) {
    return {
      level: "critical",
      eyebrow: "PERFECT EVADE",
      title: "빈틈이 열렸다",
      body: "늑대가 균형을 잃었다. 지금 반격하면 큰 피해를 줄 수 있다.",
      choices: [
        {
          label: "반격",
          command: { type: "COUNTER" },
          emphasis: "primary",
        },
      ],
    };
  }

  const outcome =
    combat.lastOutcome === "hit"
      ? "돌진에 맞았다. 다시 자세를 잡아야 한다."
      : combat.lastOutcome === "guard"
        ? "충격을 버텼다. 다시 공격 기회를 노릴 수 있다."
        : "연타할 수 있지만 공격 징후가 보이면 즉시 멈춰야 한다.";

  return {
    level: "floating",
    eyebrow: "ENCOUNTER",
    title: combat.enemy.name,
    body: hpText + "\n" + outcome,
    choices: [
      {
        label: "빠른 공격",
        command: { type: "ATTACK" },
        emphasis: "primary",
      },
      {
        label: "거리를 벌린다",
        command: { type: "RETREAT" },
      },
    ],
  };
}
