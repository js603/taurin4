import { useMemo, useState } from "react";
import {
  alivePlayers,
  beginDay,
  beginNight,
  beginSunrise,
  createOriginalMafiaGame,
  mafiaCountForPlayerCount,
  nightProposalPasses,
  requiredMajority,
  resolveDayExecution,
  resolveMafiaNight,
  type MafiaGameState,
  type MafiaPlayer,
} from "../application/mafiaEngine";
import "./mafiaClassic.css";

type DayAction = "accusation" | "night-proposal" | null;

const defaultNames = ["JS", "MINHO", "SOYOUNG", "JUN", "HANA", "DOYUN"];

function phaseTitle(game: MafiaGameState): string {
  if (game.phase === "role-reveal") return "비밀 배역 확인";
  if (game.phase === "sunrise") return "SUNRISE";
  if (game.phase === "night-notes") return "MAFIA NIGHT";
  if (game.phase === "game-over") return "게임 종료";
  return "DAY " + game.day;
}

function playerLabel(player: MafiaPlayer): string {
  return player.alive ? "생존" : "제거됨 · 정체 비공개";
}

export function MafiaClassicPage() {
  const [names, setNames] = useState(defaultNames);
  const [game, setGame] = useState<MafiaGameState | null>(null);
  const [error, setError] = useState("");
  const [revealIndex, setRevealIndex] = useState(0);
  const [roleOpen, setRoleOpen] = useState(false);
  const [dayAction, setDayAction] = useState<DayAction>(null);
  const [accuserId, setAccuserId] = useState("");
  const [accusedId, setAccusedId] = useState("");
  const [voteIndex, setVoteIndex] = useState(0);
  const [votes, setVotes] = useState<boolean[]>([]);
  const [proposalProposerId, setProposalProposerId] = useState("");
  const [nightIndex, setNightIndex] = useState(0);
  const [nightOpen, setNightOpen] = useState(false);
  const [nightTargetId, setNightTargetId] = useState("");
  const [nightTargets, setNightTargets] = useState<Record<string, string>>({});
  const [lastReveal, setLastReveal] = useState("");

  const living = useMemo(() => (game ? alivePlayers(game) : []), [game]);
  const eligibleDayVoters = useMemo(
    () => living.filter((player) => player.id !== accusedId),
    [living, accusedId],
  );

  function resetTransient() {
    setDayAction(null);
    setAccuserId("");
    setAccusedId("");
    setVoteIndex(0);
    setVotes([]);
    setProposalProposerId("");
    setNightIndex(0);
    setNightOpen(false);
    setNightTargetId("");
    setNightTargets({});
  }

  function startGame() {
    try {
      setGame(createOriginalMafiaGame(names));
      setRevealIndex(0);
      setRoleOpen(false);
      setLastReveal("");
      setError("");
      resetTransient();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "게임을 시작하지 못했습니다.");
    }
  }

  function updateName(index: number, value: string) {
    setNames((current) => current.map((name, i) => (i === index ? value : name)));
  }

  function addPlayer() {
    if (names.length >= 16) return;
    setNames((current) => [...current, "PLAYER " + (current.length + 1)]);
  }

  function removePlayer(index: number) {
    if (names.length <= 6) return;
    setNames((current) => current.filter((_, i) => i !== index));
  }

  function finishRoleReveal() {
    if (!game) return;
    if (revealIndex >= game.players.length - 1) {
      setGame(beginSunrise(game));
      setRoleOpen(false);
      return;
    }
    setRevealIndex((value) => value + 1);
    setRoleOpen(false);
  }

  function beginAccusation() {
    const first = living[0]?.id ?? "";
    const second = living[1]?.id ?? "";
    setDayAction("accusation");
    setAccuserId(first);
    setAccusedId(second);
    setVoteIndex(0);
    setVotes([]);
    setLastReveal("");
  }

  function beginNightProposal() {
    setDayAction("night-proposal");
    setProposalProposerId(living[0]?.id ?? "");
    setVoteIndex(0);
    setVotes([]);
    setLastReveal("");
  }

  function castAccusationVote(guilty: boolean) {
    if (!game || !accusedId) return;
    const nextVotes = [...votes, guilty];
    const nextIndex = voteIndex + 1;
    if (nextIndex < eligibleDayVoters.length) {
      setVotes(nextVotes);
      setVoteIndex(nextIndex);
      return;
    }

    const guiltyVotes = nextVotes.filter(Boolean).length;
    const result = resolveDayExecution(game, accusedId, guiltyVotes);
    setGame(result.state);
    setLastReveal(
      result.executed
        ? "과반 판결 성립. 피고는 제거되었지만 정체는 공개되지 않습니다."
        : "과반 미달. 고발은 기각되고 토론이 계속됩니다.",
    );
    resetTransient();
  }

  function castNightProposalVote(agree: boolean) {
    if (!game) return;
    const nextVotes = [...votes, agree];
    const nextIndex = voteIndex + 1;
    if (nextIndex < living.length) {
      setVotes(nextVotes);
      setVoteIndex(nextIndex);
      return;
    }

    const yesVotes = nextVotes.filter(Boolean).length;
    if (nightProposalPasses(game, yesVotes)) {
      setGame(beginNight(game));
      setLastReveal("과반 동의. 종이와 연필을 준비하십시오.");
      resetTransient();
      return;
    }

    setLastReveal("Mafia Night 제안이 과반을 얻지 못했습니다.");
    resetTransient();
  }

  function submitNightNote() {
    if (!game) return;
    const currentPlayer = living[nightIndex];
    if (!currentPlayer) return;

    const nextTargets = { ...nightTargets };
    if (currentPlayer.alignment === "mafia") {
      if (!nightTargetId) return;
      nextTargets[currentPlayer.id] = nightTargetId;
    }

    const nextIndex = nightIndex + 1;
    if (nextIndex < living.length) {
      setNightTargets(nextTargets);
      setNightIndex(nextIndex);
      setNightOpen(false);
      setNightTargetId("");
      return;
    }

    try {
      const result = resolveMafiaNight(game, nextTargets);
      setGame(result.state);
      if (result.shotCount === 0) {
        setLastReveal("총성 0. 살아 있는 Mafia는 없습니다.");
      } else if (result.unanimous) {
        const murdered = game.players.find((player) => player.id === result.murderedPlayerId);
        setLastReveal(
          result.shotCount +
            "발의 총성이 한 사람을 향했습니다. " +
            (murdered?.name ?? "누군가") +
            "이(가) 쓰러졌습니다.",
        );
      } else {
        setLastReveal(
          result.shotCount + "발의 총성이 확인됐지만 표적이 갈려 아무도 죽지 않았습니다.",
        );
      }
      setNightTargets({});
      setNightIndex(0);
      setNightOpen(false);
      setNightTargetId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mafia Night 처리에 실패했습니다.");
    }
  }

  if (!game) {
    const mafiaCount = names.length >= 6 && names.length <= 16 ? mafiaCountForPlayerCount(names.length) : 0;
    return (
      <main className="mafia-app mafia-app--setup">
        <section className="mafia-hero">
          <p className="mafia-kicker">DIMMA DAVIDOFF · ORIGINAL RULES</p>
          <h1>MAFIA</h1>
          <p>
            아는 소수와 모르는 다수. 특수직업도, 역할 공개도 없습니다.
            말과 표정, 그리고 과반수만 남습니다.
          </p>
        </section>

        <section className="mafia-panel setup-panel">
          <div className="panel-heading">
            <div>
              <span>PLAYERS</span>
              <h2>{names.length}명 · Mafia {mafiaCount}명</h2>
            </div>
            <button className="ghost-button" onClick={addPlayer} disabled={names.length >= 16}>
              + 인원 추가
            </button>
          </div>

          <div className="name-grid">
            {names.map((name, index) => (
              <div className="name-row" key={"setup-" + index}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <input
                  value={name}
                  onChange={(event) => updateName(index, event.target.value)}
                  aria-label={"플레이어 " + (index + 1)}
                />
                <button
                  className="remove-button"
                  onClick={() => removePlayer(index)}
                  disabled={names.length <= 6}
                  aria-label={name + " 삭제"}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {error ? <p className="mafia-error">{error}</p> : null}

          <button className="danger-button danger-button--wide" onClick={startGame}>
            검은 카드 섞기
          </button>

          <p className="rule-note">
            원작 인원 배분: 6–7명 2 Mafia · 8–10명 3 · 11–13명 4 · 14–16명 5
          </p>
        </section>
      </main>
    );
  }

  if (game.phase === "role-reveal") {
    const current = game.players[revealIndex]!;
    const mafiaNames = game.players
      .filter((player) => player.alignment === "mafia" && player.id !== current.id)
      .map((player) => player.name);

    return (
      <main className="mafia-app centered-stage">
        <section className="secret-card">
          <p className="mafia-kicker">PRIVATE · {revealIndex + 1}/{game.players.length}</p>
          {!roleOpen ? (
            <>
              <h1>{current.name}</h1>
              <p>다른 사람에게 화면을 넘기기 전에 본인만 보고 있는지 확인하세요.</p>
              <button className="danger-button" onClick={() => setRoleOpen(true)}>
                내 카드 확인
              </button>
            </>
          ) : (
            <>
              <div className={"role-card " + (current.alignment === "mafia" ? "role-card--black" : "role-card--red")}>
                <span>{current.alignment === "mafia" ? "BLACK CARD" : "RED CARD"}</span>
                <strong>{current.alignment === "mafia" ? "MAFIA" : "HONEST"}</strong>
              </div>
              <p className="secret-copy">
                {current.alignment === "mafia"
                  ? "당신은 Mafia입니다. 동료: " + mafiaNames.join(", ")
                  : "당신은 Honest입니다. 다른 누구의 정체도 알 수 없습니다."}
              </p>
              <button className="danger-button" onClick={finishRoleReveal}>
                카드 숨기고 다음
              </button>
            </>
          )}
        </section>
      </main>
    );
  }

  if (game.phase === "sunrise") {
    return (
      <main className="mafia-app centered-stage sunrise-stage">
        <section className="ritual-card">
          <p className="mafia-kicker">SUNRISE RITUAL</p>
          <h1>1 · 2 · 3 · 4 · 5</h1>
          <div className="silent-count">6 — 15 · SILENT</div>
          <h1>16 · 17 · 18 · 19 · 20</h1>
          <p>
            모두 눈을 감습니다. 6부터 15 사이에는 Mafia만 눈을 떠 서로를 확인합니다.
            20에 모두 눈을 뜹니다.
          </p>
          <button className="danger-button" onClick={() => setGame(beginDay(game))}>
            20 · 모두 눈을 뜬다
          </button>
        </section>
      </main>
    );
  }

  if (game.phase === "night-notes") {
    const current = living[nightIndex];
    if (!current) return null;

    return (
      <main className="mafia-app centered-stage night-stage">
        <section className="secret-card">
          <p className="mafia-kicker">MAFIA NIGHT · NOTE {nightIndex + 1}/{living.length}</p>
          {!nightOpen ? (
            <>
              <h1>{current.name}</h1>
              <p>쪽지는 반드시 혼자 확인하고 작성합니다.</p>
              <button className="danger-button" onClick={() => setNightOpen(true)}>
                쪽지 펼치기
              </button>
            </>
          ) : current.alignment === "honest" ? (
            <>
              <div className="paper-note paper-note--honest">HONEST</div>
              <p>원작 규칙에 따라 Honest는 쪽지에 HONEST만 적습니다.</p>
              <button className="danger-button" onClick={submitNightNote}>
                접어서 봉인
              </button>
            </>
          ) : (
            <>
              <div className="paper-note paper-note--mafia">TARGET</div>
              <p>살아 있는 한 사람의 이름을 적으십시오. 모든 Mafia가 같은 이름을 써야 살인이 성립합니다.</p>
              <select
                className="mafia-select"
                value={nightTargetId}
                onChange={(event) => setNightTargetId(event.target.value)}
              >
                <option value="">표적 선택</option>
                {living.map((player) => (
                  <option value={player.id} key={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
              <button className="danger-button" onClick={submitNightNote} disabled={!nightTargetId}>
                접어서 봉인
              </button>
            </>
          )}
        </section>
      </main>
    );
  }

  if (game.phase === "game-over") {
    return (
      <main className="mafia-app centered-stage game-over-stage">
        <section className="mafia-panel end-panel">
          <p className="mafia-kicker">THE ROUND IS OVER</p>
          <h1>{game.winner === "honest" ? "HONEST WINS" : "MAFIA WINS"}</h1>
          <p>{lastReveal}</p>
          <div className="reveal-grid">
            {game.players.map((player) => (
              <div className={"reveal-row " + (player.alignment === "mafia" ? "is-mafia" : "")} key={player.id}>
                <strong>{player.name}</strong>
                <span>{player.alignment === "mafia" ? "BLACK · MAFIA" : "RED · HONEST"}</span>
              </div>
            ))}
          </div>
          <button
            className="danger-button"
            onClick={() => {
              setGame(null);
              setError("");
              setLastReveal("");
              resetTransient();
            }}
          >
            새 라운드
          </button>
        </section>
      </main>
    );
  }

  const currentDayVoter = dayAction === "accusation" ? eligibleDayVoters[voteIndex] : living[voteIndex];
  const accused = game.players.find((player) => player.id === accusedId);

  return (
    <main className="mafia-app">
      <header className="mafia-header">
        <div>
          <p className="mafia-kicker">ORIGINAL MAFIA · NO POWER ROLES</p>
          <h1>{phaseTitle(game)}</h1>
        </div>
        <div className="heartbeat" aria-label="긴장도 연출">
          <span />
          <strong>{living.length} ALIVE</strong>
        </div>
      </header>

      <div className="mafia-layout">
        <aside className="mafia-panel roster-panel">
          <div className="panel-heading">
            <div>
              <span>TABLE</span>
              <h2>생존자</h2>
            </div>
          </div>
          <div className="roster-list">
            {game.players.map((player, index) => (
              <div className={"roster-row " + (!player.alive ? "is-dead" : "")} key={player.id}>
                <span className="seat-number">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{player.name}</strong>
                  <small>{playerLabel(player)}</small>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="mafia-panel discussion-panel">
          <div className="phase-banner">
            <span>DAY {game.day}</span>
            <h2>말이 증거다.</h2>
            <p>사망자의 정체는 공개되지 않습니다. 확신도, 침묵도, 거짓말도 모두 판단 재료입니다.</p>
          </div>

          {lastReveal ? <div className="reveal-strip">{lastReveal}</div> : null}

          {!dayAction ? (
            <div className="day-actions">
              <button className="danger-button" onClick={beginAccusation}>
                누군가를 고발한다
              </button>
              <button className="night-button" onClick={beginNightProposal}>
                Mafia Night를 제안한다
              </button>
            </div>
          ) : null}

          {dayAction === "accusation" && voteIndex === -1 ? (
            <div className="action-card">
              <span className="action-label">ACCUSATION</span>
              <label>
                고발자
                <select value={accuserId} onChange={(event) => setAccuserId(event.target.value)}>
                  {living.map((player) => (
                    <option value={player.id} key={player.id}>{player.name}</option>
                  ))}
                </select>
              </label>
              <label>
                피고
                <select value={accusedId} onChange={(event) => setAccusedId(event.target.value)}>
                  {living
                    .filter((player) => player.id !== accuserId)
                    .map((player) => (
                      <option value={player.id} key={player.id}>{player.name}</option>
                    ))}
                </select>
              </label>
              <p>
                피고는 변론할 권리가 있습니다. 준비가 끝나면 피고를 제외한 생존자 전원이 비밀 표결합니다.
              </p>
              <button
                className="danger-button"
                onClick={() => {
                  if (!accusedId || accusedId === accuserId) return;
                  setVoteIndex(0);
                  setVotes([]);
                }}
              >
                변론 종료 · 표결 시작
              </button>
              <button className="text-button" onClick={() => setDayAction(null)}>취소</button>
            </div>
          ) : null}

          {dayAction === "accusation" && accused && currentDayVoter ? (
            <div className="vote-card">
              <p className="mafia-kicker">PRIVATE VOTE · {voteIndex + 1}/{eligibleDayVoters.length}</p>
              <h2>{currentDayVoter.name}</h2>
              <p>
                {accused.name}을(를) Mafia로 보고 제거하는 데 동의합니까?
                과반 기준은 {requiredMajority(eligibleDayVoters.length)}표입니다.
              </p>
              <div className="split-actions">
                <button className="danger-button" onClick={() => castAccusationVote(true)}>GUILTY</button>
                <button className="ghost-button" onClick={() => castAccusationVote(false)}>NOT GUILTY</button>
              </div>
            </div>
          ) : null}

          {dayAction === "night-proposal" && currentDayVoter ? (
            <div className="vote-card">
              <p className="mafia-kicker">NIGHT PROPOSAL · {voteIndex + 1}/{living.length}</p>
              {voteIndex === 0 ? (
                <label>
                  제안자
                  <select
                    value={proposalProposerId}
                    onChange={(event) => setProposalProposerId(event.target.value)}
                  >
                    {living.map((player) => (
                      <option value={player.id} key={player.id}>{player.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <h2>{currentDayVoter.name}</h2>
              <p>Mafia Night를 지금 시작하는 데 동의합니까?</p>
              <div className="split-actions">
                <button className="night-button" onClick={() => castNightProposalVote(true)}>동의</button>
                <button className="ghost-button" onClick={() => castNightProposalVote(false)}>반대</button>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="mafia-panel log-panel">
          <div className="panel-heading">
            <div>
              <span>PUBLIC RECORD</span>
              <h2>공개 기록</h2>
            </div>
          </div>
          <ol>
            {[...game.log].reverse().map((entry) => (
              <li key={entry.id}>
                <span>D{entry.day}</span>
                <p>{entry.text}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      {error ? <p className="mafia-error floating-error">{error}</p> : null}

      <footer className="mafia-footer">
        <span>RULE LOCK · DAVIDOFF CLASSIC</span>
        <span>긴장 연출은 강화하되 정보와 승패 규칙은 바꾸지 않습니다.</span>
      </footer>
    </main>
  );
}
