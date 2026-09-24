import { useCallback, useEffect, useRef, useState } from "react";
import { GameScreen } from "./GameScreen";
import { OpenMmoCharacterLobby } from "./OpenMmoCharacterLobby";
import { loadOpenMmoBrowserCodec } from "../../../openmmo/browserCodec";
import type { OpenMmoNativeLaunchConfig } from "../../../openmmo/nativeLaunch";
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

export function OpenMmoBootstrap({
  nativeLaunchConfig,
}: {
  nativeLaunchConfig?: OpenMmoNativeLaunchConfig | null;
} = {}) {
  const params = new URLSearchParams(window.location.search);
  const [serverUrl, setServerUrl] = useState(
    nativeLaunchConfig?.serverUrl ??
      params.get("server") ??
      "ws://127.0.0.1:10006",
  );
  const [codecUrl, setCodecUrl] = useState(
    params.get("codec") ??
      import.meta.env.BASE_URL + "openmmo-wasm/onlinerpg_shared.js",
  );
  const [accountName, setAccountName] = useState(
    nativeLaunchConfig?.accountName ??
      params.get("account") ??
      "npc_idea2_player",
  );
  const [npcToken, setNpcToken] = useState(
    nativeLaunchConfig?.npcToken ?? "",
  );
  const [phase, setPhase] = useState<BootstrapPhase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<OpenMmoRuntime | null>(null);
  const activeRuntime = useRef<OpenMmoRuntime | null>(null);
  const nativeAutostartConsumed = useRef(false);

  const start = useCallback(async (
    launchConfig?: Pick<
      OpenMmoNativeLaunchConfig,
      "serverUrl" | "accountName" | "npcToken"
    >,
  ) => {
    const nextServerUrl = launchConfig?.serverUrl ?? serverUrl;
    const nextAccountName = launchConfig?.accountName ?? accountName;
    const nextNpcToken = launchConfig?.npcToken ?? npcToken;

    setError(null);

    let nextRuntime: OpenMmoRuntime | null = null;
    try {
      setPhase("loading_codec");
      const wasm = await loadOpenMmoBrowserCodec(codecUrl);

      nextRuntime = createOpenMmoRuntime({
        wasm,
        clientVersion: "idea2-m3-playable/0.1.0",
      });
      activeRuntime.current = nextRuntime;
      setRuntime(nextRuntime);
      nextRuntime.session.start();

      setPhase("connecting");
      nextRuntime.adapter.connect(nextServerUrl);
      await waitForConnected(nextRuntime);

      setPhase("authenticating");
      const auth = await nextRuntime.adapter.authenticateNpc(
        nextAccountName.trim(),
        nextNpcToken,
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
  }, [accountName, codecUrl, npcToken, serverUrl]);

  useEffect(() => {
    return () => {
      activeRuntime.current?.session.stop();
      activeRuntime.current?.adapter.disconnect();
      activeRuntime.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      !nativeLaunchConfig?.autostart ||
      nativeAutostartConsumed.current
    ) {
      return;
    }

    nativeAutostartConsumed.current = true;
    setServerUrl(nativeLaunchConfig.serverUrl);
    setAccountName(nativeLaunchConfig.accountName);
    setNpcToken(nativeLaunchConfig.npcToken);
    void start(nativeLaunchConfig);
  }, [nativeLaunchConfig, start]);

  const reset = () => {
    activeRuntime.current?.session.stop();
    activeRuntime.current?.adapter.disconnect();
    activeRuntime.current = null;
    setRuntime(null);
    setServerUrl(
      nativeLaunchConfig?.serverUrl ??
        params.get("server") ??
        "ws://127.0.0.1:10006",
    );
    setAccountName(
      nativeLaunchConfig?.accountName ??
        params.get("account") ??
        "npc_idea2_player",
    );
    setNpcToken(nativeLaunchConfig?.npcToken ?? "");
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
          <p className="eyebrow">REAL OPENMMO</p>
          <h1>Local Play Connection</h1>
        </div>
        <a className="runtime-link" href={window.location.pathname}>
          LOCAL MODE
        </a>
      </header>

      <section className="runtime-panel">
        <p className="runtime-panel__copy">
          실제 pinned OpenMMO 서버에 연결한다. Windows 로컬 플레이 런처를
          사용하면 서버와 인증 정보가 자동으로 연결되며 NPC token은 브라우저
          저장소나 URL에 저장하지 않는다.
        </p>

        {nativeLaunchConfig ? (
          <p className="runtime-panel__copy">
            LOCAL OPENMMO 런처 감지됨 · {nativeLaunchConfig.serverUrl}
          </p>
        ) : null}

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
            <span>PLAYER ACCOUNT</span>
            <input
              value={accountName}
              disabled={working}
              spellCheck={false}
              onChange={(event) => setAccountName(event.target.value)}
            />
          </label>

          <label>
            <span>LOCAL AUTH TOKEN</span>
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
            onClick={() => void start()}
          >
            {phase === "loading_codec"
              ? "CODEC LOADING"
              : phase === "connecting"
                ? "CONNECTING"
                : phase === "authenticating"
                  ? "AUTHENTICATING"
                  : "OPENMMO 플레이"}
          </button>

          {phase === "error" ? (
            <button type="button" className="text-button" onClick={reset}>
              다시 연결
            </button>
          ) : null}
        </div>

        {error ? <p className="runtime-error">{error}</p> : null}
      </section>
    </main>
  );
}
