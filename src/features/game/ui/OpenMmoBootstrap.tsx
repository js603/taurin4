import { useEffect, useRef, useState } from "react";
import { GameScreen } from "./GameScreen";
import { OpenMmoCharacterLobby } from "./OpenMmoCharacterLobby";
import { loadOpenMmoBrowserCodec } from "../../../openmmo/browserCodec";
import {
  createOpenMmoRuntime,
  type OpenMmoRuntime,
} from "../../../openmmo/runtime";

type BootstrapPhase =
  | "setup"
  | "loading_codec"
  | "connecting"
  | "authenticating"
  | "lobby"
  | "game"
  | "error";

function waitForConnected(runtime: OpenMmoRuntime, timeoutMs = 8_000) {
  if (runtime.adapter.getSnapshot().phase === "connected") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          "OpenMMO connection timeout: " +
            JSON.stringify(runtime.adapter.getSnapshot()),
        ),
      );
    }, timeoutMs);

    const unsubscribe = runtime.adapter.subscribe(() => {
      const snapshot = runtime.adapter.getSnapshot();
      if (snapshot.phase === "connected") {
        window.clearTimeout(timer);
        unsubscribe();
        resolve();
      } else if (snapshot.phase === "error") {
        window.clearTimeout(timer);
        unsubscribe();
        reject(
          new Error(snapshot.lastError ?? "OpenMMO connection failed"),
        );
      }
    });
  });
}

export function OpenMmoBootstrap() {
  const params = new URLSearchParams(window.location.search);
  const [serverUrl, setServerUrl] = useState(
    params.get("server") ?? "ws://127.0.0.1:10006",
  );
  const [codecUrl, setCodecUrl] = useState(
    params.get("codec") ??
      import.meta.env.BASE_URL + "openmmo-wasm/onlinerpg_shared.js",
  );
  const [accountName, setAccountName] = useState(
    params.get("account") ?? "npc_idea2_player",
  );
  const [npcToken, setNpcToken] = useState("");
  const [phase, setPhase] = useState<BootstrapPhase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<OpenMmoRuntime | null>(null);
  const activeRuntime = useRef<OpenMmoRuntime | null>(null);

  useEffect(() => {
    return () => {
      activeRuntime.current?.session.stop();
      activeRuntime.current?.adapter.disconnect();
      activeRuntime.current = null;
    };
  }, []);

  const start = async () => {
    setError(null);

    let nextRuntime: OpenMmoRuntime | null = null;
    try {
      setPhase("loading_codec");
      const wasm = await loadOpenMmoBrowserCodec(codecUrl);

      nextRuntime = createOpenMmoRuntime({
        wasm,
        clientVersion: "idea2-m2-app/0.1.0",
      });
      activeRuntime.current = nextRuntime;
      setRuntime(nextRuntime);
      nextRuntime.session.start();

      setPhase("connecting");
      nextRuntime.adapter.connect(serverUrl);
      await waitForConnected(nextRuntime);

      setPhase("authenticating");
      const auth = await nextRuntime.adapter.authenticateNpc(
        accountName.trim(),
        npcToken,
      );
      if (!auth.ok) {
        throw new Error(auth.message);
      }

      setPhase("lobby");
    } catch (cause) {
      nextRuntime?.session.stop();
      nextRuntime?.adapter.disconnect();
      activeRuntime.current = null;
      setRuntime(null);
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("error");
    }
  };

  const reset = () => {
    activeRuntime.current?.session.stop();
    activeRuntime.current?.adapter.disconnect();
    activeRuntime.current = null;
    setRuntime(null);
    setNpcToken("");
    setError(null);
    setPhase("setup");
  };

  if (phase === "game" && runtime) {
    return <GameScreen session={runtime.session} />;
  }

  if (phase === "lobby" && runtime) {
    return (
      <main className="runtime-shell">
        <header className="runtime-header">
          <div>
            <p className="eyebrow">REAL OPENMMO RUNTIME</p>
            <h1>Character Lobby</h1>
          </div>
          <button type="button" className="text-button" onClick={reset}>
            연결 종료
          </button>
        </header>

        <OpenMmoCharacterLobby
          adapter={runtime.adapter}
          onEntered={() => setPhase("game")}
        />
      </main>
    );
  }

  const working =
    phase === "loading_codec" ||
    phase === "connecting" ||
    phase === "authenticating";

  return (
    <main className="runtime-shell">
      <header className="runtime-header">
        <div>
          <p className="eyebrow">M2 OPENMMO BOOTSTRAP</p>
          <h1>Real Backend Connection</h1>
        </div>
        <a className="runtime-link" href={window.location.pathname}>
          LOCAL MODE
        </a>
      </header>

      <section className="runtime-panel">
        <p className="runtime-panel__copy">
          이 화면은 M2 개발/검증용이다. 실제 pinned OpenMMO WASM codec과
          OpenMMO 서버에 연결하며, NPC token은 메모리에만 유지하고 저장하지
          않는다.
        </p>

        <div className="runtime-fields">
          <label>
            <span>SERVER WEBSOCKET</span>
            <input
              value={serverUrl}
              disabled={working}
              spellCheck={false}
              onChange={(event) => setServerUrl(event.target.value)}
            />
          </label>

          <label>
            <span>PINNED WASM MODULE</span>
            <input
              value={codecUrl}
              disabled={working}
              spellCheck={false}
              onChange={(event) => setCodecUrl(event.target.value)}
            />
          </label>

          <label>
            <span>AUDIT ACCOUNT</span>
            <input
              value={accountName}
              disabled={working}
              spellCheck={false}
              onChange={(event) => setAccountName(event.target.value)}
            />
          </label>

          <label>
            <span>NPC TOKEN</span>
            <input
              type="password"
              value={npcToken}
              disabled={working}
              autoComplete="off"
              onChange={(event) => setNpcToken(event.target.value)}
            />
          </label>
        </div>

        <div className="runtime-actions">
          <button
            type="button"
            className="game-button game-button--primary"
            disabled={
              working ||
              !serverUrl.trim() ||
              !codecUrl.trim() ||
              !accountName.trim() ||
              !npcToken
            }
            onClick={start}
          >
            {phase === "loading_codec"
              ? "CODEC LOADING"
              : phase === "connecting"
                ? "CONNECTING"
                : phase === "authenticating"
                  ? "AUTHENTICATING"
                  : "OPENMMO 연결"}
          </button>

          {phase === "error" ? (
            <button type="button" className="text-button" onClick={reset}>
              다시 입력
            </button>
          ) : null}
        </div>

        {error ? <p className="runtime-error">{error}</p> : null}
      </section>
    </main>
  );
}
