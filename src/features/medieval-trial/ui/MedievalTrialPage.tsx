import { useMemo, useState } from "react";
import { TrialSession } from "../application/trialSession";
import {
  TRIAL_PHASE_LABELS,
  type TrialIntentResult,
  type TrialPhase,
  type TrialPlayer,
  type TrialSessionState,
  type TrialTestimony,
} from "../application/trialSessionTypes";
import { MEDIEVAL_TRIAL_V01 } from "../domain/rules";
import { newGameSeed } from "../infrastructure/newGameSeed";

const ROLE_LABELS = {
  murderer: "살인자",
  investigator: "집행관",
  apothecary: "약제사",
  commoner: "평민",
};

function phaseActionLabel(phase: TrialPhase): string {
  switch (phase) {
    case "opening-night":
      return "첫 밤 마치기";
    case "dawn":
      return "사건 확인 · 토론 시작";
    case "night":
      return "밤 행동 확정하기";
    case "debate":
      return "고발을 시작하기";
    case "accusation":
      return "이 사람을 고발하기";
    case "defendants":
      return "피고석의 변론 듣기";
    case "verdict":
      return "이 사람에게 유죄 판결";
    case "resolution":
      return "다음 밤을 맞이하기";
    case "ended":
      return "새 재판 열기";
  }
}

function getPlayer(state: TrialSessionState, playerId: string): TrialPlayer | undefined {
  return state.players.find((player) => player.id === playerId);
}

function formatVotes(state: TrialSessionState, playerId: string): string {
  return String(state.accusationVotes.find((vote) => vote.playerId === playerId)?.count ?? 0);
}

function TestimonyCard({ testimony }: { testimony: TrialTestimony }) {
  return (
    <article className={`testimony testimony--${testimony.reliability}`}>
      <div className="testimony__mark" aria-hidden="true">
        ❝
      </div>
      <div>
        <p className="testimony__speaker">{testimony.speakerName}의 증언</p>
        <p className="testimony__text">{testimony.text}</p>
      </div>
    </article>
  );
}

function SeatCard({
  player,
  selected,
  disabled,
  voteCount,
  onSelect,
}: {
  player: TrialPlayer;
  selected: boolean;
  disabled: boolean;
  voteCount: string;
  onSelect: (playerId: string) => void;
}) {
  return (
    <button
      className={`seat-card${selected ? " seat-card--selected" : ""}${!player.living ? " seat-card--fallen" : ""}`}
      type="button"
      disabled={disabled || !player.living}
      onClick={() => onSelect(player.id)}
    >
      <span className="seat-card__seal" aria-hidden="true">
        {player.living ? player.name.slice(0, 1) : "†"}
      </span>
      <span className="seat-card__copy">
        <strong>{player.name}</strong>
        <small>{player.title}</small>
      </span>
      {voteCount !== "0" ? <span className="seat-card__votes">{voteCount}표</span> : null}
      {player.isHuman ? <span className="seat-card__you">당신</span> : null}
    </button>
  );
}

export function MedievalTrialPage() {
  const [engine, setEngine] = useState(() => new TrialSession(newGameSeed()));
  const [started, setStarted] = useState(false);
  const [nickname, setNickname] = useState("");
  const [claimTarget, setClaimTarget] = useState("");
  const [state, setState] = useState<TrialSessionState>(() => engine.getState());
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const human = useMemo(() => getPlayer(state, state.playerId), [state]);
  const defendants = state.defendants
    .map((playerId) => getPlayer(state, playerId))
    .filter((player): player is TrialPlayer => Boolean(player));
  const currentSelection = selectedPlayerId;

  function commit(result: TrialIntentResult) {
    setState(result.state);
    setError(result.error);
    if (!result.error) setSelectedPlayerId(null);
  }

  function resetGame() {
    const nextEngine = new TrialSession(newGameSeed(), nickname);
    setEngine(nextEngine);
    setState(nextEngine.getState());
    setSelectedPlayerId(null);
    setError(null);
    setStarted(false);
  }

  function startGame() {
    const nextEngine = new TrialSession(newGameSeed(), nickname);
    setEngine(nextEngine);
    setState(nextEngine.getState());
    setStarted(true);
  }

  function primaryAction() {
    if (state.observing && (state.phase === "accusation" || state.phase === "verdict")) {
      commit(engine.observeVote());
      return;
    }
    if (state.phase === "opening-night")
      commit(engine.advanceOpeningNight(selectedPlayerId ?? undefined));
    else if (state.phase === "dawn") commit(engine.beginDiscussion());
    else if (state.phase === "night" && selectedPlayerId)
      commit(engine.submitNightAction(selectedPlayerId));
    else if (state.phase === "debate") commit(engine.beginAccusation());
    else if (state.phase === "accusation" && selectedPlayerId)
      commit(engine.submitAccusation(selectedPlayerId));
    else if (state.phase === "defendants") commit(engine.beginVerdict());
    else if (state.phase === "verdict" && currentSelection)
      commit(engine.submitVerdict(currentSelection));
    else if (state.phase === "resolution") commit(engine.continueAfterVerdict());
    else if (state.phase === "ended") resetGame();
  }

  const canAct =
    state.observing ||
    (state.phase !== "accusation" &&
      state.phase !== "night" &&
      state.phase !== "verdict" &&
      !(state.phase === "opening-night" && state.legalNightTargets.length > 0)) ||
    selectedPlayerId !== null;
  const actionLabel =
    state.phase === "verdict" && currentSelection === "pardon"
      ? "처형 보류에 투표 확정"
      : state.phase === "verdict" && !currentSelection && !state.observing
        ? "피고 또는 처형 보류를 선택하세요"
        : state.observing && (state.phase === "accusation" || state.phase === "verdict")
          ? "봇 표결 관전하기"
          : state.phase === "night" && !selectedPlayerId
            ? "밤 행동 대상을 고르기"
            : state.phase === "accusation" && !selectedPlayerId
              ? "고발할 사람을 고르기"
              : phaseActionLabel(state.phase);

  if (!started)
    return (
      <main className="trial-app">
        <section className="status-card trial-setup">
          <p className="trial-kicker">규칙 개정 0.2 · 1인 + AI 7명</p>
          <h1>중세재판</h1>
          <p>
            8명 중 2명은 살인자입니다. 대화와 공개 투표로 그들을 찾으세요. 이름은 신원일 뿐 역할의
            단서가 아닙니다.
          </p>
          <h2>게임의 목표</h2>
          <p>
            주민 편(집행관 1 · 약제사 1 · 평민 4)은 살인자 2명을 모두 제거하면 승리합니다. 살인자
            편은 생존 주민 수 이상이 되면 즉시 승리합니다.
          </p>
          <h2>한 판의 흐름</h2>
          <p>
            비밀 배역 확인 → 준비 밤(사망 없음) → 아침 발표 → 공개 주장 확인/발언 → 고발로 피고 2명
            선정 → 변론 → 처형 또는 보류 → 다음 밤.
          </p>
          <p>
            살인자는 동료를 알고 매일 밤 주민 1명을 습격합니다. 집행관은 1명의 진영을 비밀리에
            조사합니다. 약제사는 1명을 보호하되 연속 같은 대상 금지, 자기 보호는 한 판에 한
            번입니다. 평민은 밤 능력이 없지만 낮에 같은 1표를 행사합니다.
          </p>
          <p>
            누구나 집행관을 사칭하거나 거짓 주장을 할 수 있습니다. 공개 발언은 확정 증거가 아닙니다.
            사망 시 실제 역할 공개, 사망자는 발언·투표·밤 행동 없이 관전합니다.
          </p>
          <label>
            당신의 이름{" "}
            <input
              value={nickname}
              maxLength={16}
              placeholder="이름 입력 (선택)"
              onChange={(event) => setNickname(event.target.value)}
            />
          </label>
          <p>시작할 때 이름 배치와 배역을 새로 섞습니다. 플레이어가 역할을 고르지는 않습니다.</p>
          <button className="primary-action" type="button" onClick={startGame}>
            규칙 확인 · 무작위 배역 받기
          </button>
        </section>
      </main>
    );

  return (
    <main className="trial-app">
      <div className="rain-layer" aria-hidden="true" />
      <header className="trial-header">
        <div className="trial-brand">
          <div className="trial-brand__crest" aria-hidden="true">
            ✦
          </div>
          <div>
            <p className="trial-kicker">성 아그네스 성 · 1487년 늦가을</p>
            <h1>중세재판</h1>
          </div>
        </div>
        <div className="trial-header__right">
          <div className="bell-status" aria-label="현재 게임 상태">
            <span className="bell-status__icon" aria-hidden="true">
              ♢
            </span>
            <span>
              <small>현재 장면</small>
              <strong>{TRIAL_PHASE_LABELS[state.phase]}</strong>
            </span>
          </div>
          <button className="quiet-button" type="button" onClick={resetGame}>
            새 재판
          </button>
        </div>
      </header>

      <section className="trial-layout" aria-label="중세재판 게임 화면">
        <aside className="side-rail side-rail--left">
          <section className="status-card status-card--player">
            <p className="section-label">당신의 자리</p>
            <div className="player-identity">
              <span className="player-identity__seal" aria-hidden="true">
                {human?.name.slice(0, 1) ?? "?"}
              </span>
              <div>
                <strong>{human?.name}</strong>
                <span>{human?.title}</span>
              </div>
            </div>
            <p className="player-note">
              당신의 역할: {ROLE_LABELS[state.playerRole]}
              {state.observing ? " · 사망 후 관전 중" : ""}
            </p>
            <p className="player-note">
              비밀 배역 · 집행관은 진영을 조사합니다. 약제사는 자기 보호 한 번, 연속 같은 대상
              금지입니다. 첫 밤은 집행관만 조사하고 보호 자원은 쓰지 않습니다. 당신의 조사 결과는
              자동 공개되지 않습니다.
            </p>
            {state.privateNotes.map((note, index) => (
              <p className="player-note" key={index}>
                개인 기록 · {note}
              </p>
            ))}
          </section>

          <section className="status-card">
            <div className="section-heading">
              <p className="section-label">성 안의 사람들</p>
              <span className="living-count">
                {state.players.filter((player) => player.living).length}/8 생존
              </span>
            </div>
            <div className="seat-list">
              {state.players.map((player) => (
                <SeatCard
                  key={player.id}
                  player={player}
                  selected={player.id === selectedPlayerId || player.id === currentSelection}
                  disabled={
                    state.observing ||
                    (state.phase === "night" || state.phase === "opening-night"
                      ? !state.legalNightTargets.includes(player.id)
                      : (state.phase !== "accusation" && state.phase !== "verdict") ||
                        (state.phase === "accusation" && player.isHuman) ||
                        (state.phase === "verdict" && !state.defendants.includes(player.id)))
                  }
                  voteCount={state.phase === "accusation" ? formatVotes(state, player.id) : "0"}
                  onSelect={setSelectedPlayerId}
                />
              ))}
            </div>
          </section>
        </aside>

        <section className="hall-panel" aria-live="polite">
          <div className="hall-panel__topline">
            <span>
              제 {state.day || 1}일째 · {state.night}번째 밤
            </span>
            <span className="hall-panel__dot" aria-hidden="true" />
            <span>봉인된 기록 {state.chronicle.length}</span>
          </div>
          <div className="hall-scene">
            <div className="hall-window hall-window--left" aria-hidden="true" />
            <div className="hall-window hall-window--right" aria-hidden="true" />
            <div className="hall-throne" aria-hidden="true">
              <span>♜</span>
            </div>
            <div className="hall-candle hall-candle--left" aria-hidden="true">
              <span />
            </div>
            <div className="hall-candle hall-candle--right" aria-hidden="true">
              <span />
            </div>
            <div className="hall-table" aria-hidden="true">
              <span />
            </div>
            <div className="hall-figure hall-figure--one" aria-hidden="true">
              ♟
            </div>
            <div className="hall-figure hall-figure--two" aria-hidden="true">
              ♟
            </div>
            <div className="hall-figure hall-figure--three" aria-hidden="true">
              ♟
            </div>
            <div className="hall-scene__caption">
              <span className="scene-caption__eyebrow">THE GREAT HALL</span>
              <strong>대연회장</strong>
              <span>비가 성벽을 두드리고 있다</span>
            </div>
          </div>

          <div className="story-block">
            <p className="story-block__eyebrow">{TRIAL_PHASE_LABELS[state.phase]}</p>
            <h2>{state.currentPrompt}</h2>
            <p className="story-block__body">
              {state.phase === "resolution" && state.resolution
                ? state.resolution.text
                : state.phase === "opening-night"
                  ? state.openingAttack.description
                  : state.chronicle.at(-1)}
            </p>
          </div>

          <section className="testimony-list" aria-label="이번 단계 안내">
            <p>준비 밤 → 아침 → 토론 → 고발 → 변론 → 판결 → 밤</p>
            {(state.phase === "night" || state.phase === "opening-night") &&
            state.legalNightTargets.length > 0 ? (
              <div>
                <label>
                  {state.playerRole === "investigator"
                    ? "진영 조사"
                    : state.playerRole === "apothecary"
                      ? "보호"
                      : "습격"}{" "}
                  대상
                  <select
                    value={selectedPlayerId ?? ""}
                    onChange={(event) => setSelectedPlayerId(event.target.value || null)}
                  >
                    <option value="">선택하세요</option>
                    {state.legalNightTargets.map((id) => (
                      <option key={id} value={id}>
                        {getPlayer(state, id)?.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            {state.phase === "debate" ? (
              <>
                <p>
                  조사 주장은 하루 한 번 선택 사항입니다. 침묵해도 됩니다. 실제 역할과 무관하게 사칭
                  가능하며, 발언 후 봇 고발에 반영됩니다.
                </p>
                {!state.observing ? (
                  <div>
                    {state.playerRole === "investigator" ? (
                      <button
                        className="quiet-button"
                        onClick={() => commit(engine.discloseLatestInvestigation())}
                      >
                        최근 조사 결과 그대로 공개
                      </button>
                    ) : null}
                    <label>
                      공개 주장 대상{" "}
                      <select
                        value={claimTarget}
                        onChange={(event) => setClaimTarget(event.target.value)}
                      >
                        <option value="">선택하세요</option>
                        {state.players
                          .filter((p) => p.living && !p.isHuman)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      className="quiet-button"
                      disabled={!claimTarget}
                      onClick={() => commit(engine.claimInvestigation(claimTarget, true))}
                    >
                      집행관 주장: 살인자 결과
                    </button>
                    <button
                      className="quiet-button"
                      disabled={!claimTarget}
                      onClick={() => commit(engine.claimInvestigation(claimTarget, false))}
                    >
                      집행관 주장: 주민 결과
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
            {state.phase === "accusation" ? (
              <>
                <p>
                  각 생존자 1표 · 자기 고발 금지 · 득표 상위 2명이 피고. 동률 우선순위:{" "}
                  {Array.from({ length: 8 }, (_, i) => ((state.seed + state.day + i) % 8) + 1).join(
                    " → ",
                  )}
                  번 좌석. 봇의 선택은 지금 고정되며 당신의 선택을 미리 보지 않습니다.
                </p>
                {state.accusations.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {!state.observing ? (
                  <label>
                    고발 대상{" "}
                    <select
                      value={selectedPlayerId ?? ""}
                      onChange={(event) => setSelectedPlayerId(event.target.value || null)}
                    >
                      <option value="">선택하세요</option>
                      {state.players
                        .filter((p) => p.living && !p.isHuman)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
            {state.phase === "verdict" ? (
              <>
                <p>
                  생존자 {state.players.filter((p) => p.living).length}명 중{" "}
                  {Math.floor(state.players.filter((p) => p.living).length / 2) + 1}표 이상이어야
                  처형합니다. 피고도 투표하며 자기 자신에게 투표할 수 있습니다. 동점·과반수 미달은
                  보류입니다.
                </p>
                <button
                  className="quiet-button"
                  disabled={state.observing}
                  aria-pressed={currentSelection === "pardon"}
                  onClick={() => setSelectedPlayerId("pardon")}
                >
                  처형 보류{currentSelection === "pardon" ? " · 선택됨" : ""}
                </button>
              </>
            ) : null}
            {state.phase === "defendants" && state.defendants.includes(state.playerId) ? (
              <div>
                <p>
                  당신이 피고입니다. 선택형 변론은 기록되지만 무죄 증명이나 봇의 표를 바꾸는
                  보너스가 아닙니다.
                </p>
                <button
                  className="quiet-button"
                  onClick={() => commit(engine.submitDefense("deny"))}
                >
                  혐의 부인
                </button>
                <button
                  className="quiet-button"
                  onClick={() => commit(engine.submitDefense("evidence"))}
                >
                  근거 확인과 보류 요청
                </button>
              </div>
            ) : null}
            {state.accusationVotes.length > 0 ? (
              <p>
                이번 고발 집계:{" "}
                {state.accusationVotes
                  .map((v) => `${getPlayer(state, v.playerId)?.name} ${v.count}표`)
                  .join(" · ")}
              </p>
            ) : null}
            {state.verdictVotes.length > 0 ? (
              <p>
                이번 판결 집계:{" "}
                {state.verdictVotes
                  .map(
                    (v) =>
                      `${v.playerId === "pardon" ? "처형 보류" : getPlayer(state, v.playerId)?.name} ${v.count}표`,
                  )
                  .join(" · ")}
              </p>
            ) : null}
            {state.ballotRecords.length > 0 ? (
              <details>
                <summary>누가 누구에게 투표했나요? 전체 표결 기록</summary>
                {state.ballotRecords.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </details>
            ) : null}
          </section>

          {["debate", "opening-night", "accusation", "defendants", "verdict"].includes(
            state.phase,
          ) ? (
            <div className="testimony-list">
              {state.testimonies.length > 0 ? (
                state.testimonies.map((testimony) => (
                  <TestimonyCard key={testimony.id} testimony={testimony} />
                ))
              ) : (
                <p className="empty-state">
                  공개된 조사 주장이 없습니다. 정보 부족은 유죄의 근거가 아닙니다.
                </p>
              )}
            </div>
          ) : null}

          {state.phase === "defendants" || state.phase === "verdict" ? (
            <div className="defendant-row">
              {defendants.map((defendant) => (
                <button
                  className={`defendant-card${defendant.id === currentSelection ? " defendant-card--selected" : ""}`}
                  type="button"
                  key={defendant.id}
                  disabled={state.observing || state.phase !== "verdict"}
                  onClick={() => setSelectedPlayerId(defendant.id)}
                >
                  <span className="defendant-card__label">
                    피고석 {defendants.indexOf(defendant) + 1}
                  </span>
                  <strong>{defendant.name}</strong>
                  <small>{defendant.title}</small>
                  <span className="defendant-card__line">{state.defenses[defendant.id]}</span>
                </button>
              ))}
            </div>
          ) : null}

          {state.phase === "resolution" || state.phase === "ended" ? (
            <div className={`resolution-card${state.winner ? " resolution-card--final" : ""}`}>
              <span className="resolution-card__seal" aria-hidden="true">
                {state.winner ? "✦" : "§"}
              </span>
              <div>
                <p className="section-label">판결 기록</p>
                <h3>
                  {state.resolution?.text ??
                    (state.winner === "residents"
                      ? "성 안에 평화가 돌아왔다."
                      : "어둠이 승리했다.")}
                </h3>
                <p>
                  {state.winner
                    ? state.winner === "residents"
                      ? "주민들이 성문을 지켰다."
                      : "살인자들이 성의 운명을 움켜쥐었다."
                    : "아직 마지막 장은 닫히지 않았다."}
                </p>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="action-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="hall-actions">
            <button
              className="primary-action"
              type="button"
              onClick={primaryAction}
              disabled={!canAct}
            >
              <span>{actionLabel}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <aside className="side-rail side-rail--right">
          <section className="status-card chronicle-card">
            <div className="section-heading">
              <p className="section-label">성의 연대기</p>
              <span className="wax-seal" aria-hidden="true">
                ✦
              </span>
            </div>
            <ol className="chronicle-list">
              {state.chronicle.map((entry, index) => (
                <li key={`${entry}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{entry}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="status-card role-count-card">
            <p className="section-label">이 재판의 그림자</p>
            <p className="player-note">
              초기 배역 수입니다. 살인자 전원 제거 시 주민 승리, 생존 살인자 수가 주민 이상이면
              살인자 승리. 고발 동점은 공개 좌석 순번으로 결정합니다. 최종 판결은 생존자 과반수 찬성
              필요, 동점·과반수 미달은 처형 없이 밤으로 넘어갑니다. 2인 피고 방식은 이 게임의 고유
              변형입니다.
            </p>
            <div className="role-counts">
              <span>
                <i className="role-dot role-dot--blood" /> 살인자{" "}
                <strong>{MEDIEVAL_TRIAL_V01.roleCount.murderer}</strong>
              </span>
              <span>
                <i className="role-dot role-dot--iron" /> 집행관{" "}
                <strong>{MEDIEVAL_TRIAL_V01.roleCount.investigator}</strong>
              </span>
              <span>
                <i className="role-dot role-dot--herb" /> 약제사{" "}
                <strong>{MEDIEVAL_TRIAL_V01.roleCount.apothecary}</strong>
              </span>
              <span>
                <i className="role-dot role-dot--parchment" /> 평민{" "}
                <strong>{MEDIEVAL_TRIAL_V01.roleCount.commoner}</strong>
              </span>
            </div>
          </section>
        </aside>
      </section>

      <footer className="trial-footer">
        <span>종이 울릴 때마다 진실은 한 겹씩 벗겨진다.</span>
        <span>SEED {state.seed}</span>
      </footer>
    </main>
  );
}
