import { useEffect, useMemo, useRef, useState } from "react";
import {
  LocalMafiaRuntime,
  type HumanActionIntent,
  type LocalMafiaSnapshot,
} from "../application/localMafiaRuntime";
import type {
  ChatEntry,
  OriginalRole,
  SystemPayload,
} from "../original/types";
import "./mafiaClassic.css";

const ROLE_LABEL: Record<OriginalRole, string> = {
  HONEST: "HONEST",
  MAFIA: "MAFIA",
};

function playerName(snapshot: LocalMafiaSnapshot, id?: string | null): string {
  if (!id) return "—";
  return snapshot.view.players.find((player) => player.id === id)?.name ?? id;
}

function systemTitle(system: SystemPayload): string {
  switch (system.code) {
    case "GAME_STARTED": return "카드가 배분되었습니다";
    case "SUNRISE_STARTED": return "SUNRISE";
    case "DAY_STARTED": return "DAY START";
    case "PLAYER_ACCUSED": return "ACCUSATION";
    case "GUILTY_VOTE_OPENED": return "GUILTY VOTE";
    case "GUILTY_VOTE_PASSED": return "GUILTY";
    case "GUILTY_VOTE_FAILED": return "NOT GUILTY";
    case "PLAYER_EXECUTED": return "EXECUTION";
    case "NIGHT_PROPOSED": return "MAFIA NIGHT PROPOSED";
    case "NIGHT_PROPOSAL_PASSED": return "NIGHT APPROVED";
    case "NIGHT_PROPOSAL_FAILED": return "NIGHT REJECTED";
    case "NIGHT_STARTED": return "MAFIA NIGHT";
    case "NIGHT_NOTES_REVEALED": return "NIGHT NOTES OPENED";
    case "NIGHT_MURDER": return "MURDER";
    case "NIGHT_NO_MURDER": return "NO MURDER";
    case "GAME_WON": return "GAME OVER";
  }
}

function systemBody(snapshot: LocalMafiaSnapshot, system: SystemPayload): string {
  const actor = playerName(snapshot, system.actorId);
  const target = playerName(snapshot, system.targetId);

  switch (system.code) {
    case "GAME_STARTED":
      return "모든 플레이어에게 비밀 카드가 배분되었습니다.";
    case "SUNRISE_STARTED":
      return "Mafia는 서로를 확인합니다. Honest는 아무 정보도 얻지 않습니다.";
    case "DAY_STARTED":
      return "공개 채팅이 열렸습니다. 의심하고, 질문하고, 설득하십시오.";
    case "PLAYER_ACCUSED":
      return actor + " → " + target + " · Mafia 혐의로 고발했습니다.";
    case "GUILTY_VOTE_OPENED":
      return target + "의 유죄 표결이 시작되었습니다. 필요 과반 " + (system.required ?? 0) + "표.";
    case "GUILTY_VOTE_PASSED":
      return "GUILTY " + (system.guilty ?? 0) + " / NOT GUILTY " + (system.notGuilty ?? 0) + " · 필요 " + (system.required ?? 0) + "표.";
    case "GUILTY_VOTE_FAILED":
      return "GUILTY " + (system.guilty ?? 0) + " / NOT GUILTY " + (system.notGuilty ?? 0) + " · " + target + "은(는) 생존합니다.";
    case "PLAYER_EXECUTED":
      return target + "이(가) 게임에서 제거되었습니다. 역할은 공개되지 않습니다.";
    case "NIGHT_PROPOSED":
      return actor + "이(가) Mafia Night를 제안했습니다. 필요 과반 " + (system.required ?? 0) + "표.";
    case "NIGHT_PROPOSAL_PASSED":
      return "찬성 " + (system.agree ?? 0) + " / 반대 " + (system.disagree ?? 0) + " · Mafia Night가 열립니다.";
    case "NIGHT_PROPOSAL_FAILED":
      return "찬성 " + (system.agree ?? 0) + " / 반대 " + (system.disagree ?? 0) + " · Day 채팅을 계속합니다.";
    case "NIGHT_STARTED":
      return "PUBLIC CHAT이 잠겼습니다. 모든 생존자는 비밀 쪽지를 제출합니다.";
    case "NIGHT_NOTES_REVEALED": {
      const names = (system.targetIds ?? []).map((id) => playerName(snapshot, id));
      return "이름 쪽지 " + (system.mafiaCount ?? 0) + "장" + (names.length ? " · " + names.join(" · ") : " · Mafia shot 0");
    }
    case "NIGHT_MURDER":
      return target + "이(가) 밤에 제거되었습니다. 역할은 공개되지 않습니다.";
    case "NIGHT_NO_MURDER":
      return "Mafia 쪽지의 이름이 일치하지 않았습니다. 아무도 제거되지 않았습니다.";
    case "GAME_WON":
      return system.winner === "HONEST" ? "HONEST 팀 승리." : "MAFIA 팀 승리.";
  }
}

function ChatLine({
  snapshot,
  entry,
}: {
  snapshot: LocalMafiaSnapshot;
  entry: ChatEntry;
}) {
  if (entry.kind === "SYSTEM" && entry.system) {
    return (
      <article className={"oc-system oc-system--" + entry.system.code.toLowerCase()}>
        <div className="oc-system-head">
          <span>SYSTEM</span>
          <strong>{systemTitle(entry.system)}</strong>
        </div>
        <p>{systemBody(snapshot, entry.system)}</p>
      </article>
    );
  }

  const sender = playerName(snapshot, entry.senderId);
  return (
    <article className={"oc-chat-line " + (entry.channel === "DEAD" ? "is-dead" : "")}>
      <div className="oc-chat-avatar">{sender.slice(0, 1)}</div>
      <div>
        <div className="oc-chat-meta">
          <strong>{sender}</strong>
          <span>{entry.channel === "DEAD" ? "DEAD CHAT" : "PUBLIC"}</span>
        </div>
        <p>{entry.text}</p>
      </div>
    </article>
  );
}

function PhaseCard({ snapshot }: { snapshot: LocalMafiaSnapshot }) {
  const { view, contract } = snapshot;

  if (contract.id === "ROLE_REVEAL") {
    return (
      <section className="oc-phase-card oc-role-reveal">
        <span>PRIVATE CARD</span>
        <h2>{view.self.role ? ROLE_LABEL[view.self.role] : "UNKNOWN"}</h2>
        <p>
          {view.self.role === "MAFIA"
            ? "당신은 Mafia입니다. 아직 동료의 정체는 Sunrise까지 공개되지 않습니다."
            : "당신은 Honest입니다. Mafia가 누구인지는 알 수 없습니다."}
        </p>
      </section>
    );
  }

  if (contract.id === "SUNRISE") {
    return (
      <section className="oc-phase-card oc-sunrise">
        <span>SUNRISE</span>
        <h2>{view.self.role === "MAFIA" ? "눈을 뜨십시오." : "아무것도 보지 못했습니다."}</h2>
        {view.self.role === "MAFIA" && view.mafiaMembers ? (
          <div className="oc-allies">
            {view.mafiaMembers.map((member) => (
              <strong key={member.id}>{member.name}</strong>
            ))}
          </div>
        ) : (
          <p>당신이 얻는 추가 정보는 없습니다.</p>
        )}
      </section>
    );
  }

  if (contract.id === "NIGHT_NOTES") {
    return (
      <section className="oc-phase-card oc-night-card">
        <span>SEALED NOTE</span>
        <h2>{view.self.role === "MAFIA" ? "한 사람의 이름" : "HONEST"}</h2>
        <p>{contract.objective}</p>
      </section>
    );
  }

  if (contract.id === "GAME_OVER") {
    return (
      <section className="oc-phase-card oc-game-over">
        <span>FINAL REVEAL</span>
        <h2>{view.winner === "HONEST" ? "HONEST WIN" : "MAFIA WIN"}</h2>
        <div className="oc-final-roles">
          {view.players.map((player) => (
            <div key={player.id}>
              <span>{player.name}</span>
              <strong>{player.publicRole ? ROLE_LABEL[player.publicRole] : "?"}</strong>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return null;
}

function VoteOverlay({
  snapshot,
  act,
}: {
  snapshot: LocalMafiaSnapshot;
  act: (intent: HumanActionIntent) => void;
}) {
  const { view, contract } = snapshot;

  if (contract.id === "GUILTY_VOTE") {
    const accused = playerName(snapshot, view.accusation?.accusedId);
    return (
      <section className="oc-decision-card">
        <span>GUILTY VOTE</span>
        <h3>{accused}</h3>
        <p>
          제출 {view.guiltyVote?.submitted ?? 0}/{view.guiltyVote?.eligible ?? 0}
          · 필요 {view.guiltyVote?.required ?? 0}
        </p>
        {view.availableActions.includes("CAST_GUILTY_VOTE") ? (
          <div className="oc-decision-buttons">
            <button className="danger" onClick={() => act({ type: "CAST_GUILTY_VOTE", guilty: true })}>GUILTY</button>
            <button onClick={() => act({ type: "CAST_GUILTY_VOTE", guilty: false })}>NOT GUILTY</button>
          </div>
        ) : (
          <div className="oc-wait">다른 생존자의 표를 기다리고 있습니다.</div>
        )}
      </section>
    );
  }

  if (contract.id === "NIGHT_PROPOSAL_VOTE") {
    return (
      <section className="oc-decision-card">
        <span>MAFIA NIGHT?</span>
        <h3>밤으로 넘어갈 것인가.</h3>
        <p>
          제출 {view.nightProposal?.submitted ?? 0}/{view.nightProposal?.eligible ?? 0}
          · 필요 {view.nightProposal?.required ?? 0}
        </p>
        {view.availableActions.includes("CAST_NIGHT_PROPOSAL_VOTE") ? (
          <div className="oc-decision-buttons">
            <button className="danger" onClick={() => act({ type: "CAST_NIGHT_PROPOSAL_VOTE", agree: true })}>찬성</button>
            <button onClick={() => act({ type: "CAST_NIGHT_PROPOSAL_VOTE", agree: false })}>반대</button>
          </div>
        ) : (
          <div className="oc-wait">다른 생존자의 표를 기다리고 있습니다.</div>
        )}
      </section>
    );
  }

  return null;
}

export function MafiaClassicPage() {
  const [nickname, setNickname] = useState("당신");
  const [runtime, setRuntime] = useState<LocalMafiaRuntime | null>(null);
  const [snapshot, setSnapshot] = useState<LocalMafiaSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [error, setError] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const enter = () => {
    try {
      const next = new LocalMafiaRuntime(nickname);
      setRuntime(next);
      setSnapshot(next.snapshot());
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

  useEffect(() => {
    setSelectedTarget(null);
  }, [snapshot?.view.phase, snapshot?.view.accusation?.accusedId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [snapshot?.view.chat.length]);

  const sendMessage = () => {
    if (!snapshot) return;
    const text = message.trim();
    const channel = snapshot.view.writableChatChannels[0];
    if (!text || !channel) return;
    act({ type: "SEND_CHAT", channel, text });
    setMessage("");
  };

  if (!runtime || !snapshot) {
    return (
      <main className="oc-entry">
        <section>
          <p className="oc-kicker">ORIGINAL MAFIA · CHAT FIRST</p>
          <h1>말이<br />무기가 된다.</h1>
          <p>
            외부 대화 없이 게임 안의 채팅만으로 고발, 반론, 표결, Mafia Night까지
            한 판 전체가 이어집니다.
          </p>
        </section>
        <aside>
          <span>LOCAL 8 PLAYER TABLE</span>
          <label>
            PLAYER NAME
            <input value={nickname} maxLength={14} onChange={(event) => setNickname(event.target.value)} />
          </label>
          <div className="oc-entry-rule">8 PLAYERS · 3 MAFIA · 5 HONEST</div>
          {error ? <p className="oc-error">{error}</p> : null}
          <button onClick={enter}>테이블 입장</button>
        </aside>
      </main>
    );
  }

  const { view, contract } = snapshot;
  const alive = view.players.filter((player) => player.alive);
  const mafiaIds = new Set(view.mafiaMembers?.map((member) => member.id) ?? []);
  const targetCandidates = alive.filter((player) => player.id !== view.self.id);
  const canChat = view.availableActions.includes("SEND_CHAT");
  const publicMafiaCount = view.publicMafiaCount;
  const currentAccused = view.accusation?.accusedId ?? null;

  const noteTargets = useMemo(
    () => alive,
    [alive],
  );

  const confirmNightNote = () => {
    if (view.self.role === "HONEST") {
      act({ type: "SUBMIT_NIGHT_NOTE", note: { kind: "HONEST" } });
      return;
    }
    if (selectedTarget) {
      act({
        type: "SUBMIT_NIGHT_NOTE",
        note: { kind: "TARGET", targetId: selectedTarget },
      });
    }
  };

  return (
    <main className={"oc-shell oc-phase-" + contract.id.toLowerCase()}>
      <header className="oc-header">
        <div className="oc-brand">
          <strong>MAFIA</strong>
          <span>{contract.id.replaceAll("_", " ")}</span>
        </div>
        <div className="oc-status">
          <strong>{view.day > 0 ? "DAY " + view.day : "PRE-GAME"}</strong>
          <span>{alive.length} ALIVE</span>
          {publicMafiaCount !== null ? <span>{publicMafiaCount} MAFIA SHOTS</span> : null}
        </div>
        <div className="oc-you">
          <span>{view.self.alive ? "ALIVE" : "DEAD"}</span>
          <strong>{view.self.name}</strong>
          <small>{view.self.role ? ROLE_LABEL[view.self.role] : "?"}</small>
        </div>
      </header>

      <div className="oc-body">
        <aside className="oc-player-panel">
          <div className="oc-panel-head">
            <span>PLAYERS</span>
            <strong>{alive.length}/{view.players.length}</strong>
          </div>
          <div className="oc-player-list">
            {view.players.map((player, index) => (
              <button
                type="button"
                key={player.id}
                disabled={!player.alive || player.id === view.self.id}
                onClick={() => setSelectedTarget(player.id)}
                className={
                  "oc-player " +
                  (!player.alive ? "is-dead " : "") +
                  (player.id === view.self.id ? "is-self " : "") +
                  (mafiaIds.has(player.id) && player.id !== view.self.id ? "is-mafia " : "") +
                  (selectedTarget === player.id ? "is-selected" : "")
                }
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{player.name}</strong>
                  <small>
                    {!player.alive
                      ? "OUT"
                      : mafiaIds.has(player.id) && player.id !== view.self.id
                        ? "MAFIA ALLY"
                        : player.id === view.self.id
                          ? "YOU"
                          : "UNKNOWN"}
                  </small>
                </div>
                <i>{player.alive ? "●" : "×"}</i>
              </button>
            ))}
          </div>
        </aside>

        <section className="oc-chat-stage">
          <div className="oc-chat-head">
            <div>
              <span>{view.self.alive ? "PUBLIC TABLE" : "SPECTATOR"}</span>
              <strong>{contract.objective}</strong>
            </div>
            <small>{canChat ? "CHAT OPEN" : "READ ONLY"}</small>
          </div>

          <div className="oc-chat-scroll">
            <PhaseCard snapshot={snapshot} />
            {view.chat.map((entry) => (
              <ChatLine snapshot={snapshot} entry={entry} key={entry.seq} />
            ))}
            <VoteOverlay snapshot={snapshot} act={act} />
            <div ref={chatEndRef} />
          </div>

          {contract.chatVisible ? (
            <div className={"oc-composer " + (!canChat ? "is-locked" : "")}>
              <span>{view.writableChatChannels[0] === "DEAD" ? "DEAD" : "CHAT"}</span>
              <input
                value={message}
                disabled={!canChat}
                maxLength={500}
                placeholder={
                  canChat
                    ? view.writableChatChannels[0] === "DEAD"
                      ? "사망자에게만 보이는 메시지…"
                      : "의심, 질문, 반론을 입력하세요…"
                    : "현재 단계에서는 채팅이 잠겨 있습니다."
                }
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) sendMessage();
                }}
              />
              <button disabled={!canChat || !message.trim()} onClick={sendMessage}>SEND</button>
            </div>
          ) : null}
        </section>

        <aside className="oc-context-panel">
          <div className="oc-panel-head">
            <span>CONTEXT</span>
            <strong>REV {view.revision}</strong>
          </div>

          <section className="oc-context-block">
            <span>MY CARD</span>
            <strong className={view.self.role === "MAFIA" ? "is-red" : ""}>
              {view.self.role ? ROLE_LABEL[view.self.role] : "SEALED"}
            </strong>
            {view.self.role === "MAFIA" && view.mafiaMembers ? (
              <p>{view.mafiaMembers.map((member) => member.name).join(" · ")}</p>
            ) : null}
          </section>

          {view.accusation ? (
            <section className="oc-context-block is-alert">
              <span>ACTIVE ACCUSATION</span>
              <strong>
                {playerName(snapshot, view.accusation.accuserId)}
                {" → "}
                {playerName(snapshot, view.accusation.accusedId)}
              </strong>
              {view.guiltyVote ? (
                <p>표결 {view.guiltyVote.submitted}/{view.guiltyVote.eligible} · 필요 {view.guiltyVote.required}</p>
              ) : (
                <p>채팅으로 근거와 반론을 이어가십시오.</p>
              )}
            </section>
          ) : null}

          {view.nightProposal ? (
            <section className="oc-context-block is-alert">
              <span>NIGHT PROPOSAL</span>
              <strong>{playerName(snapshot, view.nightProposal.proposerId)}</strong>
              <p>표결 {view.nightProposal.submitted}/{view.nightProposal.eligible} · 필요 {view.nightProposal.required}</p>
            </section>
          ) : null}

          <section className="oc-context-block">
            <span>SELECTED PLAYER</span>
            <strong>{playerName(snapshot, selectedTarget)}</strong>
            <p>플레이어 목록에서 대상을 선택합니다.</p>
          </section>
        </aside>
      </div>

      <section className="oc-action-bar">
        <div>
          <span>ACTION</span>
          <strong>{contract.objective}</strong>
        </div>

        <div className="oc-actions">
          {view.availableActions.includes("SET_READY") ? (
            <button onClick={() => act({ type: "SET_READY", ready: !view.self.ready })}>
              {view.self.ready ? "READY 해제" : "READY"}
            </button>
          ) : null}

          {view.availableActions.includes("START_GAME") ? (
            <button className="danger" onClick={() => act({ type: "START_GAME" })}>게임 시작</button>
          ) : null}

          {view.availableActions.includes("CONFIRM_ROLE") ? (
            <button className="danger" onClick={() => act({ type: "CONFIRM_ROLE" })}>카드 확인 완료</button>
          ) : null}

          {view.availableActions.includes("CONFIRM_SUNRISE") ? (
            <button className="danger" onClick={() => act({ type: "CONFIRM_SUNRISE" })}>SUNRISE 확인 완료</button>
          ) : null}

          {view.availableActions.includes("ACCUSE_PLAYER") ? (
            <button
              className="danger"
              disabled={!selectedTarget}
              onClick={() => selectedTarget && act({ type: "ACCUSE_PLAYER", targetId: selectedTarget })}
            >
              {selectedTarget ? playerName(snapshot, selectedTarget) + " 고발" : "고발 대상 선택"}
            </button>
          ) : null}

          {view.availableActions.includes("CALL_GUILTY_VOTE") ? (
            <button className="danger" onClick={() => act({ type: "CALL_GUILTY_VOTE" })}>
              유죄 표결 요청
            </button>
          ) : null}

          {view.availableActions.includes("PROPOSE_MAFIA_NIGHT") ? (
            <button onClick={() => act({ type: "PROPOSE_MAFIA_NIGHT" })}>Mafia Night 제안</button>
          ) : null}

          {view.availableActions.includes("SUBMIT_NIGHT_NOTE") ? (
            <>
              {view.self.role === "MAFIA" ? (
                <div className="oc-night-targets">
                  {noteTargets.map((player) => (
                    <button
                      type="button"
                      className={selectedTarget === player.id ? "is-selected" : ""}
                      key={player.id}
                      onClick={() => setSelectedTarget(player.id)}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                className="danger"
                disabled={view.self.role === "MAFIA" && !selectedTarget}
                onClick={confirmNightNote}
              >
                {view.self.role === "MAFIA"
                  ? selectedTarget
                    ? playerName(snapshot, selectedTarget) + " 쪽지 봉인"
                    : "표적 선택"
                  : "HONEST 쪽지 봉인"}
              </button>
            </>
          ) : null}
        </div>
      </section>

      {error ? <div className="oc-error-strip">{error}</div> : null}
    </main>
  );
}
