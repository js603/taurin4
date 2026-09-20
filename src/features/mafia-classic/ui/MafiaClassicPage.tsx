import { useEffect, useMemo, useState } from "react";
import {
  accusePlayer,
  acknowledgeRole,
  beginVerdictVote,
  completeSunrise,
  continueAfterNight,
  continueAfterVerdict,
  continueDiscussion,
  createSoloMafiaSession,
  humanIsAlive,
  humanRole,
  humanStatement,
  legalHumanNightTargets,
  letBotAccuse,
  livingPlayers,
  mafiaTeammatesForHuman,
  proposeNight,
  publicKnownMafiaCount,
  resolveNightProposal,
  resolveVerdictVote,
  submitHumanDefense,
  submitNightNote,
  type HumanStatement,
  type SoloMafiaSession,
  type SoloPhase,
} from "../application/soloSession";
import "./mafiaClassic.css";

const STORAGE_KEY = "taurin4.mafia.solo.v2";

const PHASE_LABELS: Record<SoloPhase, string> = {
  "role-card": "비밀 카드",
  sunrise: "SUNRISE",
  discussion: "자유 토론",
  defense: "고발 · 변론",
  vote: "비밀 표결",
  verdict: "표결 결과",
  "night-vote": "Mafia Night 제안",
  "night-note": "Mafia Night",
  "night-result": "밤의 결과",
  ended: "라운드 종료",
};

function loadSavedSession(): SoloMafiaSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; session?: SoloMafiaSession };
    if (parsed.version !== 2 || !parsed.session?.core?.players?.length) return null;
    return parsed.session;
  } catch {
    return null;
  }
}

function playerName(state: SoloMafiaSession, id: string | null): string {
  if (!id) return "";
  return state.core.players.find((player) => player.id === id)?.name ?? "";
}

function publicPhaseCopy(state: SoloMafiaSession): string {
  if (state.phase === "discussion") {
    return "지금은 누구든 질문하고, 의심하고, 고발하거나 Mafia Night를 제안할 수 있습니다.";
  }
  if (state.phase === "defense") {
    return "고발이 성립했습니다. 피고의 변론이 끝난 뒤 피고를 제외한 생존자가 표결합니다.";
  }
  if (state.phase === "vote") {
    return "표는 비공개입니다. 결과가 공개되기 전까지 다른 사람의 선택을 알 수 없습니다.";
  }
  if (state.phase === "night-vote") {
    return "Mafia Night는 자동으로 시작되지 않습니다. 생존자 과반이 동의해야 합니다.";
  }
  if (state.phase === "night-note") {
    return "Honest는 HONEST를, Mafia는 제거할 한 사람의 이름을 비밀리에 적습니다.";
  }
  return state.notice ?? "";
}

export function MafiaClassicPage() {
  const [nickname, setNickname] = useState("당신");
  const [playerCount, setPlayerCount] = useState(6);
  const [session, setSession] = useState<SoloMafiaSession | null>(() => loadSavedSession());
  const [roleOpen, setRoleOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [nightTargetId, setNightTargetId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, session }));
  }, [session]);

  const living = useMemo(() => (session ? livingPlayers(session) : []), [session]);
  const human = session?.core.players.find((player) => player.id === session.humanId) ?? null;
  const selectedTarget =
    session?.core.players.find((player) => player.id === targetId && player.alive) ?? null;

  function startGame() {
    try {
      const next = createSoloMafiaSession(nickname, playerCount);
      setSession(next);
      setRoleOpen(false);
      setTargetId("");
      setNightTargetId("");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "게임을 시작하지 못했습니다.");
    }
  }

  function resetGame() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setRoleOpen(false);
    setTargetId("");
    setNightTargetId("");
    setError("");
  }

  function update(next: SoloMafiaSession) {
    setSession(next);
    setError("");
  }

  function actStatement(kind: HumanStatement) {
    if (!session || !targetId) return;
    update(humanStatement(session, targetId, kind));
  }

  if (!session) {
    return (
      <main className="mafia-root mafia-setup">
        <section className="mafia-title-block">
          <p className="eyebrow">DIMMA DAVIDOFF · ORIGINAL RULES</p>
          <h1>MAFIA</h1>
          <p className="lead">
            한 명의 사람과 다섯 명 이상의 AI가 같은 테이블에 앉습니다.
            특수직업도, 역할 공개도, 인공 증거도 없습니다.
          </p>
        </section>

        <section className="setup-card">
          <div className="mode-badge">
            <span>PLAYTEST MODE</span>
            <strong>1 HUMAN + AI TABLE</strong>
          </div>

          <label className="field-label">
            당신의 이름
            <input
              value={nickname}
              maxLength={16}
              onChange={(event) => setNickname(event.target.value)}
            />
          </label>

          <label className="field-label">
            총 플레이어 수
            <select
              value={playerCount}
              onChange={(event) => setPlayerCount(Number(event.target.value))}
            >
              {[6, 7, 8, 9, 10].map((count) => (
                <option value={count} key={count}>
                  {count}명
                </option>
              ))}
            </select>
          </label>

          <div className="rule-summary">
            <strong>이 모드가 지키는 것</strong>
            <p>
              Mafia는 서로를 알고, Honest는 아무도 모릅니다. 낮에는 말과 고발,
              밤에는 종이 한 장뿐입니다. 죽은 사람의 정체는 끝까지 공개되지 않습니다.
            </p>
          </div>

          {error ? <p className="error-copy">{error}</p> : null}

          <button className="primary-action wide" onClick={startGame}>
            카드를 섞고 테이블에 앉기
          </button>
        </section>
      </main>
    );
  }

  if (!human) return null;

  if (session.phase === "role-card") {
    return (
      <main className="mafia-root private-stage">
        <section className="private-card-shell">
          <p className="eyebrow">PRIVATE · ONLY YOU</p>
          {!roleOpen ? (
            <>
              <h1>{human.name}</h1>
              <p className="private-help">
                이 화면은 당신만 보세요. 역할 확인 후에는 카드가 다시 가려집니다.
              </p>
              <button className="primary-action" onClick={() => setRoleOpen(true)}>
                내 카드 뒤집기
              </button>
            </>
          ) : (
            <>
              <div
                className={
                  "identity-card " +
                  (human.alignment === "mafia" ? "identity-card--black" : "identity-card--red")
                }
              >
                <span>{human.alignment === "mafia" ? "BLACK CARD" : "RED CARD"}</span>
                <strong>{human.alignment === "mafia" ? "MAFIA" : "HONEST"}</strong>
              </div>
              <p className="private-help">
                {human.alignment === "mafia"
                  ? "아직 동료의 이름은 공개되지 않습니다. Sunrise에서 서로를 확인합니다."
                  : "당신은 자신의 결백 외에는 아무 정보도 갖고 있지 않습니다."}
              </p>
              <button
                className="primary-action"
                onClick={() => {
                  setRoleOpen(false);
                  update(acknowledgeRole(session));
                }}
              >
                카드 덮기 · Sunrise
              </button>
            </>
          )}
        </section>
      </main>
    );
  }

  if (session.phase === "sunrise") {
    const teammates = mafiaTeammatesForHuman(session);
    return (
      <main className="mafia-root private-stage sunrise-stage-v2">
        <section className="private-card-shell sunrise-shell">
          <p className="eyebrow">SUNRISE · 1—20</p>
          <h1>모두 고개를 숙입니다.</h1>
          <div className="sunrise-sequence">
            <span>1 · 2 · 3 · 4 · 5</span>
            <strong>6 — 15 · SILENT</strong>
            <span>16 · 17 · 18 · 19 · 20</span>
          </div>

          {human.alignment === "mafia" ? (
            <div className="secret-team">
              <span>당신이 확인한 Mafia</span>
              <strong>{teammates.map((player) => player.name).join(", ")}</strong>
              <p>이 정보는 당신과 Mafia만 압니다. 공개적으로 드러내지 마세요.</p>
            </div>
          ) : (
            <div className="secret-team honest-wait">
              <span>HONEST</span>
              <strong>눈을 감고 기다립니다.</strong>
              <p>누가 눈을 떴는지는 알 수 없습니다.</p>
            </div>
          )}

          <button className="primary-action" onClick={() => update(completeSunrise(session))}>
            20 · 모두 눈을 뜬다
          </button>
        </section>
      </main>
    );
  }

  const humanAlive = humanIsAlive(session);
  const accusedName = playerName(session, session.pendingAccusedId);
  const accuserName = playerName(session, session.pendingAccuserId);
  const humanIsAccused = session.pendingAccusedId === session.humanId;
  const humanCanVote =
    session.phase === "vote" && humanAlive && session.pendingAccusedId !== session.humanId;
  const knownMafia = publicKnownMafiaCount(session);

  return (
    <main className="mafia-root table-stage">
      <header className="table-header">
        <div>
          <p className="eyebrow">ORIGINAL MAFIA · SOLO TABLE V2</p>
          <h1>DAY {session.core.day}</h1>
        </div>
        <div className="header-state">
          <span>{PHASE_LABELS[session.phase]}</span>
          <strong>{living.length} ALIVE</strong>
        </div>
      </header>

      <section className="public-strip">
        <div>
          <span>공개 정보</span>
          <strong>
            {session.lastNight
              ? "확인된 생존 Mafia " + knownMafia + "명"
              : "초기 Black Card " + knownMafia + "장"}
          </strong>
        </div>
        <div>
          <span>내 상태</span>
          <strong>{humanAlive ? "생존" : "제거됨 · 관전"}</strong>
        </div>
        <details className="my-card-peek">
          <summary>내 카드</summary>
          <strong className={human.alignment === "mafia" ? "role-black" : "role-red"}>
            {human.alignment === "mafia" ? "MAFIA" : "HONEST"}
          </strong>
        </details>
      </section>

      <section className="seat-rail" aria-label="플레이어 상태">
        {session.core.players.map((player, index) => (
          <button
            type="button"
            key={player.id}
            className={
              "seat-chip " +
              (!player.alive ? "seat-chip--dead " : "") +
              (player.id === session.humanId ? "seat-chip--human " : "") +
              (targetId === player.id ? "seat-chip--selected" : "")
            }
            disabled={!player.alive || player.id === session.humanId}
            onClick={() => setTargetId(player.id)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{player.name}</strong>
            <small>
              {player.alive
                ? player.id === session.humanId
                  ? "YOU"
                  : session.personas[player.id]?.label ?? "PLAYER"
                : "OUT · ROLE HIDDEN"}
            </small>
          </button>
        ))}
      </section>

      <section className="game-surface">
        <div className="phase-context">
          <span>{PHASE_LABELS[session.phase]}</span>
          <h2>
            {session.phase === "discussion"
              ? "누구를 믿을 것인가."
              : session.phase === "defense"
                ? accusedName + "의 변론"
                : session.phase === "vote"
                  ? accusedName + "에 대한 표결"
                  : session.phase === "verdict"
                    ? "표가 공개되었습니다."
                    : session.phase === "night-vote"
                      ? "밤을 열 것인가."
                      : session.phase === "night-note"
                        ? "종이 한 장에 적으세요."
                        : session.phase === "night-result"
                          ? "쪽지를 펼칩니다."
                          : "라운드가 끝났습니다."}
          </h2>
          <p>{session.notice ?? publicPhaseCopy(session)}</p>
        </div>

        <div className="conversation" aria-live="polite">
          {session.talk.slice(-12).map((line) => (
            <article className={"talk-line talk-line--" + line.tone} key={line.id}>
              <div className="speaker-mark">
                <span>{line.speakerId ? "P" : "•"}</span>
              </div>
              <div>
                <strong>{line.speakerName}</strong>
                <p>{line.text}</p>
              </div>
            </article>
          ))}
        </div>

        {session.phase === "discussion" ? (
          <section className="action-dock">
            {humanAlive ? (
              <>
                <div className="selected-target">
                  <span>대상</span>
                  <strong>{selectedTarget?.name ?? "좌석을 선택하세요"}</strong>
                </div>
                <div className="action-row">
                  <button
                    className="soft-action"
                    disabled={!selectedTarget}
                    onClick={() => actStatement("question")}
                  >
                    질문한다
                  </button>
                  <button
                    className="soft-action"
                    disabled={!selectedTarget}
                    onClick={() => actStatement("defend")}
                  >
                    아직 이르다
                  </button>
                  <button
                    className="pressure-action"
                    disabled={!selectedTarget}
                    onClick={() => actStatement("suspect")}
                  >
                    의심한다
                  </button>
                  <button
                    className="danger-action"
                    disabled={!selectedTarget}
                    onClick={() => selectedTarget && update(accusePlayer(session, selectedTarget.id))}
                  >
                    고발한다
                  </button>
                </div>
              </>
            ) : (
              <p className="spectator-note">
                당신은 제거되어 말하거나 표결할 수 없습니다. 남은 플레이어의 행동만 관전합니다.
              </p>
            )}

            <div className="secondary-actions">
              <button className="text-action" onClick={() => update(continueDiscussion(session))}>
                토론을 더 듣는다
              </button>
              <button className="text-action" onClick={() => update(letBotAccuse(session))}>
                다른 사람의 고발을 듣는다
              </button>
              <button className="night-action" onClick={() => update(proposeNight(session))}>
                Mafia Night 제안
              </button>
            </div>
          </section>
        ) : null}

        {session.phase === "defense" ? (
          <section className="decision-card">
            <p>
              <strong>{accuserName}</strong>이(가) <strong>{accusedName}</strong>을(를) 고발했습니다.
            </p>
            {humanIsAccused && humanAlive ? (
              <div className="action-row">
                <button
                  className="soft-action"
                  onClick={() => update(submitHumanDefense(session, "deny"))}
                >
                  정면 부인
                </button>
                <button
                  className="pressure-action"
                  onClick={() => update(submitHumanDefense(session, "counter"))}
                >
                  고발 흐름 반박
                </button>
              </div>
            ) : null}
            <button className="primary-action" onClick={() => update(beginVerdictVote(session))}>
              변론 종료 · 비밀 표결
            </button>
          </section>
        ) : null}

        {session.phase === "vote" ? (
          <section className="decision-card vote-focus">
            <span className="decision-kicker">PRIVATE BALLOT</span>
            <h3>{accusedName}</h3>
            <p>
              제거 기준은 피고를 제외한 생존자 과반입니다.
              다른 플레이어의 선택은 결과 공개 전까지 보이지 않습니다.
            </p>
            {humanCanVote ? (
              <div className="action-row">
                <button className="danger-action" onClick={() => update(resolveVerdictVote(session, true))}>
                  GUILTY · 제거 찬성
                </button>
                <button className="soft-action" onClick={() => update(resolveVerdictVote(session, false))}>
                  NOT GUILTY · 반대
                </button>
              </div>
            ) : (
              <button className="primary-action" onClick={() => update(resolveVerdictVote(session, null))}>
                나는 투표권 없음 · 결과 공개
              </button>
            )}
          </section>
        ) : null}

        {session.phase === "verdict" && session.lastVote ? (
          <section className={"result-card " + (session.lastVote.executed ? "result-card--danger" : "")}>
            <span>VERDICT</span>
            <h3>
              {session.lastVote.guiltyVotes}/{session.lastVote.eligibleVotes}
            </h3>
            <p>
              과반 기준 {session.lastVote.threshold}표 ·{" "}
              {session.lastVote.executed
                ? session.lastVote.accusedName + " 제거"
                : "과반 미달 · 고발 기각"}
            </p>
            <strong>정체는 공개되지 않습니다.</strong>
            <button className="primary-action" onClick={() => update(continueAfterVerdict(session))}>
              낮의 토론으로 돌아가기
            </button>
          </section>
        ) : null}

        {session.phase === "night-vote" ? (
          <section className="decision-card night-decision">
            <span className="decision-kicker">MAFIA NIGHT PROPOSAL</span>
            <p>생존자 과반이 동의해야만 밤의 쪽지를 펼칠 수 있습니다.</p>
            {humanAlive ? (
              <div className="action-row">
                <button className="night-action" onClick={() => update(resolveNightProposal(session, true))}>
                  NIGHT 동의
                </button>
                <button className="soft-action" onClick={() => update(resolveNightProposal(session, false))}>
                  아직 낮을 계속한다
                </button>
              </div>
            ) : (
              <button className="primary-action" onClick={() => update(resolveNightProposal(session, null))}>
                남은 생존자의 표결 보기
              </button>
            )}
          </section>
        ) : null}

        {session.phase === "night-note" ? (
          <section className="decision-card night-note-card">
            <span className="decision-kicker">SEALED NOTE</span>
            {humanAlive && humanRole(session) === "mafia" ? (
              <>
                <h3>한 사람의 이름</h3>
                <p>
                  다른 Mafia도 각자 한 이름을 적습니다. 모든 Mafia가 같은 사람을 적어야 살인이 성립합니다.
                </p>
                <select
                  value={nightTargetId}
                  onChange={(event) => setNightTargetId(event.target.value)}
                >
                  <option value="">표적 선택</option>
                  {legalHumanNightTargets(session).map((player) => (
                    <option value={player.id} key={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
                <button
                  className="danger-action"
                  disabled={!nightTargetId}
                  onClick={() => update(submitNightNote(session, nightTargetId))}
                >
                  이름을 적고 봉인
                </button>
              </>
            ) : (
              <>
                <div className="honest-note">HONEST</div>
                <p>
                  {humanAlive
                    ? "당신에게 선택지는 없습니다. HONEST라고 적힌 쪽지를 봉인합니다."
                    : "당신은 제거되어 쪽지를 제출하지 않습니다. 남은 생존자의 쪽지만 집계됩니다."}
                </p>
                <button className="primary-action" onClick={() => update(submitNightNote(session, null))}>
                  {humanAlive ? "HONEST 쪽지 봉인" : "밤의 쪽지 집계"}
                </button>
              </>
            )}
          </section>
        ) : null}

        {session.phase === "night-result" && session.lastNight ? (
          <section className="result-card night-result-card">
            <span>MAFIA NIGHT</span>
            <h3>{session.lastNight.shotCount} SHOTS</h3>
            <p>
              {session.lastNight.shotCount === 0
                ? "총성이 없습니다."
                : session.lastNight.unanimous
                  ? "모든 Mafia 쪽지가 같은 이름을 가리켰습니다."
                  : "Mafia 쪽지의 이름이 갈렸습니다."}
            </p>
            {session.lastNight.murderedPlayerName ? (
              <strong>{session.lastNight.murderedPlayerName} 제거 · 정체 비공개</strong>
            ) : (
              <strong>이번 밤에는 아무도 제거되지 않았습니다.</strong>
            )}
            <button className="primary-action" onClick={() => update(continueAfterNight(session))}>
              다음 낮
            </button>
          </section>
        ) : null}

        {session.phase === "ended" ? (
          <section className="result-card final-result">
            <span>ROUND OVER</span>
            <h3>{session.core.winner === "honest" ? "HONEST WINS" : "MAFIA WINS"}</h3>
            <p>
              이제 모든 카드가 공개됩니다. 라운드 중에는 확인할 수 없었던 정체입니다.
            </p>
            <div className="final-reveal">
              {session.core.players.map((player) => (
                <div key={player.id}>
                  <strong>{player.name}</strong>
                  <span className={player.alignment === "mafia" ? "role-black" : "role-red"}>
                    {player.alignment === "mafia" ? "MAFIA" : "HONEST"}
                  </span>
                </div>
              ))}
            </div>
            <button className="primary-action" onClick={resetGame}>
              새 라운드
            </button>
          </section>
        ) : null}
      </section>

      <details className="chronicle-drawer">
        <summary>공개 기록 보기 · {session.core.log.length}건</summary>
        <ol>
          {[...session.core.log].reverse().map((entry) => (
            <li key={entry.id}>
              <span>D{entry.day}</span>
              <p>{entry.text}</p>
            </li>
          ))}
        </ol>
      </details>

      <footer className="table-footer">
        <span>RULE LOCK · DAVIDOFF ORIGINAL</span>
        <button className="text-action danger-text" onClick={resetGame}>
          라운드 초기화
        </button>
      </footer>
    </main>
  );
}
