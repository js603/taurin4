import { useMemo, useState } from "react";
import {
  LocalMafiaRuntime,
  type HumanActionIntent,
  type LocalMafiaSnapshot,
} from "../application/localMafiaRuntime";
import type { PublicEvent, Role } from "../core/types";
import type { PublicPlayerView } from "../core/playerView";
import type { ScreenContract } from "../ux/screenContract";
import "./mafiaClassic.css";

const ROLE_LABEL: Record<Role, string> = {
  CITIZEN: "시민",
  DETECTIVE: "경찰",
  DOCTOR: "의사",
  MAFIA: "마피아",
};

const ROLE_COPY: Record<Role, string> = {
  CITIZEN: "밤의 능력은 없습니다. 대화와 지목, 투표만으로 마피아를 찾아내십시오.",
  DETECTIVE: "밤마다 자신을 제외한 생존자 한 명을 조사합니다. 결과는 오직 당신만 봅니다.",
  DOCTOR: "밤마다 생존자 한 명을 보호합니다. 같은 사람을 이틀 연속 보호할 수 없습니다.",
  MAFIA: "동료 마피아와 함께 밤의 표적을 정하고 낮에는 정체를 감추십시오.",
};

const SCREEN_LABEL: Record<ScreenContract["id"], string> = {
  LOBBY: "TABLE LOBBY",
  ROLE_REVEAL: "SECRET ROLE",
  NIGHT_CITIZEN_WAIT: "NIGHT",
  NIGHT_DOCTOR: "NIGHT · DOCTOR",
  NIGHT_DETECTIVE: "NIGHT · DETECTIVE",
  NIGHT_MAFIA: "NIGHT · MAFIA",
  DAWN: "DAWN",
  DAY_DISCUSSION: "DAY · DISCUSSION",
  NOMINATION: "DAY · NOMINATION",
  DAY_VOTE: "DAY · VOTE",
  VOTE_RESULT: "VOTE RESULT",
  EXECUTION: "EXECUTION",
  DEAD_PLAYER: "SPECTATOR",
  GAME_OVER: "GAME OVER",
  ENGINE_TRANSITION: "RESOLVING",
};

function playerName(snapshot: LocalMafiaSnapshot, id: string | null | undefined): string {
  if (!id) return "없음";
  return snapshot.view.players.find((player) => player.id === id)?.name ?? id;
}

function publicEventText(snapshot: LocalMafiaSnapshot, event: PublicEvent): string {
  const name = playerName(snapshot, event.playerId);
  switch (event.type) {
    case "GAME_STARTED":
      return "카드가 배분되었습니다.";
    case "ROLE_REVEALED":
      return event.role ? name + "의 역할이 " + ROLE_LABEL[event.role] + "(으)로 공개되었습니다." : name + "의 역할이 공개되었습니다.";
    case "NIGHT_STARTED":
      return "밤이 시작되었습니다.";
    case "NO_NIGHT_DEATH":
      return "밤이 끝났지만 사망자는 없습니다.";
    case "PLAYER_DIED":
      return name + "이(가) 밤에 사망했습니다.";
    case "DAY_STARTED":
      return "DAY " + event.day + "가 시작되었습니다.";
    case "NOMINATIONS_CLOSED":
      return "후보 지목이 마감되었습니다.";
    case "VOTE_COMPLETED":
      return "모든 생존자의 투표가 확정되었습니다.";
    case "PLAYER_EXECUTED":
      return name + "이(가) 투표로 처형되었습니다.";
    case "GAME_WON":
      return event.winner === "TOWN" ? "시민 진영이 승리했습니다." : "마피아 진영이 승리했습니다.";
  }
}

function legalTargets(snapshot: LocalMafiaSnapshot): PublicPlayerView[] {
  const { view, contract } = snapshot;
  const alive = view.players.filter((player) => player.alive);

  switch (contract.targetPolicy) {
    case "ALIVE_PLAYER":
      return alive;
    case "ALIVE_NON_MAFIA": {
      const mafiaIds = new Set(view.mafiaMembers?.map((member) => member.id) ?? []);
      return alive.filter((player) => !mafiaIds.has(player.id));
    }
    case "ALIVE_EXCEPT_SELF":
      return alive.filter((player) => player.id !== view.self.id);
    case "DOCTOR_LEGAL_TARGET":
      return alive.filter((player) => player.id !== view.doctorLastProtectedTargetId);
    case "NOMINEE_OR_NO_EXECUTION":
      return alive.filter((player) => view.nominations.includes(player.id));
    case "NONE":
      return [];
  }
}

function ownSelection(snapshot: LocalMafiaSnapshot): string | null {
  const { view, contract } = snapshot;
  if (contract.primaryActions.includes("SELECT_NIGHT_TARGET")) return view.ownNightTargetId;
  if (contract.primaryActions.includes("NOMINATE_PLAYER")) return view.ownNominationTargetId;
  if (contract.primaryActions.includes("SELECT_VOTE")) return view.ownVoteTargetId;
  return null;
}

function actionLabel(action: ScreenContract["primaryActions"][number], ready: boolean): string {
  switch (action) {
    case "SET_READY":
      return ready ? "준비 해제" : "READY";
    case "START_GAME":
      return "게임 시작";
    case "CONFIRM_ROLE":
      return "역할 확인 완료";
    case "CONFIRM_NIGHT_ACTION":
      return "야간 행동 확정";
    case "CONFIRM_RESULT":
      return "결과 확인";
    case "END_DISCUSSION":
      return "토론 종료";
    case "END_NOMINATION":
      return "후보 지목 마감";
    case "CONFIRM_VOTE":
      return "투표 확정";
    case "SELECT_NIGHT_TARGET":
      return "대상 선택";
    case "NOMINATE_PLAYER":
      return "후보 지목";
    case "SELECT_VOTE":
      return "투표 선택";
  }
}

function roleCardClass(role: Role | null): string {
  return role ? "m3-role-card m3-role-card--" + role.toLowerCase() : "m3-role-card";
}

function MainStage({ snapshot }: { snapshot: LocalMafiaSnapshot }) {
  const { view, contract } = snapshot;
  const selected = ownSelection(snapshot);
  const selectedName = playerName(snapshot, selected);
  const recentEvents = view.publicEvents.slice(-3);

  if (contract.id === "LOBBY") {
    return (
      <div className="m3-stage-content m3-stage-content--lobby">
        <span className="m3-stage-kicker">EIGHT SEATS · ONE TABLE</span>
        <h2>모두 준비되면 카드를 섞습니다.</h2>
        <p>8인 기본 규칙 · 마피아 2 · 경찰 1 · 의사 1 · 시민 4</p>
        <div className="m3-ready-grid">
          {view.players.map((player) => (
            <div className={"m3-ready-person " + (player.ready ? "is-ready" : "")} key={player.id}>
              <span>{player.name}</span>
              <strong>{player.ready ? "READY" : "WAIT"}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (contract.id === "ROLE_REVEAL") {
    return (
      <div className="m3-stage-content m3-stage-content--role">
        <span className="m3-stage-kicker">PRIVATE · ONLY YOU</span>
        <div className={roleCardClass(view.self.role)}>
          <small>YOUR ROLE</small>
          <strong>{view.self.role ? ROLE_LABEL[view.self.role] : "UNKNOWN"}</strong>
        </div>
        <p>{view.self.role ? ROLE_COPY[view.self.role] : ""}</p>
      </div>
    );
  }

  if (contract.id.startsWith("NIGHT_")) {
    return (
      <div className="m3-stage-content m3-stage-content--night">
        <div className="m3-moon" aria-hidden="true" />
        <span className="m3-stage-kicker">NIGHT {view.night}</span>
        <h2>{contract.objective}</h2>
        {selected ? (
          <div className="m3-selection-seal">
            <span>현재 선택</span>
            <strong>{selectedName}</strong>
          </div>
        ) : null}
        {contract.id === "NIGHT_DETECTIVE" && view.detectiveHistory?.length ? (
          <div className="m3-private-history">
            <span>내 조사 기록</span>
            {view.detectiveHistory.slice(-3).map((result) => (
              <strong key={result.night + result.targetId}>
                N{result.night} · {playerName(snapshot, result.targetId)} · {result.result}
              </strong>
            ))}
          </div>
        ) : null}
        {contract.id === "NIGHT_MAFIA" && view.mafiaMembers ? (
          <div className="m3-private-history">
            <span>MAFIA ONLY</span>
            <strong>{view.mafiaMembers.map((member) => member.name).join(" · ")}</strong>
            {view.mafiaNightProgress ? (
              <small>
                확정 {view.mafiaNightProgress.confirmed}/{view.mafiaNightProgress.total}
              </small>
            ) : null}
          </div>
        ) : null}
        {contract.waiting.active ? <WaitingBlock contract={contract} /> : null}
      </div>
    );
  }

  if (contract.id === "DAWN") {
    return (
      <div className="m3-stage-content m3-stage-content--dawn">
        <span className="m3-stage-kicker">DAWN · DAY {view.day}</span>
        <h2>밤의 결과가 공개됩니다.</h2>
        <div className="m3-event-focus">
          {recentEvents.length ? recentEvents.map((event) => (
            <p key={event.seq}>{publicEventText(snapshot, event)}</p>
          )) : <p>공개할 사건이 없습니다.</p>}
        </div>
      </div>
    );
  }

  if (contract.id === "DAY_DISCUSSION") {
    return (
      <div className="m3-stage-content m3-stage-content--day">
        <span className="m3-stage-kicker">DAY {view.day} · OPEN TABLE</span>
        <h2>말이 시작됩니다.</h2>
        <p>공개된 사망과 역할, 이전 투표 결과를 바탕으로 서로의 주장을 검증하십시오.</p>
        <div className="m3-table-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        {contract.waiting.active ? <WaitingBlock contract={contract} /> : null}
      </div>
    );
  }

  if (contract.id === "NOMINATION") {
    return (
      <div className="m3-stage-content">
        <span className="m3-stage-kicker">NOMINATION</span>
        <h2>누구를 처형 후보로 올릴 것인가.</h2>
        <p>지목은 아직 투표가 아닙니다. 후보군을 만든 뒤 별도의 비밀 투표로 넘어갑니다.</p>
        {view.ownNominationTargetId ? (
          <div className="m3-selection-seal">
            <span>내 지목</span>
            <strong>{playerName(snapshot, view.ownNominationTargetId)}</strong>
          </div>
        ) : null}
      </div>
    );
  }

  if (contract.id === "DAY_VOTE") {
    const noExecutionSelected =
      contract.primaryActions.includes("CONFIRM_VOTE") && view.ownVoteTargetId === null;
    return (
      <div className="m3-stage-content m3-stage-content--vote">
        <span className="m3-stage-kicker">SECRET BALLOT</span>
        <h2>표를 고른 뒤 확정하십시오.</h2>
        <p>확정 전에는 선택을 바꿀 수 있습니다. 다른 사람의 개별 표는 공개되지 않습니다.</p>
        <div className="m3-vote-progress">
          <span>확정 진행</span>
          <strong>
            {view.voteProgress?.confirmed ?? 0}/{view.voteProgress?.total ?? 0}
          </strong>
        </div>
        {(view.ownVoteTargetId || noExecutionSelected) ? (
          <div className="m3-selection-seal">
            <span>내 표</span>
            <strong>{view.ownVoteTargetId ? playerName(snapshot, view.ownVoteTargetId) : "처형하지 않음"}</strong>
          </div>
        ) : null}
      </div>
    );
  }

  if (contract.id === "VOTE_RESULT") {
    const entries = Object.entries(view.voteResult?.tally ?? {});
    return (
      <div className="m3-stage-content m3-stage-content--result">
        <span className="m3-stage-kicker">FINAL TALLY</span>
        <h2>{view.voteResult?.executionTargetId ? playerName(snapshot, view.voteResult.executionTargetId) : "처형 없음"}</h2>
        <div className="m3-tally">
          {entries.map(([id, count]) => (
            <div key={id}>
              <span>{id === "__NO_EXECUTION__" ? "처형하지 않음" : playerName(snapshot, id)}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (contract.id === "EXECUTION") {
    const executed = [...view.publicEvents].reverse().find((event) => event.type === "PLAYER_EXECUTED");
    const reveal = executed
      ? [...view.publicEvents].reverse().find(
          (event) => event.type === "ROLE_REVEALED" && event.playerId === executed.playerId,
        )
      : undefined;
    return (
      <div className="m3-stage-content m3-stage-content--execution">
        <span className="m3-stage-kicker">EXECUTION</span>
        <h2>{executed ? playerName(snapshot, executed.playerId) : "판결 집행"}</h2>
        <div className="m3-execution-mark">×</div>
        <p>
          {reveal?.role
            ? "공개된 역할 · " + ROLE_LABEL[reveal.role]
            : "역할 공개를 확인하고 다음 단계로 진행하십시오."}
        </p>
      </div>
    );
  }

  if (contract.id === "DEAD_PLAYER") {
    return (
      <div className="m3-stage-content m3-stage-content--dead">
        <span className="m3-stage-kicker">SPECTATOR</span>
        <h2>당신은 더 이상 테이블에 개입할 수 없습니다.</h2>
        <p>{contract.waiting.reason}</p>
        <div className="m3-dead-mark">†</div>
      </div>
    );
  }

  if (contract.id === "GAME_OVER") {
    return (
      <div className="m3-stage-content m3-stage-content--gameover">
        <span className="m3-stage-kicker">FINAL REVEAL</span>
        <h2>{view.winner === "TOWN" ? "시민 진영 승리" : "마피아 진영 승리"}</h2>
        <div className="m3-final-grid">
          {view.players.map((player) => (
            <div key={player.id}>
              <span>{player.name}</span>
              <strong>{player.publicRole ? ROLE_LABEL[player.publicRole] : "?"}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="m3-stage-content">
      <span className="m3-stage-kicker">ENGINE</span>
      <h2>판정을 정리하고 있습니다.</h2>
      <WaitingBlock contract={contract} />
    </div>
  );
}

function WaitingBlock({ contract }: { contract: ScreenContract }) {
  if (!contract.waiting.active) return null;
  return (
    <div className="m3-waiting">
      <span className="m3-waiting-dot" />
      <p>{contract.waiting.reason}</p>
    </div>
  );
}

function ActionArea({
  snapshot,
  onAction,
}: {
  snapshot: LocalMafiaSnapshot;
  onAction: (intent: HumanActionIntent) => void;
}) {
  const { view, contract } = snapshot;
  const targets = useMemo(() => legalTargets(snapshot), [snapshot]);
  const selection = ownSelection(snapshot);
  const hasSelectNight = contract.primaryActions.includes("SELECT_NIGHT_TARGET");
  const hasNominate = contract.primaryActions.includes("NOMINATE_PLAYER");
  const hasVote = contract.primaryActions.includes("SELECT_VOTE");

  const selectTarget = (targetId: string) => {
    if (hasSelectNight) onAction({ type: "SELECT_NIGHT_TARGET", targetId });
    else if (hasNominate) onAction({ type: "NOMINATE_PLAYER", targetId });
    else if (hasVote) onAction({ type: "SELECT_VOTE", targetId });
  };

  const directActions = [
    ...contract.primaryActions,
    ...contract.secondaryActions,
  ].filter(
    (action) =>
      action !== "SELECT_NIGHT_TARGET" &&
      action !== "NOMINATE_PLAYER" &&
      action !== "SELECT_VOTE",
  );

  return (
    <section className="m3-action-area" aria-label="현재 행동">
      <div className="m3-action-copy">
        <span>ACTION</span>
        <strong>{contract.objective}</strong>
      </div>

      {targets.length > 0 ? (
        <div className="m3-target-list">
          {targets.map((player) => (
            <button
              type="button"
              className={"m3-target " + (selection === player.id ? "is-selected" : "")}
              key={player.id}
              onClick={() => selectTarget(player.id)}
            >
              <span className="m3-target-status">{player.alive ? "●" : "×"}</span>
              <strong>{player.name}</strong>
              <small>{player.id === view.self.id ? "YOU" : player.publicRole ? ROLE_LABEL[player.publicRole] : "UNKNOWN"}</small>
            </button>
          ))}
          {hasVote ? (
            <button
              type="button"
              className={
                "m3-target m3-target--none " +
                (view.ownVoteTargetId === null && contract.primaryActions.includes("CONFIRM_VOTE")
                  ? "is-selected"
                  : "")
              }
              onClick={() => onAction({ type: "SELECT_VOTE", targetId: null })}
            >
              <span className="m3-target-status">—</span>
              <strong>처형하지 않음</strong>
              <small>NO EXECUTION</small>
            </button>
          ) : null}
        </div>
      ) : null}

      {directActions.length > 0 ? (
        <div className="m3-action-buttons">
          {directActions.map((action) => (
            <button
              type="button"
              className={
                action === "CONFIRM_NIGHT_ACTION" || action === "CONFIRM_VOTE" || action === "START_GAME"
                  ? "m3-action-button m3-action-button--strong"
                  : action === "END_NOMINATION" || action === "END_DISCUSSION"
                    ? "m3-action-button m3-action-button--quiet"
                    : "m3-action-button"
              }
              key={action}
              onClick={() => {
                if (action === "SET_READY") onAction({ type: "SET_READY", ready: !view.self.ready });
                else if (action === "START_GAME") onAction({ type: "START_GAME" });
                else if (action === "CONFIRM_ROLE") onAction({ type: "CONFIRM_ROLE" });
                else if (action === "CONFIRM_NIGHT_ACTION") onAction({ type: "CONFIRM_NIGHT_ACTION" });
                else if (action === "CONFIRM_RESULT") onAction({ type: "CONFIRM_RESULT" });
                else if (action === "END_DISCUSSION") onAction({ type: "END_DISCUSSION" });
                else if (action === "END_NOMINATION") onAction({ type: "END_NOMINATION" });
                else if (action === "CONFIRM_VOTE") onAction({ type: "CONFIRM_VOTE" });
              }}
            >
              {actionLabel(action, view.self.ready)}
            </button>
          ))}
        </div>
      ) : null}

      {contract.waiting.active ? <WaitingBlock contract={contract} /> : null}
    </section>
  );
}

export function MafiaClassicPage() {
  const [nickname, setNickname] = useState("당신");
  const [runtime, setRuntime] = useState<LocalMafiaRuntime | null>(null);
  const [snapshot, setSnapshot] = useState<LocalMafiaSnapshot | null>(null);
  const [error, setError] = useState("");

  const enterTable = () => {
    try {
      const nextRuntime = new LocalMafiaRuntime(nickname);
      setRuntime(nextRuntime);
      setSnapshot(nextRuntime.snapshot());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "테이블을 만들지 못했습니다.");
    }
  };

  const act = (intent: HumanActionIntent) => {
    if (!runtime) return;
    try {
      const result = runtime.act(intent);
      setSnapshot(result.snapshot);
      setError(result.ok ? "" : (result.errorMessage ?? result.errorCode ?? "Action 실패"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "게임 진행 중 오류가 발생했습니다.");
    }
  };

  if (!runtime || !snapshot) {
    return (
      <main className="m3-entry">
        <div className="m3-entry-grain" aria-hidden="true" />
        <section className="m3-entry-copy">
          <p className="m3-overline">MAFIA · M3 VISUAL SHELL</p>
          <h1>아무도<br />믿지 마십시오.</h1>
          <p>
            검증된 M1 엔진과 M2 Screen Contract 위에 올라가는 첫 실제 게임 화면입니다.
            이 테이블에서는 1명의 플레이어와 7명의 봇이 같은 Action API를 사용합니다.
          </p>
        </section>
        <section className="m3-entry-panel">
          <span className="m3-panel-label">LOCAL PLAYTEST TABLE</span>
          <label>
            <small>PLAYER NAME</small>
            <input value={nickname} maxLength={14} onChange={(event) => setNickname(event.target.value)} />
          </label>
          <div className="m3-entry-rules">
            <span>8 PLAYERS</span>
            <span>2 MAFIA</span>
            <span>DETECTIVE</span>
            <span>DOCTOR</span>
          </div>
          {error ? <p className="m3-error">{error}</p> : null}
          <button className="m3-enter-button" onClick={enterTable}>
            테이블 입장
          </button>
        </section>
      </main>
    );
  }

  const { view, contract } = snapshot;
  const aliveCount = view.players.filter((player) => player.alive).length;
  const mayShowPublicEvents = contract.visibleFields.includes("publicEvents");
  const recentEvents = mayShowPublicEvents
    ? [...view.publicEvents].reverse().slice(0, 6)
    : [];
  const mafiaIds = new Set(
    contract.visibleFields.includes("mafiaMembers")
      ? (view.mafiaMembers?.map((member) => member.id) ?? [])
      : [],
  );

  return (
    <main className={"m3-shell m3-shell--" + contract.id.toLowerCase().replaceAll("_", "-")}>
      <div className="m3-ambient" aria-hidden="true" />

      <header className="m3-header">
        <div className="m3-brand">
          <span className="m3-brand-mark">M</span>
          <div>
            <small>MAFIA</small>
            <strong>{SCREEN_LABEL[contract.id]}</strong>
          </div>
        </div>
        <div className="m3-round">
          <span>{view.day > 0 ? "DAY " + view.day : "NIGHT " + view.night}</span>
          <i />
          <strong>{aliveCount} ALIVE</strong>
        </div>
        <div className="m3-self">
          <span>{view.self.alive ? "ALIVE" : "OUT"}</span>
          <strong>{view.self.name}</strong>
          <small>{view.self.role ? ROLE_LABEL[view.self.role] : "ROLE HIDDEN"}</small>
        </div>
      </header>

      <div className="m3-layout">
        <aside className="m3-players" aria-label="플레이어">
          <div className="m3-section-head">
            <span>PLAYERS</span>
            <strong>{aliveCount}/{view.players.length}</strong>
          </div>
          <div className="m3-seat-list">
            {view.players.map((player, index) => {
              const teammate = mafiaIds.has(player.id) && player.id !== view.self.id;
              return (
                <div
                  className={
                    "m3-seat " +
                    (!player.alive ? "is-dead " : "") +
                    (player.id === view.self.id ? "is-self " : "") +
                    (teammate ? "is-mafia-mate" : "")
                  }
                  key={player.id}
                >
                  <span className="m3-seat-no">{String(index + 1).padStart(2, "0")}</span>
                  <div className="m3-seat-name">
                    <strong>{player.name}</strong>
                    <small>
                      {!player.alive
                        ? player.publicRole
                          ? ROLE_LABEL[player.publicRole]
                          : "OUT"
                        : teammate
                          ? "MAFIA · ALLY"
                          : player.id === view.self.id
                            ? "YOU"
                            : "UNKNOWN"}
                    </small>
                  </div>
                  <span className="m3-seat-life">{player.alive ? "●" : "×"}</span>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="m3-main">
          <div className="m3-stage">
            <div className="m3-stage-topline">
              <span>{SCREEN_LABEL[contract.id]}</span>
              <strong>{contract.mode}</strong>
            </div>
            <MainStage snapshot={snapshot} />
          </div>

          {mayShowPublicEvents ? (
            <section className="m3-context">
              <div className="m3-section-head">
                <span>PUBLIC CONTEXT</span>
                <strong>{view.publicEvents.length}</strong>
              </div>
              {recentEvents.length ? (
                <div className="m3-event-list">
                  {recentEvents.map((event) => (
                    <article key={event.seq}>
                      <span>{String(event.seq).padStart(2, "0")}</span>
                      <p>{publicEventText(snapshot, event)}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="m3-empty-context">아직 공개 사건이 없습니다.</p>
              )}
            </section>
          ) : null}

          <ActionArea snapshot={snapshot} onAction={act} />

          {error ? (
            <div className="m3-error-strip" role="alert">
              <span>ENGINE</span>
              <p>{error}</p>
            </div>
          ) : null}
        </section>
      </div>

      <footer className="m3-footer">
        <span>M1 ENGINE · M2 CONTRACT · M3 SHELL</span>
        <span>REV {view.revision}</span>
      </footer>
    </main>
  );
}
