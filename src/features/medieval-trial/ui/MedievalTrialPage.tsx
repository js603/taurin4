import { useMemo, useState } from "react";
import { GameEngine } from "../application/gameEngine";
import { PHASE_LABELS, ROLE_COUNTS } from "../domain/rules";
import type { GamePhase, GameState, Player, Testimony } from "../domain/types";

const INITIAL_SEED = 20260918;

function phaseActionLabel(phase: GamePhase): string {
  switch (phase) {
    case "opening-night":
      return "대연회장 문 열기";
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

function getPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players.find((player) => player.id === playerId);
}

function formatVotes(state: GameState, playerId: string): string {
  return String(state.accusationVotes.find((vote) => vote.playerId === playerId)?.count ?? 0);
}

function TestimonyCard({ testimony }: { testimony: Testimony }) {
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
  player: Player;
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
  const [engine, setEngine] = useState(() => new GameEngine(INITIAL_SEED));
  const [state, setState] = useState<GameState>(() => engine.getState());
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const human = useMemo(() => getPlayer(state, state.playerId), [state]);
  const defendants = state.defendants
    .map((playerId) => getPlayer(state, playerId))
    .filter((player): player is Player => Boolean(player));
  const currentSelection = selectedPlayerId ?? defendants[0]?.id ?? null;

  function commit(result: { state: GameState; error: string | null }) {
    setState(result.state);
    setError(result.error);
    if (!result.error) setSelectedPlayerId(null);
  }

  function resetGame() {
    const nextEngine = new GameEngine(INITIAL_SEED);
    setEngine(nextEngine);
    setState(nextEngine.getState());
    setSelectedPlayerId(null);
    setError(null);
  }

  function primaryAction() {
    if (state.phase === "opening-night") commit(engine.advanceOpeningNight());
    else if (state.phase === "debate") commit(engine.beginAccusation());
    else if (state.phase === "accusation" && selectedPlayerId)
      commit(engine.submitAccusation(selectedPlayerId));
    else if (state.phase === "defendants") commit(engine.beginVerdict());
    else if (state.phase === "verdict" && currentSelection)
      commit(engine.submitVerdict(currentSelection));
    else if (state.phase === "resolution") commit(engine.continueAfterVerdict());
    else if (state.phase === "ended") resetGame();
  }

  const canAct = state.phase !== "accusation" || selectedPlayerId !== null;
  const actionLabel =
    state.phase === "accusation" && !selectedPlayerId
      ? "고발할 사람을 고르기"
      : phaseActionLabel(state.phase);

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
              <strong>{PHASE_LABELS[state.phase]}</strong>
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
            <p className="player-note">당신의 역할은 아직 다른 이들에게 밝혀지지 않았다.</p>
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
                    (state.phase !== "accusation" && state.phase !== "verdict") || player.isHuman
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
            <p className="story-block__eyebrow">{PHASE_LABELS[state.phase]}</p>
            <h2>{state.currentPrompt}</h2>
            <p className="story-block__body">
              {state.phase === "resolution" && state.resolution
                ? state.resolution.text
                : state.openingAttack.description}
            </p>
          </div>

          {state.phase === "debate" || state.phase === "opening-night" ? (
            <div className="testimony-list">
              {state.testimonies.length > 0 ? (
                state.testimonies.map((testimony) => (
                  <TestimonyCard key={testimony.id} testimony={testimony} />
                ))
              ) : (
                <p className="empty-state">문이 열리면 첫 증언이 기록됩니다.</p>
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
                  onClick={() => setSelectedPlayerId(defendant.id)}
                >
                  <span className="defendant-card__label">
                    피고석 {defendants.indexOf(defendant) + 1}
                  </span>
                  <strong>{defendant.name}</strong>
                  <small>{defendant.title}</small>
                  <span className="defendant-card__line">최후 변론을 기다리는 중</span>
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
                    (state.winner === "commoners"
                      ? "성 안에 평화가 돌아왔다."
                      : "어둠이 승리했다.")}
                </h3>
                <p>
                  {state.winner
                    ? state.winner === "commoners"
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
              {state.chronicle.slice(-5).map((entry, index) => (
                <li key={`${entry}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{entry}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="status-card role-count-card">
            <p className="section-label">이 재판의 그림자</p>
            <div className="role-counts">
              <span>
                <i className="role-dot role-dot--blood" /> 살인자{" "}
                <strong>{ROLE_COUNTS.murderer}</strong>
              </span>
              <span>
                <i className="role-dot role-dot--iron" /> 집행관{" "}
                <strong>{ROLE_COUNTS.bailiff}</strong>
              </span>
              <span>
                <i className="role-dot role-dot--herb" /> 약제사{" "}
                <strong>{ROLE_COUNTS.apothecary}</strong>
              </span>
              <span>
                <i className="role-dot role-dot--parchment" /> 평민{" "}
                <strong>{ROLE_COUNTS.commoner}</strong>
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
